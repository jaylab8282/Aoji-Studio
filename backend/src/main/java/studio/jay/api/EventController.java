package studio.jay.api;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import studio.jay.events.EventRepository;
import studio.jay.events.EventRow;
import studio.jay.registry.AgentDef;
import studio.jay.registry.RegistryService;

/**
 * 실시간 이벤트 조회 (api-spec {@code GET /api/events}, {@code GET /api/agents/{name}/events}).
 * 워크플로우 열은 저장하지 않고 읽는 시점에 registry로 해석한다(ADR-09). Origin 규칙은
 * {@code /api/*}에 걸린 {@code OriginFilter}가 이미 적용한다(architecture.md §5).
 */
@RestController
@RequestMapping("/api")
public class EventController {

    private static final int DEFAULT_EVENTS_LIMIT = 50;
    private static final int DEFAULT_AGENT_EVENTS_LIMIT = 10;
    private static final int MAX_LIMIT = 50;

    private final EventRepository eventRepository;
    private final RegistryService registryService;

    public EventController(EventRepository eventRepository, RegistryService registryService) {
        this.eventRepository = eventRepository;
        this.registryService = registryService;
    }

    @GetMapping("/events")
    public EventsResponse recentEvents(@RequestParam(required = false) Integer limit) {
        List<EventRow> rows = eventRepository.findRecent(clamp(limit, DEFAULT_EVENTS_LIMIT));
        return new EventsResponse(toResponses(rows));
    }

    @GetMapping("/agents/{name}/events")
    public EventsResponse agentEvents(
            @PathVariable String name, @RequestParam(required = false) Integer limit) {
        List<EventRow> rows = eventRepository.findByAgentType(name, clamp(limit, DEFAULT_AGENT_EVENTS_LIMIT));
        return new EventsResponse(toResponses(rows));
    }

    private List<EventRowResponse> toResponses(List<EventRow> rows) {
        return rows.stream().map(this::toResponse).toList();
    }

    private EventRowResponse toResponse(EventRow row) {
        String agentType = row.agentType();
        boolean hasAgentType = agentType != null && !agentType.isBlank();
        String agentLabel = hasAgentType ? agentType : "[세션]";
        String workflow = hasAgentType ? resolveWorkflow(agentType) : null;
        return new EventRowResponse(
                row.id(),
                row.receivedAt(),
                row.hookEventName(),
                row.kind(),
                row.title(),
                row.summary(),
                row.sessionId(),
                row.agentId(),
                agentType,
                agentLabel,
                row.toolName(),
                workflow);
    }

    private String resolveWorkflow(String agentType) {
        for (AgentDef agentDef : registryService.current().agents()) {
            if (agentDef.name().equals(agentType)) {
                return agentDef.workflow();
            }
        }
        return null;
    }

    private static int clamp(Integer requested, int defaultValue) {
        if (requested == null) {
            return defaultValue;
        }
        return Math.max(1, Math.min(MAX_LIMIT, requested));
    }
}
