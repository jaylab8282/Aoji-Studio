package studio.jay.events;

import java.time.OffsetDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 이벤트 30일 보존 (architecture.md §6.5, FR-003-AC7). 기동 직후 1회 + 매시 정각 실행한다.
 */
@Component
public class EventRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(EventRetentionJob.class);
    private static final int RETENTION_DAYS = 30;

    private final EventRepository eventRepository;

    public EventRetentionJob(EventRepository eventRepository) {
        this.eventRepository = eventRepository;
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
        OffsetDateTime cutoff = OffsetDateTime.now().minusDays(RETENTION_DAYS);
        int deleted = eventRepository.deleteOlderThan(cutoff);
        if (deleted > 0) {
            log.info("event retention: deleted {} rows older than {} days", deleted, RETENTION_DAYS);
        }
        return deleted;
    }
}
