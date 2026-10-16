package studio.aoji.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/**
 * 전역 단일 쓰기 락 (architecture.md §3.1, ADR-08).
 *
 * <p>AC·E ID 태그가 없는 이유: 사용자 요구가 아니라 인프라 보증이다. 모든 쓰기 기능(워크플로우·에이전트 변경 API)이
 * "한 번에 하나의 쓰기"를 이 락에 기댄다. 그 기능의 AC는 각 컨트롤러
 * 테스트가 증명하고, 이 테스트는 락 자체(결과 반환·예외 뒤 해제·동시 직렬화)만 고정한다.
 */
class WriteLockTest {

    private final WriteLock writeLock = new WriteLock();

    @Test
    void returnsActionResult() {
        String result = writeLock.runLocked(() -> "ok");

        assertThat(result).isEqualTo("ok");
    }

    @Test
    void releasesLockAfterExceptionSoNextCallerCanProceed() {
        assertThatThrownBy(() -> writeLock.runLocked(() -> {
                    throw new IllegalStateException("boom");
                }))
                .isInstanceOf(IllegalStateException.class);

        String result = writeLock.runLocked(() -> "after-exception");
        assertThat(result).isEqualTo("after-exception");
    }

    @Test
    void serializesConcurrentCallersOneAtATime() throws InterruptedException {
        // 동시에 여러 스레드가 runLocked를 호출해도 임계 구역 안에 하나만 들어간다(ADR-08 "단일 쓰기 락").
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger concurrentInside = new AtomicInteger(0);
        AtomicInteger maxObservedConcurrent = new AtomicInteger(0);

        Runnable task = () -> {
            ready.countDown();
            try {
                go.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            writeLock.runLocked(() -> {
                int current = concurrentInside.incrementAndGet();
                maxObservedConcurrent.updateAndGet(max -> Math.max(max, current));
                try {
                    Thread.sleep(5);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                concurrentInside.decrementAndGet();
                return null;
            });
        };

        for (int i = 0; i < threads; i++) {
            pool.submit(task);
        }
        ready.await();
        go.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(5, TimeUnit.SECONDS)).isTrue();

        assertThat(maxObservedConcurrent.get()).isEqualTo(1);
    }
}
