package studio.jay.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * {@code @Scheduled} 작업 활성화 (architecture.md §3.1). {@code EventRetentionJob}(매시, T-005)과
 * {@code FolderPoller}(1초 폴링, T-004)가 이 설정에 의존한다.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
