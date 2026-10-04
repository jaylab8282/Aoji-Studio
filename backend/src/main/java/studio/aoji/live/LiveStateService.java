package studio.aoji.live;

import jakarta.annotation.PostConstruct;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import studio.aoji.events.EventRepository;
import studio.aoji.events.EventRow;
import studio.aoji.events.EventRowResponse;
import studio.aoji.registry.AgentDef;
import studio.aoji.registry.RegistrySnapshot;
import studio.aoji.registry.RegistryService;

/**
 * hook 이벤트로 {@link LiveState}를 갱신하고, 호출 시점의 registry와 합쳐 api-spec {@link Live}를
 * 조립한다(architecture.md §3.2, §6.6, ADR-09). {@link #onHookEventReceived(HookEventReceived)}는
 * {@code HookCollectController}가 저장 직후 발행하는 이벤트를 구독해 요청 스레드에서 동기로 상태를
 * 계산한다(conventions.md §3 MUST, FR-003-AC3 100ms) — 락 범위는 상태 교체 한 번으로 최소화하고, SSE
 * 방송은 {@link LiveStateChanged}를 구독하는 별도 {@code @Async} 컴포넌트(T-007 {@code SseHub})가 맡는다.
 *
 * <p>{@code sessions}는 재시작 시 복원하지 않고(FR-004-AC2 마지막 행, NFR-09), {@code lastEventByAgent}·
 * {@code lastReceivedAt}·{@code everReceived}만 기동 시 DB에서 시드한다.
 */
@Component
public class LiveStateService {

    private final EventRepository eventRepository;
    private final RegistryService registryService;
    private final SessionStateMachine sessionStateMachine;
    private final ApplicationEventPublisher eventPublisher;
    private final Object lock = new Object();
    private final AtomicReference<LiveState> current = new AtomicReference<>(LiveState.empty());

    public LiveStateService(
            EventRepository eventRepository,
            RegistryService registryService,
            SessionStateMachine sessionStateMachine,
            ApplicationEventPublisher eventPublisher) {
        this.eventRepository = eventRepository;
        this.registryService = registryService;
        this.sessionStateMachine = sessionStateMachine;
        this.eventPublisher = eventPublisher;
    }

    @PostConstruct
    void init() {
        Map<String, EventRow> lastEventByAgent = eventRepository.findLastEventByAgent();
        OffsetDateTime lastReceivedAt = eventRepository.findLastReceivedAt().orElse(null);
        current.set(new LiveState(Map.of(), lastEventByAgent, Map.of(), 1, lastReceivedAt, lastReceivedAt != null));
    }

    /** 락 없이 현재 상태를 읽는다(테스트·내부 조립용). */
    public LiveState currentState() {
        return current.get();
    }

    @EventListener
    public void onHookEventReceived(HookEventReceived event) {
        HookPayload payload = event.payload();
        EventRow eventRow = event.eventRow();
        LiveState updated;
        synchronized (lock) {
            LiveState before = current.get();
            LiveState afterTransition = sessionStateMachine.apply(before, payload, eventRow.receivedAt());

            Map<String, EventRow> lastEventByAgent = afterTransition.lastEventByAgent();
            if (payload.agentType() != null && !payload.agentType().isBlank()) {
                Map<String, EventRow> copy = new LinkedHashMap<>(lastEventByAgent);
                copy.put(payload.agentType(), eventRow);
                lastEventByAgent = copy;
            }

            updated = new LiveState(
                    afterTransition.sessions(),
                    lastEventByAgent,
                    afterTransition.lobbyNumbers(),
                    afterTransition.nextLobbyNo(),
                    eventRow.receivedAt(),
                    true);
            current.set(updated);
        }
        eventPublisher.publishEvent(new LiveStateChanged(this, updated, eventRow));
    }

    /** api-spec {@code Live} (호출 시점 registry로 조립, ADR-09). */
    public Live live() {
        return assemble(current.get(), registryService.current());
    }

    /**
     * DB 행 → api-spec {@code EventRow}. {@code agentLabel}은 {@code agent_type}이 있으면 그대로,
     * 없으면 이 서버 수명 내 배정된 로비 번호({@code [세션 N]}) 또는 재시작 전 이벤트의 대체값
     * ({@code [세션]`)이다. {@code /api/events}·{@code /api/agents/{name}/events}(EventController)와
     * {@code Live.agents[name].lastEvent}가 모두 이 메서드로 계산한다.
     */
    public EventRowResponse toEventRowResponse(EventRow row) {
        boolean hasAgentType = row.agentType() != null && !row.agentType().isBlank();
        String agentLabel;
        String workflow;
        if (hasAgentType) {
            agentLabel = row.agentType();
            workflow = resolveWorkflow(row.agentType());
        } else {
            Integer lobbyNo = current.get().lobbyNumbers().get(row.sessionId());
            agentLabel = lobbyNo != null ? "[세션 " + lobbyNo + "]" : "[세션]";
            workflow = null;
        }
        return new EventRowResponse(
                row.id(),
                row.receivedAt(),
                row.hookEventName(),
                row.kind(),
                row.title(),
                row.summary(),
                row.sessionId(),
                row.agentId(),
                row.agentType(),
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

    private Live assemble(LiveState state, RegistrySnapshot registry) {
        Set<String> definedNames = new LinkedHashSet<>();
        for (AgentDef agentDef : registry.agents()) {
            definedNames.add(agentDef.name());
        }

        Map<String, List<SessionRecord>> byDefinedAgent = new LinkedHashMap<>();
        List<SessionRecord> lobbySessions = new ArrayList<>();
        List<SessionRecord> undefinedSubRecords = new ArrayList<>();

        for (SessionRecord record : state.sessions().values()) {
            if (!record.isSub() && !record.hasAgentType()) {
                lobbySessions.add(record);
            } else if (record.hasAgentType() && definedNames.contains(record.agentType())) {
                byDefinedAgent.computeIfAbsent(record.agentType(), k -> new ArrayList<>()).add(record);
            } else if (record.isSub() && record.hasAgentType()) {
                undefinedSubRecords.add(record);
            }
            // agent_id 없고 agent_type이 정의되지 않은 메인 세션은 표시 대상이 없어 건너뛴다(스펙 범위 밖).
        }

        Map<String, AgentLive> agents = new LinkedHashMap<>();
        for (AgentDef agentDef : registry.agents()) {
            agents.put(
                    agentDef.name(),
                    buildAgentLive(agentDef.name(), byDefinedAgent.getOrDefault(agentDef.name(), List.of()), state));
        }

        List<LobbyEntry> lobby = new ArrayList<>();
        lobbySessions.stream()
                .sorted(Comparator.comparing(r -> r.lobbyNo() == null ? Integer.MAX_VALUE : r.lobbyNo()))
                .forEach(r -> lobby.add(new LobbyEntry(
                        LobbyEntry.Kind.SESSION,
                        "[세션 " + r.lobbyNo() + "]",
                        r.status(),
                        r.sessionId(),
                        r.status() == Status.IDLE ? null : r.currentTool())));

        for (AgentDef agentDef : registry.agents()) {
            if (agentDef.workflow() != null) {
                continue;
            }
            List<SessionRecord> records = byDefinedAgent.getOrDefault(agentDef.name(), List.of());
            if (records.isEmpty()) {
                continue;
            }
            SessionRecord chosen = SessionStateMachine.choosePriority(records);
            lobby.add(new LobbyEntry(
                    LobbyEntry.Kind.AGENT,
                    agentDef.name(),
                    chosen.status(),
                    chosen.sessionId(),
                    chosen.status() == Status.IDLE ? null : chosen.currentTool()));
        }

        List<UndefinedSubagent> undefinedSubagents = new ArrayList<>();
        for (SessionRecord record : undefinedSubRecords) {
            SessionRecord parent = state.sessions().get(SessionKey.forSessionId(record.sessionId()));
            String parentAgentName = null;
            String parentLabel;
            if (parent != null && parent.hasAgentType()) {
                parentAgentName = definedNames.contains(parent.agentType()) ? parent.agentType() : null;
                parentLabel = parent.agentType();
            } else if (parent != null) {
                parentLabel = "[세션 " + parent.lobbyNo() + "]";
            } else {
                parentLabel = "[세션]";
            }
            undefinedSubagents.add(new UndefinedSubagent(
                    record.agentId(),
                    record.agentType(),
                    record.sessionId(),
                    record.status(),
                    record.status() == Status.IDLE ? null : record.currentTool(),
                    parentAgentName,
                    parentLabel,
                    record.startedAt()));
        }

        return new Live(state.lastReceivedAt(), state.everReceived(), agents, lobby, undefinedSubagents);
    }

    private AgentLive buildAgentLive(String name, List<SessionRecord> records, LiveState state) {
        EventRow lastEvent = state.lastEventByAgent().get(name);
        EventRowResponse lastEventResponse = lastEvent == null ? null : toEventRowResponse(lastEvent);
        OffsetDateTime lastEventAt = lastEvent == null ? null : lastEvent.receivedAt();

        if (records.isEmpty()) {
            return new AgentLive(name, Status.IDLE, null, null, 0, null, null, lastEventAt, lastEventResponse);
        }

        SessionRecord chosen = SessionStateMachine.choosePriority(records);
        SessionRecord ownMain = records.stream().filter(r -> !r.isSub()).findFirst().orElse(null);
        int childCount = ownMain == null
                ? 0
                : (int) state.sessions().values().stream()
                        .filter(SessionRecord::isSub)
                        .filter(r -> r.sessionId().equals(ownMain.sessionId()))
                        .count();
        String parentLabel = chosen.isSub() ? parentLabelFor(chosen, state) : null;

        return new AgentLive(
                name,
                chosen.status(),
                chosen.status() == Status.IDLE ? null : chosen.currentTool(),
                chosen.startedAt(),
                childCount,
                chosen.cwd(),
                parentLabel,
                lastEventAt,
                lastEventResponse);
    }

    private String parentLabelFor(SessionRecord sub, LiveState state) {
        SessionRecord parent = state.sessions().get(SessionKey.forSessionId(sub.sessionId()));
        if (parent == null) {
            return "[세션]";
        }
        return parent.hasAgentType() ? parent.agentType() : "[세션 " + parent.lobbyNo() + "]";
    }
}
