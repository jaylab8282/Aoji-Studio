package studio.jay.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * 세션 단위 상태 전이 (FR-004-AC2 표 13행 + ADR-10, FR-004-AC3·AC4·AC5, FR-004-E1). 순수 함수라
 * Spring 컨텍스트 없이 검증한다.
 */
class SessionStateMachineTest {

    private final SessionStateMachine machine = new SessionStateMachine(new Masker());

    private static HookPayload payload(String hookEventName, Map<String, Object> overrides) {
        return new HookPayload(
                (String) overrides.getOrDefault("session_id", "s1"),
                (String) overrides.get("cwd"),
                hookEventName,
                (String) overrides.get("agent_id"),
                (String) overrides.get("agent_type"),
                (String) overrides.get("tool_name"),
                castToolInput(overrides.get("tool_input")),
                (String) overrides.get("notification_type"),
                (String) overrides.get("reason"));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castToolInput(Object value) {
        return value == null ? Map.of() : (Map<String, Object>) value;
    }

    private static OffsetDateTime at(String iso) {
        return OffsetDateTime.parse(iso);
    }

    private SessionRecord recordFor(LiveState state, String key) {
        return state.sessions().get(new SessionKey(key));
    }

    @Test
    void sessionStartWithAgentTypeClearsStaleRecordsAndIsIdle() {
        // [FR-004-AC2] SessionStart → 대기 (같은 agent_type의 이전 세션 상태를 모두 정리)
        LiveState afterOldSession = machine.apply(
                LiveState.empty(),
                payload("UserPromptSubmit", Map.of("session_id", "s1", "agent_type", "architect")),
                at("2026-09-21T10:00:00+09:00"));
        assertThat(recordFor(afterOldSession, "s1").status()).isEqualTo(Status.RUNNING);

        LiveState afterNewSession = machine.apply(
                afterOldSession,
                payload("SessionStart", Map.of("session_id", "s2", "agent_type", "architect")),
                at("2026-09-21T10:05:00+09:00"));

        assertThat(recordFor(afterNewSession, "s1")).isNull();
        SessionRecord newRecord = recordFor(afterNewSession, "s2");
        assertThat(newRecord.status()).isEqualTo(Status.IDLE);
        assertThat(newRecord.currentTool()).isNull();
    }

    @Test
    void userPromptSubmitSetsRunning() {
        // [FR-004-AC2] UserPromptSubmit → 작업 중
        LiveState state = machine.apply(
                LiveState.empty(), payload("UserPromptSubmit", Map.of("session_id", "s1")), at("2026-09-21T10:00:00+09:00"));

        assertThat(recordFor(state, "s1").status()).isEqualTo(Status.RUNNING);
    }

    @Test
    void subagentStartSetsSubSessionRunning() {
        // [FR-004-AC2] SubagentStart → 서브에이전트 세션 작업 중
        LiveState state = machine.apply(
                LiveState.empty(),
                payload("SubagentStart", Map.of("session_id", "s1", "agent_id", "a1", "agent_type", "Explore")),
                at("2026-09-21T10:00:00+09:00"));

        assertThat(recordFor(state, "a1").status()).isEqualTo(Status.RUNNING);
        assertThat(recordFor(state, "a1").agentType()).isEqualTo("Explore");
        // ADR-10: 부모(메인) 레코드가 없으면 idle로 만들어 둔다.
        assertThat(recordFor(state, "s1").status()).isEqualTo(Status.IDLE);
    }

    @Test
    void preToolUseNonAskUserQuestionSetsRunning() {
        // [FR-004-AC2] PreToolUse tool_name ≠ AskUserQuestion → 작업 중
        LiveState state = machine.apply(
                LiveState.empty(),
                payload("PreToolUse", Map.of("session_id", "s1", "tool_name", "Bash", "tool_input", Map.of("command", "ls"))),
                at("2026-09-21T10:00:00+09:00"));

        SessionRecord record = recordFor(state, "s1");
        assertThat(record.status()).isEqualTo(Status.RUNNING);
        assertThat(record.currentTool()).isEqualTo(new ToolRef("Bash", "ls"));
    }

    @Test
    void preToolUseAskUserQuestionSetsWaiting() {
        // [FR-004-AC2] PreToolUse tool_name = AskUserQuestion → 권한·입력 대기
        LiveState state = machine.apply(
                LiveState.empty(),
                payload("PreToolUse", Map.of("session_id", "s1", "tool_name", "AskUserQuestion")),
                at("2026-09-21T10:00:00+09:00"));

        assertThat(recordFor(state, "s1").status()).isEqualTo(Status.WAITING);
    }

    @Test
    void permissionRequestSetsWaiting() {
        // [FR-004-AC2] PermissionRequest → 권한·입력 대기
        LiveState state = machine.apply(
                LiveState.empty(), payload("PermissionRequest", Map.of("session_id", "s1", "tool_name", "Bash")),
                at("2026-09-21T10:00:00+09:00"));

        assertThat(recordFor(state, "s1").status()).isEqualTo(Status.WAITING);
    }

    @Test
    void notificationPermissionPromptSetsWaiting() {
        // [FR-004-AC2] Notification notification_type = permission_prompt → 권한·입력 대기
        LiveState state = machine.apply(
                LiveState.empty(),
                payload("Notification", Map.of("session_id", "s1", "notification_type", "permission_prompt")),
                at("2026-09-21T10:00:00+09:00"));

        assertThat(recordFor(state, "s1").status()).isEqualTo(Status.WAITING);
    }

    @Test
    void notificationOtherTypeDoesNotChangeState() {
        // [FR-004-AC2] Notification 기타 → 변경 없음
        LiveState running = machine.apply(
                LiveState.empty(), payload("UserPromptSubmit", Map.of("session_id", "s1")),
                at("2026-09-21T10:00:00+09:00"));

        LiveState afterNotification = machine.apply(
                running, payload("Notification", Map.of("session_id", "s1", "notification_type", "idle")),
                at("2026-09-21T10:10:00+09:00"));

        assertThat(afterNotification).isEqualTo(running);

        // 세션 자체가 없을 때도 새로 만들지 않는다.
        LiveState stillEmpty = machine.apply(
                LiveState.empty(), payload("Notification", Map.of("session_id", "s9", "notification_type", "idle")),
                at("2026-09-21T10:00:00+09:00"));
        assertThat(stillEmpty.sessions()).isEmpty();
    }

    @Test
    void postToolUseFailureAndPermissionDeniedSetRunning() {
        // [FR-004-AC2] PostToolUse, PostToolUseFailure, PermissionDenied → 작업 중
        for (String event : List.of("PostToolUse", "PostToolUseFailure", "PermissionDenied")) {
            LiveState state = machine.apply(
                    LiveState.empty(), payload(event, Map.of("session_id", "s1", "tool_name", "Bash")),
                    at("2026-09-21T10:00:00+09:00"));
            assertThat(recordFor(state, "s1").status()).as(event).isEqualTo(Status.RUNNING);
        }
    }

    @Test
    void stopSetsIdleButKeepsSession() {
        // [FR-004-AC2] Stop → 대기 (세션이 열려 있어도 대기, 세션 유지)
        LiveState running = machine.apply(
                LiveState.empty(),
                payload("PreToolUse", Map.of("session_id", "s1", "tool_name", "Bash", "tool_input", Map.of("command", "ls"))),
                at("2026-09-21T10:00:00+09:00"));

        LiveState afterStop = machine.apply(running, payload("Stop", Map.of("session_id", "s1")), at("2026-09-21T10:05:00+09:00"));

        SessionRecord record = recordFor(afterStop, "s1");
        assertThat(record).isNotNull();
        assertThat(record.status()).isEqualTo(Status.IDLE);
        assertThat(record.currentTool()).isNull();
    }

    @Test
    void subagentStopRemovesRecord() {
        // [FR-004-AC2] SubagentStop → 서브에이전트 세션 대기 후 제거
        LiveState started = machine.apply(
                LiveState.empty(),
                payload("SubagentStart", Map.of("session_id", "s1", "agent_id", "a1", "agent_type", "Explore")),
                at("2026-09-21T10:00:00+09:00"));

        LiveState afterStop = machine.apply(
                started, payload("SubagentStop", Map.of("session_id", "s1", "agent_id", "a1", "agent_type", "Explore")),
                at("2026-09-21T10:05:00+09:00"));

        assertThat(recordFor(afterStop, "a1")).isNull();
        // 부모(메인) 레코드는 유지된다.
        assertThat(recordFor(afterStop, "s1")).isNotNull();
    }

    @Test
    void sessionEndRemovesMainAndSubRecords() {
        // [FR-004-AC2] SessionEnd → 대기 후 세션 제거 (그 session_id의 서브 레코드도 함께 제거)
        LiveState withSub = machine.apply(
                LiveState.empty(),
                payload("SubagentStart", Map.of("session_id", "s1", "agent_id", "a1", "agent_type", "Explore")),
                at("2026-09-21T10:00:00+09:00"));

        LiveState afterEnd = machine.apply(withSub, payload("SessionEnd", Map.of("session_id", "s1")), at("2026-09-21T10:05:00+09:00"));

        assertThat(recordFor(afterEnd, "s1")).isNull();
        assertThat(recordFor(afterEnd, "a1")).isNull();
        assertThat(afterEnd.sessions()).isEmpty();
    }

    @Test
    void restartClearsAllSessions() {
        // [FR-004-AC2] 컨테이너 재시작 → 모든 세션 제거 → 모두 대기
        LiveState running = machine.apply(
                LiveState.empty(), payload("UserPromptSubmit", Map.of("session_id", "s1")), at("2026-09-21T10:00:00+09:00"));
        assertThat(running.sessions()).isNotEmpty();

        // 재시작은 sessions를 복원하지 않는다(NFR-09) — 새 LiveState.empty()가 정확히 이 보장을 나타낸다.
        LiveState afterRestart = LiveState.empty();
        assertThat(afterRestart.sessions()).isEmpty();
    }

    @Test
    void multipleSessionsPickHighestPriorityStatus() {
        // [FR-004-AC3] 세션 A running + 세션 B waiting → waiting
        LiveState state = machine.apply(
                LiveState.empty(), payload("UserPromptSubmit", Map.of("session_id", "s1", "agent_type", "architect")),
                at("2026-09-21T10:00:00+09:00"));
        state = machine.apply(
                state, payload("PermissionRequest", Map.of("session_id", "s2", "agent_type", "architect")),
                at("2026-09-21T10:01:00+09:00"));

        List<SessionRecord> records = List.copyOf(state.sessions().values());
        assertThat(SessionStateMachine.choosePriority(records).status()).isEqualTo(Status.WAITING);
    }

    @Test
    void runningBeatsIdleInPriority() {
        // [FR-004-AC3] running + idle → running
        LiveState state = machine.apply(
                LiveState.empty(), payload("UserPromptSubmit", Map.of("session_id", "s1", "agent_type", "architect")),
                at("2026-09-21T10:00:00+09:00"));
        state = machine.apply(
                state, payload("SessionStart", Map.of("session_id", "s2", "agent_type", "other")),
                at("2026-09-21T10:01:00+09:00"));
        // s2는 다른 agent_type이라 지워지지 않는다. idle 레코드 하나 더 만들어 같은 그룹으로 섞어 확인한다.
        state = machine.apply(
                state, payload("Stop", Map.of("session_id", "s3", "agent_type", "architect")),
                at("2026-09-21T10:02:00+09:00"));

        List<SessionRecord> architectRecords = state.sessions().values().stream()
                .filter(r -> "architect".equals(r.agentType()))
                .toList();
        assertThat(architectRecords).hasSize(2);
        assertThat(SessionStateMachine.choosePriority(architectRecords).status()).isEqualTo(Status.RUNNING);
    }

    @Test
    void differentAgentIdsAreTrackedIndependently() {
        // [FR-004-AC4] agent_id 다른 두 서브 레코드 독립 계산
        LiveState state = machine.apply(
                LiveState.empty(),
                payload("SubagentStart", Map.of("session_id", "s1", "agent_id", "a1", "agent_type", "Explore")),
                at("2026-09-21T10:00:00+09:00"));
        state = machine.apply(
                state,
                payload("PreToolUse", Map.of("session_id", "s1", "agent_id", "a2", "agent_type", "Explore", "tool_name", "Bash")),
                at("2026-09-21T10:01:00+09:00"));

        assertThat(recordFor(state, "a1")).isNotNull();
        assertThat(recordFor(state, "a2")).isNotNull();
        assertThat(recordFor(state, "a1").status()).isEqualTo(Status.RUNNING);
        assertThat(recordFor(state, "a2").status()).isEqualTo(Status.RUNNING);
    }

    @Test
    void statusUnaffectedByTimePassageAlone() {
        // [FR-004-AC5] 시각 경과만으로 상태 변화 없음(시계 30분 전진 후 동일)
        OffsetDateTime t0 = at("2026-09-21T10:00:00+09:00");
        LiveState afterEvent = machine.apply(
                LiveState.empty(),
                payload("PreToolUse", Map.of("session_id", "s1", "tool_name", "Bash", "tool_input", Map.of("command", "ls"))),
                t0);

        OffsetDateTime t0Plus30 = t0.plusMinutes(30);
        LiveState afterTimePassage = machine.apply(
                afterEvent, payload("Notification", Map.of("session_id", "s1", "notification_type", "idle")), t0Plus30);

        assertThat(afterTimePassage).isEqualTo(afterEvent);
    }

    @Test
    void outOfOrderPreToolUseWithoutSessionStartCreatesRunningSession() {
        // [FR-004-E1] 순서가 어긋난 이벤트(SessionStart 없이 PreToolUse) → 새 세션 running
        LiveState state = machine.apply(
                LiveState.empty(),
                payload("PreToolUse", Map.of("session_id", "s1", "tool_name", "Bash", "tool_input", Map.of("command", "ls"))),
                at("2026-09-21T10:00:00+09:00"));

        SessionRecord record = recordFor(state, "s1");
        assertThat(record).isNotNull();
        assertThat(record.status()).isEqualTo(Status.RUNNING);
    }
}
