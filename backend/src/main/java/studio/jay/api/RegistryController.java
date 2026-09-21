package studio.jay.api;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.jay.live.LiveStateService;
import studio.jay.registry.RegistryService;
import studio.jay.registry.RegistrySnapshot;
import studio.jay.stream.SseHub;

/**
 * 다시 읽기 (api-spec {@code POST /api/registry/rescan}, FR-001-AC4, 04-5·07 "다시 읽기").
 * Origin 규칙·브라우저 토큰 검사는 {@code OriginFilter}·{@code BrowserTokenFilter}가 {@code /api/*}에
 * 이미 적용한다(architecture.md §5) — 이 컨트롤러는 별도 인증 검사를 하지 않는다.
 */
@RestController
@RequestMapping("/api/registry")
public class RegistryController {

    private final RegistryService registryService;
    private final LiveStateService liveStateService;
    private final SseHub sseHub;

    public RegistryController(RegistryService registryService, LiveStateService liveStateService, SseHub sseHub) {
        this.registryService = registryService;
        this.liveStateService = liveStateService;
        this.sseHub = sseHub;
    }

    /**
     * 즉시 재스캔하고 새 {@code Registry}를 응답으로 돌려준다. 같은 결과를 SSE로도 방송해
     * 폴링(최대 1초)을 기다리지 않고 다른 탭에도 바로 반영한다(architecture.md §3.2).
     *
     * <p>방송을 {@link RegistryService#rescanNow(java.util.function.Consumer)}의 락 안에서 실행해
     * {@code FolderPoller}의 동시 재스캔과 경합해도 SSE {@code registry} 방송 순서가 {@code revision}
     * 순서를 따르게 한다(review NEEDS_FIX round 1: 동시 호출 시 revision 역행 방지).
     */
    @PostMapping("/rescan")
    public RegistrySnapshot rescan() {
        return registryService.rescanNow(registry -> sseHub.broadcast(registry, liveStateService.live()));
    }
}
