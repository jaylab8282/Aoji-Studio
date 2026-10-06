package studio.aoji.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.config.BrowserTokenFilter;
import studio.aoji.files.DataDirectory;
import studio.aoji.files.RegularFileReader;

/**
 * 도우미 토큰 전달 (api-spec {@code GET /api/helper/token}, FR-013-AC8).
 * Origin 규칙({@code OriginFilter})에 더해 브라우저 토큰을 직접 검사한다.
 * {@code BrowserTokenFilter}는 GET 요청을 그대로 통과시키므로(변경 메서드만 검사),
 * api-spec이 이 엔드포인트에 명시한 {@code security: browserToken}은 컨트롤러가 처리한다.
 */
@RestController
public class HelperTokenController {

    private final DataDirectory dataDirectory;
    private final BrowserTokenFilter browserTokenFilter;
    private final RegularFileReader reader;

    public HelperTokenController(DataDirectory dataDirectory, BrowserTokenFilter browserTokenFilter,
            RegularFileReader reader) {
        this.dataDirectory = dataDirectory;
        this.browserTokenFilter = browserTokenFilter;
        this.reader = reader;
    }

    @GetMapping("/api/helper/token")
    public HelperTokenResponse getToken(
            @RequestHeader(value = "X-AojiStudio-Browser-Token", required = false) String browserToken) {
        if (!browserTokenFilter.matches(browserToken)) {
            throw ApiException.unauthorizedToken();
        }

        return new HelperTokenResponse(readToken());
    }

    /** {@code .aojistudio/helper-token}이 일반 파일일 때만 값을 준다. 아니면 null(ADR-61, NFR-07). */
    private String readToken() {
        return reader.read(dataDirectory.helperTokenFile(), true).token();
    }

    /** api-spec: {@code { token: string | null }}. */
    public record HelperTokenResponse(String token) {
    }
}
