package studio.jay.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import studio.jay.config.AppProperties;
import studio.jay.config.BrowserTokenFilter;

/**
 * 도우미 토큰 전달 (api-spec {@code GET /api/helper/token}, FR-013-AC8).
 * Origin 규칙({@code OriginFilter})에 더해 브라우저 토큰을 직접 검사한다.
 * {@code BrowserTokenFilter}는 GET 요청을 그대로 통과시키므로(변경 메서드만 검사),
 * api-spec이 이 엔드포인트에 명시한 {@code security: browserToken}은 컨트롤러가 처리한다.
 */
@RestController
public class HelperTokenController {

    private final AppProperties appProperties;
    private final BrowserTokenFilter browserTokenFilter;

    public HelperTokenController(AppProperties appProperties, BrowserTokenFilter browserTokenFilter) {
        this.appProperties = appProperties;
        this.browserTokenFilter = browserTokenFilter;
    }

    @GetMapping("/api/helper/token")
    public HelperTokenResponse getToken(
            @RequestHeader(value = "X-JayStudio-Browser-Token", required = false) String browserToken) {
        if (!browserTokenFilter.matches(browserToken)) {
            throw ApiException.unauthorizedToken();
        }

        Path tokenFile = Path.of(appProperties.getMountPath(), ".jaystudio", "helper-token");
        if (!Files.exists(tokenFile)) {
            return new HelperTokenResponse(null);
        }
        try {
            String content = Files.readString(tokenFile, StandardCharsets.UTF_8).strip();
            return new HelperTokenResponse(content.isEmpty() ? null : content);
        } catch (IOException e) {
            throw ApiException.ioFailed("도우미 토큰 파일을 읽을 수 없습니다");
        }
    }

    /** api-spec: {@code { token: string | null }}. */
    public record HelperTokenResponse(String token) {
    }
}
