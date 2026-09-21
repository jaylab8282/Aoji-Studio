package studio.jay.files;

import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/**
 * 전역 단일 쓰기 락 (architecture.md §3.1, ADR-08).
 *
 * <p>모든 파일 변경 API(T-008~T-011)는 검증 → {@link AtomicFileWriter} 쓰기 → 재스캔 → SSE 방송을
 * 이 락 안에서 실행한다. 탭 여러 개가 동시에 워크플로우·에이전트를 조작해도 파일 경합·중복 생성이
 * 일어나지 않는다. Spring 싱글톤 빈이므로 애플리케이션 전체에서 {@link ReentrantLock} 인스턴스
 * 하나를 공유한다(주석의 "전역"은 이 뜻이다).
 */
@Component
public class WriteLock {

    private final ReentrantLock lock = new ReentrantLock();

    /**
     * {@code action}을 락 안에서 실행하고 결과를 돌려준다. {@code action}이 던지는 예외(예:
     * {@code studio.jay.api.ApiException})는 락을 해제한 뒤 그대로 다시 던져진다.
     */
    public <T> T runLocked(Supplier<T> action) {
        lock.lock();
        try {
            return action.get();
        } finally {
            lock.unlock();
        }
    }
}
