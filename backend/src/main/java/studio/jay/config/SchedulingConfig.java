package studio.jay.config;

import java.util.concurrent.Executor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * {@code @Scheduled} 작업 활성화 (architecture.md §3.1). {@code EventRetentionJob}(매시, T-005)과
 * {@code FolderPoller}(1초 폴링, T-004)가 이 설정에 의존한다. {@code SseHub}의 heartbeat(15초, T-007)도
 * {@code @Scheduled}로 여기 등록된다.
 *
 * <p>{@code @Async}도 여기서 활성화한다. hook 처리(요청 스레드에서 검증·마스킹·INSERT·상태 전이)와
 * SSE 방송을 분리하기 위해(conventions.md §3 MUST, FR-003-AC3 100ms) 단일 스레드 실행기 하나로
 * {@code SseHub}의 {@code @Async} 리스너를 직렬 실행한다 — 방송 순서(event → live)가 실행기 스레드
 * 순서에 의존하므로 스레드 풀을 늘리지 않는다.
 */
@Configuration
@EnableScheduling
@EnableAsync
public class SchedulingConfig implements AsyncConfigurer {

    private static final Logger log = LoggerFactory.getLogger(SchedulingConfig.class);

    @Override
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(1000);
        executor.setThreadNamePrefix("sse-broadcast-");
        executor.initialize();
        return executor;
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        // 인자(params)에는 이벤트 본문이 들어올 수 있어 로그에 남기지 않는다(NFR-08).
        return (ex, method, params) -> log.warn("async task failed: method={}", method.getName(), ex);
    }
}
