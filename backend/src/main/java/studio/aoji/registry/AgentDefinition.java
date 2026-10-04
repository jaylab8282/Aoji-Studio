package studio.aoji.registry;

import java.util.List;

/**
 * 정의 파일(.claude/agents/&lt;name&gt;.md) frontmatter를 해석한 결과 (architecture.md §6.1).
 * 편집(ADR-07)은 이 레코드가 아니라 줄 단위로 하므로, 여기서는 검증·표시에 필요한 값만 담는다.
 *
 * @param tools 정규화된 도구 목록. frontmatter에 {@code tools} 키가 없으면 null(전체 상속)
 * @param model frontmatter {@code model} 원본 값. 없으면 null
 * @param hasLiteralInheritModel 원본에 {@code model: inherit} 줄이 있음(ADR-13 보존용)
 * @param body frontmatter 닫는 줄 다음의 본문 원문
 */
public record AgentDefinition(
        String name,
        String description,
        List<String> tools,
        String model,
        boolean hasLiteralInheritModel,
        String body) {
}
