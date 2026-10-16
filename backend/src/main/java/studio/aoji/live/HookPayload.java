package studio.aoji.live;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Collections;
import java.util.Map;

/**
 * Claude Code http hook 입력 (api-spec {@code HookPayload}). snake_case 필드는 여기서만 쓴다
 * (conventions.md §2 "JSON 필드"). 알 수 없는 필드는 무시한다.
 *
 * <p>{@code transcript_path}·{@code message}·{@code source}는 저장하지 않으므로 이 레코드에
 * 두지 않는다(FR-003-AC10 설명, api-spec {@code HookPayload} 필드 설명). {@code tool_input}은
 * 요약 추출에만 쓰고 원문을 어디에도 저장하지 않는다(FR-015-AC3). {@code prompt}는 {@code /<스킬>}
 * 판정에만 쓰고 저장·로그하지 않는다(FR-019-AC8, ADR-80 결정 1).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record HookPayload(
        @JsonProperty("session_id") String sessionId,
        @JsonProperty("cwd") String cwd,
        @JsonProperty("hook_event_name") String hookEventName,
        @JsonProperty("agent_id") String agentId,
        @JsonProperty("agent_type") String agentType,
        @JsonProperty("tool_name") String toolName,
        @JsonProperty("tool_input") Map<String, Object> toolInput,
        @JsonProperty("notification_type") String notificationType,
        @JsonProperty("reason") String reason,
        @JsonProperty("prompt") String prompt) {

    public HookPayload {
        toolInput = toolInput == null ? Map.of() : Collections.unmodifiableMap(toolInput);
    }

    /** {@code prompt} 없는 입력(프롬프트 판정을 쓰지 않는 호출). */
    public HookPayload(
            String sessionId,
            String cwd,
            String hookEventName,
            String agentId,
            String agentType,
            String toolName,
            Map<String, Object> toolInput,
            String notificationType,
            String reason) {
        this(sessionId, cwd, hookEventName, agentId, agentType, toolName, toolInput, notificationType, reason, null);
    }

    /** 프롬프트 본문·도구 입력 원문이 로그에 새지 않도록 식별 필드만 보인다(FR-019-AC8, NFR-08). */
    @Override
    public String toString() {
        return "HookPayload[sessionId=" + sessionId + ", hookEventName=" + hookEventName + ", agentType=" + agentType
                + ", toolName=" + toolName + "]";
    }
}
