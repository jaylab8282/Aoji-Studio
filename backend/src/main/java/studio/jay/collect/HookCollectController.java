package studio.jay.collect;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import studio.jay.events.EventRepository;
import studio.jay.events.EventRow;
import studio.jay.live.HookEventReceived;
import studio.jay.live.HookPayload;
import studio.jay.live.Masker;
import studio.jay.live.SummaryBuilder;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Claude Code hook 수집 (api-spec {@code POST /hooks/events}, FR-003).
 * Origin 규칙 없이 {@code X-JayStudio-Collect-Token} + {@code Content-Type: application/json}만
 * 검사한다(architecture.md §5, ADR-02). {@code /api/**}가 아니므로 {@code OriginFilter}·
 * {@code BrowserTokenFilter}를 거치지 않는다.
 *
 * <p>처리 순서(architecture.md §3.2): 인증 검증 → JSON 파싱 → 요약 계산({@code SummaryBuilder}) →
 * 마스킹({@code Masker}) → INSERT({@code EventRepository}) → {@code HookEventReceived} 발행 → 204.
 * 상태 전이({@code LiveStateService}, T-006)와 SSE 방송({@code SseHub}, T-007)은 이 이벤트를
 * 구독해서 붙인다 — 이 컨트롤러는 그 두 컴포넌트를 직접 호출하지 않으므로 수집 응답이 상태 계산·
 * 방송에 막히지 않는다(NFR-02, FR-003-AC3 100ms).
 *
 * <p>유효한 요청은 항상 204(FR-003-AC3). JSON 파싱 실패·{@code hook_event_name} 누락·
 * FR-003-AC9가 쓰지 않는 이벤트는 저장하지 않고도 204를 준다(FR-003-E1). 거부 사유는 로그에
 * {@code hook rejected: reason=<코드> event=<hook_event_name|->}만 남기고 본문 원문·토큰은
 * 남기지 않는다(conventions.md §4, NFR-08).
 */
@RestController
public class HookCollectController {

    private static final Logger log = LoggerFactory.getLogger(HookCollectController.class);

    private final CollectTokenStore collectTokenStore;
    private final ObjectMapper objectMapper;
    private final SummaryBuilder summaryBuilder;
    private final Masker masker;
    private final EventRepository eventRepository;
    private final ApplicationEventPublisher eventPublisher;

    public HookCollectController(
            CollectTokenStore collectTokenStore,
            ObjectMapper objectMapper,
            SummaryBuilder summaryBuilder,
            Masker masker,
            EventRepository eventRepository,
            ApplicationEventPublisher eventPublisher) {
        this.collectTokenStore = collectTokenStore;
        this.objectMapper = objectMapper;
        this.summaryBuilder = summaryBuilder;
        this.masker = masker;
        this.eventRepository = eventRepository;
        this.eventPublisher = eventPublisher;
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

        String body;
        try {
            body = StreamUtils.copyToString(request.getInputStream(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            reject("READ_ERROR", null);
            return ResponseEntity.noContent().build();
        }

        HookPayload payload;
        try {
            payload = objectMapper.readValue(body, HookPayload.class);
        } catch (JacksonException e) {
            reject("PARSE_ERROR", null);
            return ResponseEntity.noContent().build();
        }

        if (isBlank(payload.hookEventName()) || isBlank(payload.sessionId())) {
            reject("MISSING_REQUIRED_FIELD", payload.hookEventName());
            return ResponseEntity.noContent().build();
        }

        SummaryBuilder.Summary summary = summaryBuilder.build(payload);
        if (summary == null) {
            reject("UNSUPPORTED_EVENT", payload.hookEventName());
            return ResponseEntity.noContent().build();
        }

        String maskedSummary = masker.mask(summary.summary());
        EventRow inserted = eventRepository.insert(new EventRow(
                0,
                OffsetDateTime.now(),
                payload.hookEventName(),
                payload.sessionId(),
                payload.agentId(),
                payload.agentType(),
                payload.toolName(),
                payload.notificationType(),
                payload.cwd(),
                summary.kind(),
                summary.title(),
                maskedSummary));

        eventPublisher.publishEvent(new HookEventReceived(this, payload, inserted));

        return ResponseEntity.noContent().build();
    }

    private static void reject(String reasonCode, String hookEventName) {
        log.info("hook rejected: reason={} event={}", reasonCode, isBlank(hookEventName) ? "-" : hookEventName);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
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
