package studio.jay.registry;

import java.util.List;

/**
 * {@code .claude/agents/} 스캔 결과 (FR-001-AC1, FR-001-E1, FR-002-AC1·AC2).
 *
 * @param agentsDirMissing {@code .claude/agents/}가 없음
 * @param agentCount 정상 정의 파일 수. {@code agentsDirMissing}이면 null
 * @param validAgents 정상 정의 파일만, 파싱 순서(스캐너가 이름 오름차순 정렬은 하지 않음)
 * @param formatErrors 형식 오류 파일 목록(agent kind)
 */
public record AgentsScanResult(
        boolean agentsDirMissing,
        Integer agentCount,
        List<ParsedAgentFile> validAgents,
        List<FormatError> formatErrors) {

    public AgentsScanResult {
        validAgents = List.copyOf(validAgents);
        formatErrors = List.copyOf(formatErrors);
    }

    public static AgentsScanResult whenAgentsDirMissing() {
        return new AgentsScanResult(true, null, List.of(), List.of());
    }
}
