package studio.jay.files;

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
