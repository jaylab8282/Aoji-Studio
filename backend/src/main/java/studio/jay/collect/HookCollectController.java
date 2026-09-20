package studio.jay.collect;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Claude Code hook 수집 (api-spec {@code POST /hooks/events}, FR-003).
 * Origin 규칙 없이 {@code X-JayStudio-Collect-Token} + {@code Content-Type: application/json}만 검사한다
 * (architecture.md §5, ADR-02). {@code /api/**}가 아니므로 {@code OriginFilter}·{@code BrowserTokenFilter}를
 * 거치지 않는다.
 *
 * <p><b>T-002 범위:</b> 인증 검증만 구현한다. 검증을 통과해도 마스킹·요약·저장(INSERT)·상태 전이·SSE 방송은
 * 하지 않고 204만 돌려준다(저장 없음). 실제 처리는 T-005({@code HookPayload}, {@code SummaryBuilder},
 * {@code Masker}, {@code EventRepository}, {@code LiveStateService})에서 채운다.
 */
@RestController
public class HookCollectController {

    private final CollectTokenStore collectTokenStore;

    public HookCollectController(CollectTokenStore collectTokenStore) {
        this.collectTokenStore = collectTokenStore;
    }

    @PostMapping(value = "/hooks/events")
    public ResponseEntity<Void> collect(
            @RequestHeader(value = "X-JayStudio-Collect-Token", required = false) String collectToken,
            HttpServletRequest request) {

        if (!isJsonContentType(request.getContentType())) {
            return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).build();
        }
        if (!collectTokenStore.matches(collectToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // T-005 구현 예정: 마스킹 → 요약 → INSERT → LiveStateService.apply → 비동기 SSE 방송.
        // 이 태스크(T-002)는 인증 검증까지만 담당하므로 검증 통과 시에도 저장하지 않는다.
        return ResponseEntity.noContent().build();
    }

    private static boolean isJsonContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return false;
        }
        try {
            return MediaType.parseMediaType(contentType).isCompatibleWith(MediaType.APPLICATION_JSON);
        } catch (org.springframework.http.InvalidMediaTypeException e) {
            return false;
        }
    }
}
