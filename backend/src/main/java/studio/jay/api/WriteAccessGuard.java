package studio.jay.api;

import org.springframework.stereotype.Component;
import studio.jay.registry.RegistryService;

/**
 * 읽기 전용 마운트 공통 검사 (architecture.md §9 "읽기 전용 마운트", FR-001-E2, D-003).
 * 모든 파일 변경 API(T-008~T-011)는 검증을 시작하기 전에 {@link #assertWritable()}을 호출한다.
 * {@code writable=false}(읽기 전용 마운트)여도 서버는 기동되지만 변경 API만 403 {@code READ_ONLY}로
 * 막는다.
 */
@Component
public class WriteAccessGuard {

    private final RegistryService registryService;

    public WriteAccessGuard(RegistryService registryService) {
        this.registryService = registryService;
    }

    public void assertWritable() {
        if (!registryService.current().writable()) {
            throw ApiException.readOnly();
        }
    }
}
