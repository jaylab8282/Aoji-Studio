package studio.aoji.registry;

import java.util.List;

/**
 * api-spec {@code Workflow}. 정상 구성 파일만 대상이다(ADR-06).
 *
 * @param lead 팀장 name. 깨진 참조면 null이고 {@link FormatError.Kind#BROKEN_REF}에 포함
 * @param members 정상 참조 팀원 name, 오름차순. 깨진 참조 제외
 * @param brokenRefs 정의 파일이 없는 name(FR-002-AC5)
 * @param rawMemberCount 구성 파일 원본의 (lead?1:0)+members.length. FR-017-AC1 0명 판정 기준
 */
public record Workflow(
        String name,
        String description,
        String filePath,
        String lead,
        List<String> members,
        List<String> brokenRefs,
        int rawMemberCount) {

    public Workflow {
        members = List.copyOf(members);
        brokenRefs = List.copyOf(brokenRefs);
    }
}
