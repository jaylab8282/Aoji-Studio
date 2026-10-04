package studio.aoji.api;

import java.nio.file.Path;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.config.BrowserTokenFilter;
import studio.aoji.files.DataDirectory;
import studio.aoji.legacy.HelperTokenReader;
import studio.aoji.legacy.LegacyNames;
import studio.aoji.legacy.LegacyWarnings;

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
    private final HelperTokenReader reader;
    private final LegacyWarnings warnings;

    public HelperTokenController(DataDirectory dataDirectory, BrowserTokenFilter browserTokenFilter,
            HelperTokenReader reader, LegacyWarnings warnings) {
        this.dataDirectory = dataDirectory;
        this.browserTokenFilter = browserTokenFilter;
        this.reader = reader;
        this.warnings = warnings;
    }

    @GetMapping("/api/helper/token")
    public HelperTokenResponse getToken(
            @RequestHeader(value = "X-AojiStudio-Browser-Token", required = false) String browserToken) {
        if (!browserTokenFilter.matches(browserToken)) {
            throw ApiException.unauthorizedToken();
        }

        return new HelperTokenResponse(readToken());
    }

    /**
     * ① 데이터 폴더의 helper-token(일반 파일일 때만) → ② 데이터 폴더가 새 폴더일 때만 옛 폴더의 helper-token(+ 경고)
     * → ③ null (ADR-57). 조건이 맞지 않으면 "없음"으로 처리하고 경고에는 사유만 남긴다.
     */
    private String readToken() {
        HelperTokenReader.Outcome primary = reader.read(dataDirectory.helperTokenFile(), true);
        if (primary.token() != null) {
            return primary.token();
        }
        if (dataDirectory.legacyReadOnly()) {
            return null;
        }
        Path legacyFile = dataDirectory.mountRoot().resolve(LegacyNames.LEGACY_DATA_DIR).resolve(DataDirectory.HELPER_TOKEN);
        HelperTokenReader.Outcome legacy = reader.read(legacyFile, true);
        if (legacy.token() != null) {
            warnings.helperTokenFallback();
            return legacy.token();
        }
        if (legacy.reason() != null) {
            warnings.helperTokenNotRead(legacy.reason());
        }
        return null;
    }

    /** api-spec: {@code { token: string | null }}. */
    public record HelperTokenResponse(String token) {
    }
}
