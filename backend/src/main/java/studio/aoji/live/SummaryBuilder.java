package studio.aoji.live;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 실시간 이벤트 {@code kind}·{@code title}·{@code summary} 계산 (api-spec {@code EventRow},
 * FR-003-AC9·AC10). 순수 함수: 입력({@code payload})만으로 결정하고 시계·DB에 의존하지 않는다
 * (conventions.md §3 Backend, {@code SessionStateMachine.apply}와 같은 원칙).
 *
 * <p>{@link #build(HookPayload)}가 {@code null}을 돌려주면 FR-003-AC9가 쓰지 않는 이벤트다.
 * 호출자({@code HookCollectController})는 이 경우 저장하지 않고 FR-003-E1로 처리한다.
 */
@Component
public class SummaryBuilder {

    private static final int MAX_SUMMARY_LENGTH = 200;

    /** api-spec {@code EventRow.summary} 대상 추출 순서. */
    private static final List<String> TARGET_KEYS =
            List.of("file_path", "notebook_path", "command", "pattern", "path", "url", "query", "description");

    /** api-spec {@code EventRow}의 {@code kind}·{@code title}·{@code summary}(마스킹 전, 200자 이하). */
    public record Summary(String kind, String title, String summary) {}

    /** 스킬 목록 없이 계산한다({@code /<스킬>} 판정은 항상 '-'). */
    public Summary build(HookPayload payload) {
        return build(payload, Set.of());
    }

    /**
     * FR-003-AC9 12종 사용 이벤트가 아니면 {@code null}.
     *
     * @param skillNames 지금 있는 스킬 폴더 이름(형식 오류 포함). {@code UserPromptSubmit}의
     *     {@code /<이름>} 판정에 쓴다(FR-003-AC10, ADR-80 결정 1)
     */
    public Summary build(HookPayload payload, Set<String> skillNames) {
        String tool = payload.toolName() == null ? "" : payload.toolName();
        return switch (payload.hookEventName()) {
            case "SessionStart" -> new Summary("session-start", "세션 시작", truncate(orDash(payload.cwd())));
            case "SessionEnd" -> new Summary("session-end", "세션 종료", truncate(orDash(payload.reason())));
            case "UserPromptSubmit" ->
                    new Summary(
                            "prompt",
                            "프롬프트 제출",
                            slashSkill(payload, skillNames).map(name -> "/" + name).orElse("-"));
            case "Stop" -> new Summary("stop", "응답 종료", "-");
            case "PreToolUse" -> new Summary("tool", "도구 실행 · " + tool, truncate(target(payload)));
            case "PostToolUse" -> new Summary("tool-done", "도구 완료 · " + tool, truncate(target(payload)));
            case "PostToolUseFailure" ->
                    new Summary("tool-failure", "도구 실패 · " + tool, truncate(target(payload)));
            case "PermissionRequest" -> new Summary("permission", "권한 요청 · " + tool, truncate(target(payload)));
            case "PermissionDenied" ->
                    new Summary("permission-denied", "권한 거부 · " + tool, truncate(target(payload)));
            case "Notification" ->
                    new Summary("notification", "알림 · " + orDash(payload.notificationType()), "-");
            case "SubagentStart" ->
                    new Summary("subagent-start", "서브에이전트 시작", truncate(orDash(payload.agentType())));
            case "SubagentStop" ->
                    new Summary("subagent-stop", "서브에이전트 종료", truncate(orDash(payload.agentType())));
            default -> null;
        };
    }

    /**
     * PreToolUse류 이벤트의 대상 요약(파일 경로·명령·패턴 등 첫 값, 마스킹 전). {@code SessionStateMachine}
     * 의 {@code AgentLive.currentTool.target}(api-spec) 계산도 같은 규칙을 쓴다.
     */
    public static String extractTarget(HookPayload payload) {
        return target(payload);
    }

    /**
     * {@code prompt}가 {@code /<이름>}으로 시작하고 이름 뒤가 끝 또는 공백이며 {@code <이름>}이 지금 있는 스킬
     * 폴더 이름이면 그 이름. 아니면 빈 값. 프롬프트 나머지는 읽지도 남기지도 않는다(FR-019-AC8).
     */
    public static Optional<String> slashSkill(HookPayload payload, Set<String> skillNames) {
        String prompt = payload.prompt();
        if (prompt == null || prompt.length() < 2 || prompt.charAt(0) != '/') {
            return Optional.empty();
        }
        int end = 1;
        while (end < prompt.length() && !Character.isWhitespace(prompt.charAt(end))) {
            end++;
        }
        String name = prompt.substring(1, end);
        return skillNames.contains(name) ? Optional.of(name) : Optional.empty();
    }

    /** Skill 도구 호출의 대상: {@code tool_input.skill}, 없으면 {@code tool_input.name}, 둘 다 없으면 {@code -}. */
    public static String skillTarget(HookPayload payload) {
        for (String key : List.of("skill", "name")) {
            Object value = payload.toolInput().get(key);
            if (value instanceof String text && !text.isBlank()) {
                return text;
            }
        }
        return "-";
    }

    private static String target(HookPayload payload) {
        if ("Skill".equals(payload.toolName())) {
            return skillTarget(payload);
        }
        Map<String, Object> toolInput = payload.toolInput();
        for (String key : TARGET_KEYS) {
            Object value = toolInput.get(key);
            if (value != null) {
                return String.valueOf(value);
            }
        }
        return "-";
    }

    private static String orDash(String value) {
        return value == null || value.isBlank() ? "-" : value;
    }

    private static String truncate(String value) {
        return value.length() > MAX_SUMMARY_LENGTH ? value.substring(0, MAX_SUMMARY_LENGTH) : value;
    }
}
