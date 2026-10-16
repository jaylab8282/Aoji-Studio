package studio.aoji.skills;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 가져오기 임시 데이터 정리 (ADR-84 결정 6): 기동 때 한 번, 그 뒤 10분마다 {@code <data>/skill-import/} 아래
 * 30분 지난 업로드 폴더를 지운다. 앱이 만든 임시 데이터만 지운다.
 */
@Component
public class SkillImportCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(SkillImportCleanupJob.class);
    private static final long INTERVAL_MS = 10 * 60 * 1000L;

    private final SkillImportService skillImportService;

    public SkillImportCleanupJob(SkillImportService skillImportService) {
        this.skillImportService = skillImportService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        run();
    }

    @Scheduled(fixedDelay = INTERVAL_MS, initialDelay = INTERVAL_MS)
    public void onSchedule() {
        run();
    }

    /** 지운 업로드 폴더 수(테스트·로그용). 실패해도 예외를 밖으로 내지 않는다. */
    public int run() {
        try {
            int deleted = skillImportService.deleteExpired();
            if (deleted > 0) {
                log.info("skill import cleanup: deleted {} expired uploads", deleted);
            }
            return deleted;
        } catch (RuntimeException e) {
            log.warn("skill import cleanup failed: {}", e.getClass().getSimpleName());
            return 0;
        }
    }
}
