package studio.aoji.live;

import java.time.OffsetDateTime;

/**
 * api-spec {@code UndefinedSubagent}. {@code agent_type}이 정상 정의 파일에 없는 서브에이전트
 * (FR-003-E2, FR-007-AC3, ADR-10).
 *
 * @param parentAgentName 부모가 정의된 에이전트면 name. 아니면 null
 * @param parentLabel {@code develop-tech-lead} 또는 {@code [세션 1]}
 */
public record UndefinedSubagent(
        String agentId,
        String agentType,
        String sessionId,
        Status status,
        ToolRef currentTool,
        String parentAgentName,
        String parentLabel,
        OffsetDateTime startedAt) {
}
