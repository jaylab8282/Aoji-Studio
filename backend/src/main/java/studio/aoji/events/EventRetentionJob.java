package studio.aoji.events;

import java.time.Clock;
import java.time.OffsetDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 이벤트 30일 보존 (architecture.md §6.5, FR-003-AC7). 기동 직후 1회 + 매시 정각 실행한다.
 * {@code events}만 지운다 — 일별 집계 등 v1.2.0 테이블에는 DELETE가 없다(ADR-80 결정 8, FR-019-AC4).
 */
@Component
public class EventRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(EventRetentionJob.class);
    private static final int RETENTION_DAYS = 30;

    private final EventRepository eventRepository;
    private final Clock clock;

    /** 운영 생성자: 시스템 시계. 공용 {@code Clock} 빈(휴지통 접미사용, 테스트가 교체함)과 분리해 둔다. */
    @org.springframework.beans.factory.annotation.Autowired
    public EventRetentionJob(EventRepository eventRepository) {
        this(eventRepository, Clock.systemDefaultZone());
    }

    /** 테스트용: 고정 시계로 31일 뒤 삭제를 재현한다. */
    EventRetentionJob(EventRepository eventRepository, Clock clock) {
        this.eventRepository = eventRepository;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        runRetention();
    }

    @Scheduled(cron = "0 0 * * * *")
    public void onSchedule() {
        runRetention();
    }

    /** 30일이 지난 이벤트를 지운다. 지운 행 수를 돌려준다(테스트·로그용). */
    public int runRetention() {
        OffsetDateTime cutoff = OffsetDateTime.now(clock).minusDays(RETENTION_DAYS);
        int deleted = eventRepository.deleteOlderThan(cutoff);
        if (deleted > 0) {
            log.info("event retention: deleted {} rows older than {} days", deleted, RETENTION_DAYS);
        }
        return deleted;
    }
}
