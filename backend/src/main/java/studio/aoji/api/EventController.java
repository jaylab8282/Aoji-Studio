package studio.aoji.api;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.events.EventRepository;
import studio.aoji.events.EventRow;
import studio.aoji.live.LiveStateService;

/**
 * 실시간 이벤트 조회 (api-spec {@code GET /api/events}, {@code GET /api/agents/{name}/events}).
 * 워크플로우 열·{@code agentLabel}은 읽는 시점에 {@code LiveStateService}가 registry·로비 번호로
 * 해석한다(ADR-09, FR-003-AC5). Origin 규칙은 {@code /api/*}에 걸린 {@code OriginFilter}가 이미
 * 적용한다(architecture.md §5).
 */
@RestController
@RequestMapping("/api")
public class EventController {

    private static final int DEFAULT_EVENTS_LIMIT = 50;
    private static final int DEFAULT_AGENT_EVENTS_LIMIT = 10;
    private static final int MAX_LIMIT = 50;

    private final EventRepository eventRepository;
    private final LiveStateService liveStateService;

    public EventController(EventRepository eventRepository, LiveStateService liveStateService) {
        this.eventRepository = eventRepository;
        this.liveStateService = liveStateService;
    }

    @GetMapping("/events")
    public EventsResponse recentEvents(@RequestParam(required = false) Integer limit) {
        List<EventRow> rows = eventRepository.findRecent(clamp(limit, DEFAULT_EVENTS_LIMIT));
        return new EventsResponse(rows.stream().map(liveStateService::toEventRowResponse).toList());
    }

    @GetMapping("/agents/{name}/events")
    public EventsResponse agentEvents(
            @PathVariable String name, @RequestParam(required = false) Integer limit) {
        List<EventRow> rows = eventRepository.findByAgentType(name, clamp(limit, DEFAULT_AGENT_EVENTS_LIMIT));
        return new EventsResponse(rows.stream().map(liveStateService::toEventRowResponse).toList());
    }

    private static int clamp(Integer requested, int defaultValue) {
        if (requested == null) {
            return defaultValue;
        }
        return Math.max(1, Math.min(MAX_LIMIT, requested));
    }
}
