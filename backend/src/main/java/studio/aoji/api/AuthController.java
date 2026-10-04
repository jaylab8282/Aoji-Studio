package studio.aoji.api;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.config.BrowserTokenFilter;

/**
 * 브라우저 토큰 발급 (api-spec {@code GET /api/auth/browser-token}, ADR-01).
 * Origin 규칙만 검사한다({@code OriginFilter}가 이미 {@code /api/**}에 적용됨).
 */
@RestController
public class AuthController {

    private final BrowserTokenFilter browserTokenFilter;

    public AuthController(BrowserTokenFilter browserTokenFilter) {
        this.browserTokenFilter = browserTokenFilter;
    }

    @GetMapping("/api/auth/browser-token")
    public Map<String, String> browserToken() {
        return Map.of("token", browserTokenFilter.token());
    }
}
