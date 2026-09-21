package studio.jay.live;

import java.time.OffsetDateTime;

/**
 * 세션 단위 상태 레코드 (architecture.md §6.6). 메인 세션(agentId 없음, key == sessionId) 또는
 * 서브에이전트 세션(agentId 있음, key == agentId) 하나를 나타낸다.
 *
 * @param agentId null이면 메인 세션 레코드
 * @param agentType null이면 {@code agent_type} 없는 메인 세션(로비 대상, FR-003-AC5)
 * @param currentTool 마지막 {@code PreToolUse}. {@code idle}이면 항상 null(FR-007-AC5)
 * @param startedAt 가장 최근 SessionStart/SubagentStart 수신 시각(없으면 첫 이벤트 시각)
 * @param lobbyNo {@code agent_type} 없는 메인 세션에만 배정(서버 수명 내, FR-003-AC5)
 */
public record SessionRecord(
        SessionKey key,
        String sessionId,
        String agentId,
        String agentType,
        Status status,
        ToolRef currentTool,
        OffsetDateTime startedAt,
        String cwd,
        OffsetDateTime lastEventAt,
        Integer lobbyNo) {

    public boolean isSub() {
        return agentId != null && !agentId.isBlank();
    }

    public boolean hasAgentType() {
        return agentType != null && !agentType.isBlank();
    }
}
