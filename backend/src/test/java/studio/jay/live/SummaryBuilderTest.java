package studio.jay.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * 실시간 이벤트 {@code kind}·{@code title}·{@code summary} 계산 (api-spec {@code EventRow}, FR-003-AC10).
 */
class SummaryBuilderTest {

    private final SummaryBuilder summaryBuilder = new SummaryBuilder();

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

    @Test
    void preToolUseEditUsesFilePath() {
        // [FR-003-AC10] PreToolUse Edit file_path → '도구 실행 · Edit' + 경로
        HookPayload payload = payload(
                "PreToolUse",
                Map.of("tool_name", "Edit", "tool_input", Map.of("file_path", "/workspace/a.md")));

        SummaryBuilder.Summary summary = summaryBuilder.build(payload);

        assertThat(summary.kind()).isEqualTo("tool");
        assertThat(summary.title()).isEqualTo("도구 실행 · Edit");
        assertThat(summary.summary()).isEqualTo("/workspace/a.md");
    }

    @Test
    void preToolUseBashUsesCommand() {
        // [FR-003-AC10] Bash command
        HookPayload payload =
                payload("PreToolUse", Map.of("tool_name", "Bash", "tool_input", Map.of("command", "ls -la")));

        SummaryBuilder.Summary summary = summaryBuilder.build(payload);

        assertThat(summary.title()).isEqualTo("도구 실행 · Bash");
        assertThat(summary.summary()).isEqualTo("ls -la");
    }

    @Test
    void preToolUseGrepUsesPattern() {
        // [FR-003-AC10] Grep pattern
        HookPayload payload =
                payload("PreToolUse", Map.of("tool_name", "Grep", "tool_input", Map.of("pattern", "TODO")));

        SummaryBuilder.Summary summary = summaryBuilder.build(payload);

        assertThat(summary.title()).isEqualTo("도구 실행 · Grep");
        assertThat(summary.summary()).isEqualTo("TODO");
    }

    @Test
    void permissionRequestUsesToolAndTarget() {
        // [FR-003-AC10] PermissionRequest → '권한 요청 · <tool>'
        HookPayload payload = payload(
                "PermissionRequest",
                Map.of("tool_name", "Bash", "tool_input", Map.of("command", "rm -rf /tmp/x")));

        SummaryBuilder.Summary summary = summaryBuilder.build(payload);

        assertThat(summary.kind()).isEqualTo("permission");
        assertThat(summary.title()).isEqualTo("권한 요청 · Bash");
        assertThat(summary.summary()).isEqualTo("rm -rf /tmp/x");
    }

    @Test
    void sessionStartUsesCwd() {
        // [FR-003-AC10] SessionStart → cwd
        HookPayload payload = payload("SessionStart", Map.of("cwd", "/workspace"));

        SummaryBuilder.Summary summary = summaryBuilder.build(payload);

        assertThat(summary.kind()).isEqualTo("session-start");
        assertThat(summary.title()).isEqualTo("세션 시작");
        assertThat(summary.summary()).isEqualTo("/workspace");
    }

    @Test
    void subagentStartUsesAgentType() {
        // [FR-003-AC10] SubagentStart/Stop → agent_type
        HookPayload start = payload("SubagentStart", Map.of("agent_type", "Explore"));
        HookPayload stop = payload("SubagentStop", Map.of("agent_type", "Explore"));

        assertThat(summaryBuilder.build(start).summary()).isEqualTo("Explore");
        assertThat(summaryBuilder.build(start).title()).isEqualTo("서브에이전트 시작");
        assertThat(summaryBuilder.build(stop).summary()).isEqualTo("Explore");
        assertThat(summaryBuilder.build(stop).title()).isEqualTo("서브에이전트 종료");
    }

    @Test
    void stopIsResponseEnd() {
        // [FR-003-AC10] Stop → '응답 종료'
        HookPayload payload = payload("Stop", Map.of());

        SummaryBuilder.Summary summary = summaryBuilder.build(payload);

        assertThat(summary.kind()).isEqualTo("stop");
        assertThat(summary.title()).isEqualTo("응답 종료");
        assertThat(summary.summary()).isEqualTo("-");
    }

    @Test
    void summaryLongerThan200CharsIsTruncatedTo200() {
        // [FR-003-AC10] 201자 → 200자로 자름
        String longCommand = "x".repeat(201);
        HookPayload payload =
                payload("PreToolUse", Map.of("tool_name", "Bash", "tool_input", Map.of("command", longCommand)));

        SummaryBuilder.Summary summary = summaryBuilder.build(payload);

        assertThat(summary.summary()).hasSize(200);
        assertThat(summary.summary()).isEqualTo("x".repeat(200));
    }

    @Test
    void promptAndNotificationSummaryIsDash() {
        // [FR-003-AC10] prompt/notification summary '-'
        HookPayload prompt = payload("UserPromptSubmit", Map.of());
        HookPayload notification = payload("Notification", Map.of("notification_type", "idle"));

        assertThat(summaryBuilder.build(prompt).summary()).isEqualTo("-");
        assertThat(summaryBuilder.build(notification).summary()).isEqualTo("-");
        assertThat(summaryBuilder.build(notification).title()).isEqualTo("알림 · idle");
    }

    @Test
    void unsupportedEventNameReturnsNull() {
        HookPayload payload = payload("PreCompact", Map.of());

        assertThat(summaryBuilder.build(payload)).isNull();
    }
}
