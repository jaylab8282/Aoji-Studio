package studio.jay.registry;

import java.util.List;

/**
 * api-spec {@code AgentDef}. 정상 정의 파일만 대상이다(형식 오류 파일은 {@link FormatError}로만 노출).
 *
 * @param workflow 소속 워크플로우. 중복 소속이면 이름 오름차순 첫 것(FR-006-AC11). 없으면 null
 * @param duplicateWorkflows 두 구성 파일 이상에 있으면 모든 워크플로우 이름(오름차순). 아니면 빈 배열
 */
public record AgentDef(
        String name,
        String description,
        String filePath,
        String workflow,
        Role role,
        List<String> duplicateWorkflows) {

    public AgentDef {
        duplicateWorkflows = List.copyOf(duplicateWorkflows);
    }
}
