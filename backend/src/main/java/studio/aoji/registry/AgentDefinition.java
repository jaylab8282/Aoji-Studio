package studio.aoji.registry;

import java.util.List;
import studio.aoji.mcp.McpServerDef;

/**
 * 정의 파일(.claude/agents/&lt;name&gt;.md) frontmatter를 해석한 결과 (architecture.md §6.1).
 * 편집(ADR-07)은 이 레코드가 아니라 줄 단위로 하므로, 여기서는 검증·표시에 필요한 값만 담는다.
 *
 * @param tools 정규화된 도구 목록. frontmatter에 {@code tools} 키가 없으면 null(전체 상속)
 * @param model frontmatter {@code model} 원본 값. 없으면 null
 * @param hasLiteralInheritModel 원본에 {@code model: inherit} 줄이 있음(ADR-13 보존용)
 * @param body frontmatter 닫는 줄 다음의 본문 원문
 * @param skills frontmatter {@code skills} 원본 목록(쉼표 문자열 또는 YAML 목록). 없으면 빈 목록
 * @param mcpServers frontmatter {@code mcpServers} 원본 목록(문자열 이름 또는 {@code {이름: 정의}} 객체의 이름). 없으면 빈 목록
 * @param inlineMcpServers {@code mcpServers}에 객체로 정의한 서버(FR-023-AC1 위치 {@code 에이전트}). 가린 값만 담는다
 *     (원래 {@code env}·{@code headers} 값은 파싱 직후 버린다, ADR-85 결정 3). 문자열 이름 참조는 여기 없다
 */
public record AgentDefinition(
        String name,
        String description,
        List<String> tools,
        String model,
        boolean hasLiteralInheritModel,
        String body,
        List<String> skills,
        List<String> mcpServers,
        List<McpServerDef> inlineMcpServers) {

    public AgentDefinition {
        inlineMcpServers = List.copyOf(inlineMcpServers);
    }
}
