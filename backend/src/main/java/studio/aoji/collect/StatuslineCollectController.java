package studio.aoji.collect;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.statusline.StatuslineLast;
import studio.aoji.statusline.StatuslinePayloadParser;
import studio.aoji.statusline.StatuslineStore;
import studio.aoji.usage.UsageArea;
import studio.aoji.usage.UsageChangedNotifier;

/**
 * 상태줄 연동 값 수집 (api-spec {@code POST /hooks/statusline}, FR-027-AC1·AC8·E2·E3, ADR-83 결정 4·5).
 * 인증은 {@code /hooks/events}와 같다: {@code Content-Type: application/json}이 아니면 415, 수집 토큰이 없거나 다르면
 * 401(저장 0, 로그 0). 유효하면 마지막 값 한 행을 덮어쓰고 {@code usage-changed}({@code limits}·{@code settings})를
 * 알린 뒤 204다. 형식이 틀리면 저장하지 않고 204이며 로그에는 {@code statusline rejected: reason=<코드>}만 남긴다.
 */
@RestController
public class StatuslineCollectController {

    /** 상태줄 본문은 수백 바이트다. 이보다 크면 읽지 않고 거부한다. */
    static final int MAX_BODY_BYTES = 64 * 1024;
    private static final Logger log = LoggerFactory.getLogger(StatuslineCollectController.class);

    private final CollectTokenStore collectTokenStore;
    private final StatuslinePayloadParser parser;
    private final StatuslineStore store;
    private final UsageChangedNotifier usageChangedNotifier;
    private final Clock clock;

    public StatuslineCollectController(
            CollectTokenStore collectTokenStore,
            StatuslinePayloadParser parser,
            StatuslineStore store,
            UsageChangedNotifier usageChangedNotifier,
            Clock clock) {
        this.collectTokenStore = collectTokenStore;
        this.parser = parser;
        this.store = store;
        this.usageChangedNotifier = usageChangedNotifier;
        this.clock = clock;
    }

    @PostMapping("/hooks/statusline")
    public ResponseEntity<Void> collect(
            @RequestHeader(value = "X-AojiStudio-Collect-Token", required = false) String collectToken,
            HttpServletRequest request) {
        if (!isJsonContentType(request.getContentType())) {
            return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).build();
        }
        if (!collectTokenStore.matches(collectToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String body;
        try {
            body = readBody(request.getInputStream());
        } catch (IOException e) {
            reject("READ_ERROR");
            return ResponseEntity.noContent().build();
        }
        if (body == null) {
            reject("TOO_LARGE");
            return ResponseEntity.noContent().build();
        }

        StatuslinePayloadParser.Result result = parser.parse(body);
        if (!result.accepted()) {
            reject(result.rejectReason());
            return ResponseEntity.noContent().build();
        }
        StatuslinePayloadParser.Parsed parsed = result.parsed();
        store.save(new StatuslineLast(
                parsed.plan(),
                parsed.fiveHour(),
                parsed.sevenDay(),
                clock.instant().truncatedTo(ChronoUnit.MILLIS)));
        usageChangedNotifier.markChanged(List.of(UsageArea.LIMITS, UsageArea.SETTINGS));
        return ResponseEntity.noContent().build();
    }

    /** 최대 {@link #MAX_BODY_BYTES}까지 읽는다. 넘으면 null. */
    private static String readBody(InputStream in) throws IOException {
        byte[] bytes = in.readNBytes(MAX_BODY_BYTES + 1);
        return bytes.length > MAX_BODY_BYTES ? null : new String(bytes, StandardCharsets.UTF_8);
    }

    private static void reject(String reasonCode) {
        log.info("statusline rejected: reason={}", reasonCode);
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
