package studio.aoji.live;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 세션 단위 상태 전이 (api-spec {@code Status}, FR-004-AC2 표 + ADR-10). {@link #apply(LiveState,
 * HookPayload, OffsetDateTime)}는 순수 함수다: 입력 상태 + 이벤트 + 시각만으로 새 상태를 정하고
 * 시계·DB에 의존하지 않는다(conventions.md §3, 시각은 {@code at} 인자로 받는다).
 *
 * <p>{@code lastEventByAgent}·{@code lastReceivedAt}·{@code everReceived}는 이 클래스가 건드리지
 * 않고 그대로 돌려준다 — {@code LiveStateService}가 별도로 갱신한다. 이 클래스는 {@code sessions}·
 * {@code lobbyNumbers}·{@code nextLobbyNo}만 계산한다.
 */
@Component
public class SessionStateMachine {

    private final Masker masker;

    public SessionStateMachine(Masker masker) {
        this.masker = masker;
    }

    public LiveState apply(LiveState state, HookPayload payload, OffsetDateTime at) {
        Map<SessionKey, SessionRecord> sessions = new LinkedHashMap<>(state.sessions());
        Map<String, Integer> lobbyNumbers = new LinkedHashMap<>(state.lobbyNumbers());
        int[] nextLobbyNo = {state.nextLobbyNo()};

        boolean isSub = notBlank(payload.agentId());
        String event = payload.hookEventName();

        if (isSub && !"SubagentStop".equals(event) && !"SessionEnd".equals(event)) {
            ensureParentSession(sessions, lobbyNumbers, nextLobbyNo, payload, at);
        }

        switch (event) {
            case "SessionStart" -> handleSessionStart(sessions, lobbyNumbers, nextLobbyNo, payload, at);
            case "UserPromptSubmit" ->
                    upsert(sessions, lobbyNumbers, nextLobbyNo, payload, at, Status.RUNNING, null, false, false);
            case "SubagentStart" ->
                    upsert(sessions, lobbyNumbers, nextLobbyNo, payload, at, Status.RUNNING, null, true, true);
            case "PreToolUse" -> handlePreToolUse(sessions, lobbyNumbers, nextLobbyNo, payload, at);
            case "PermissionRequest" ->
                    upsert(sessions, lobbyNumbers, nextLobbyNo, payload, at, Status.WAITING, null, false, false);
            case "Notification" -> {
                if ("permission_prompt".equals(payload.notificationType())) {
                    upsert(sessions, lobbyNumbers, nextLobbyNo, payload, at, Status.WAITING, null, false, false);
                }
                // 그 외 notification_type → 상태 변경 없음(FR-004-AC2)
            }
            case "PostToolUse", "PostToolUseFailure", "PermissionDenied" ->
                    upsert(sessions, lobbyNumbers, nextLobbyNo, payload, at, Status.RUNNING, null, false, false);
            case "Stop" -> handleStop(sessions, lobbyNumbers, nextLobbyNo, payload, at);
            case "SubagentStop" -> sessions.remove(SessionKey.of(payload));
            case "SessionEnd" ->
                    sessions.entrySet().removeIf(e -> payload.sessionId().equals(e.getValue().sessionId()));
            default -> {
                // FR-003-AC9가 쓰지 않는 이벤트는 HookCollectController가 걸러내므로 여기 도달하지 않는다.
            }
        }

        return new LiveState(
                sessions, state.lastEventByAgent(), lobbyNumbers, nextLobbyNo[0], state.lastReceivedAt(),
                state.everReceived());
    }

    /** FR-004-AC3: 같은 에이전트의 여러 세션 중 표시할 하나를 고른다(권한·입력 대기 &gt; 작업 중 &gt; 대기, 동률이면 최신). */
    public static SessionRecord choosePriority(List<SessionRecord> records) {
        SessionRecord best = null;
        for (SessionRecord candidate : records) {
            if (best == null) {
                best = candidate;
                continue;
            }
            int cmp = Integer.compare(candidate.status().priorityRank(), best.status().priorityRank());
            if (cmp > 0 || (cmp == 0 && candidate.lastEventAt().isAfter(best.lastEventAt()))) {
                best = candidate;
            }
        }
        return best;
    }

    private void handleSessionStart(
            Map<SessionKey, SessionRecord> sessions,
            Map<String, Integer> lobbyNumbers,
            int[] nextLobbyNo,
            HookPayload payload,
            OffsetDateTime at) {
        SessionKey key = SessionKey.of(payload);
        if (notBlank(payload.agentType())) {
            // ADR-10: 같은 agent_type의 모든 레코드(메인·서브)를 정리한 뒤 새 레코드.
            sessions.entrySet().removeIf(e -> payload.agentType().equals(e.getValue().agentType()));
            sessions.put(key, new SessionRecord(
                    key, payload.sessionId(), payload.agentId(), payload.agentType(), Status.IDLE, null, at,
                    payload.cwd(), at, null));
        } else {
            sessions.remove(key);
            Integer lobbyNo = assignLobbyNo(payload.sessionId(), lobbyNumbers, nextLobbyNo);
            sessions.put(key, new SessionRecord(
                    key, payload.sessionId(), null, null, Status.IDLE, null, at, payload.cwd(), at, lobbyNo));
        }
    }

    private void handlePreToolUse(
            Map<SessionKey, SessionRecord> sessions,
            Map<String, Integer> lobbyNumbers,
            int[] nextLobbyNo,
            HookPayload payload,
            OffsetDateTime at) {
        String toolName = payload.toolName() == null ? "" : payload.toolName();
        boolean isAskUserQuestion = "AskUserQuestion".equals(toolName);
        String maskedTarget = masker.mask(SummaryBuilder.extractTarget(payload));
        ToolRef toolRef = new ToolRef(toolName, maskedTarget);
        Status status = isAskUserQuestion ? Status.WAITING : Status.RUNNING;
        upsert(sessions, lobbyNumbers, nextLobbyNo, payload, at, status, toolRef, false, false);
    }

    private void handleStop(
            Map<SessionKey, SessionRecord> sessions,
            Map<String, Integer> lobbyNumbers,
            int[] nextLobbyNo,
            HookPayload payload,
            OffsetDateTime at) {
        SessionKey key = SessionKey.of(payload);
        SessionRecord existing = sessions.get(key);
        OffsetDateTime startedAt = existing != null ? existing.startedAt() : at;
        Integer lobbyNo = existing != null ? existing.lobbyNo() : lobbyNoForNewRecord(payload, lobbyNumbers, nextLobbyNo);
        sessions.put(key, new SessionRecord(
                key, payload.sessionId(), payload.agentId(), payload.agentType(), Status.IDLE, null, startedAt,
                payload.cwd(), at, lobbyNo));
    }

    /** UserPromptSubmit·SubagentStart·PreToolUse류 공용 생성/갱신. */
    private static SessionRecord upsert(
            Map<SessionKey, SessionRecord> sessions,
            Map<String, Integer> lobbyNumbers,
            int[] nextLobbyNo,
            HookPayload payload,
            OffsetDateTime at,
            Status status,
            ToolRef toolRefOrNull,
            boolean resetTool,
            boolean resetStartedAt) {
        SessionKey key = SessionKey.of(payload);
        SessionRecord existing = sessions.get(key);
        OffsetDateTime startedAt = (existing == null || resetStartedAt) ? at : existing.startedAt();
        ToolRef currentTool = toolRefOrNull != null
                ? toolRefOrNull
                : (resetTool || existing == null ? null : existing.currentTool());
        Integer lobbyNo = existing != null ? existing.lobbyNo() : lobbyNoForNewRecord(payload, lobbyNumbers, nextLobbyNo);
        SessionRecord updated = new SessionRecord(
                key, payload.sessionId(), payload.agentId(), payload.agentType(), status, currentTool, startedAt,
                payload.cwd(), at, lobbyNo);
        sessions.put(key, updated);
        return updated;
    }

    /** 서브에이전트 이벤트의 부모(같은 session_id의 메인 레코드)가 없으면 idle 메인 레코드를 만든다(ADR-10, FR-004-E1 준용). */
    private static void ensureParentSession(
            Map<SessionKey, SessionRecord> sessions,
            Map<String, Integer> lobbyNumbers,
            int[] nextLobbyNo,
            HookPayload payload,
            OffsetDateTime at) {
        SessionKey mainKey = SessionKey.forSessionId(payload.sessionId());
        if (!sessions.containsKey(mainKey)) {
            Integer lobbyNo = assignLobbyNo(payload.sessionId(), lobbyNumbers, nextLobbyNo);
            sessions.put(mainKey, new SessionRecord(
                    mainKey, payload.sessionId(), null, null, Status.IDLE, null, at, payload.cwd(), at, lobbyNo));
        }
    }

    private static Integer lobbyNoForNewRecord(
            HookPayload payload, Map<String, Integer> lobbyNumbers, int[] nextLobbyNo) {
        boolean isMainLobbySession = !notBlank(payload.agentId()) && !notBlank(payload.agentType());
        return isMainLobbySession ? assignLobbyNo(payload.sessionId(), lobbyNumbers, nextLobbyNo) : null;
    }

    private static Integer assignLobbyNo(String sessionId, Map<String, Integer> lobbyNumbers, int[] nextLobbyNo) {
        Integer existing = lobbyNumbers.get(sessionId);
        if (existing != null) {
            return existing;
        }
        int assigned = nextLobbyNo[0]++;
        lobbyNumbers.put(sessionId, assigned);
        return assigned;
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
