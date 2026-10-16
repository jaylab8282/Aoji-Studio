package studio.aoji.skills;

/**
 * 스킬 폴더 하나의 스캔 결과 (architecture.md §6.4.1).
 *
 * @param name 폴더 이름
 * @param description frontmatter {@code description}, 없거나 형식 오류면 빈 문자열
 * @param filePath 마운트 기준 {@code .claude/skills/<name>/SKILL.md}
 * @param userOnly {@code disable-model-invocation: true}
 * @param imported 같은 폴더에 {@code SOURCE.md}가 있음
 * @param formatError 형식 오류 사유. 정상이면 {@code null}
 * @param body frontmatter 뒤 본문 원문. 형식 오류면 빈 문자열
 * @param mtimeMillis SKILL.md 수정 시각(ms)
 * @param size SKILL.md 바이트 수
 */
public record SkillEntry(
        String name,
        String description,
        String filePath,
        boolean userOnly,
        boolean imported,
        String formatError,
        String body,
        long mtimeMillis,
        long size) {

    /** 상세 revision {@code <mtimeMillis>-<size>} (api-spec {@code SkillDetail.revision}). */
    public String revision() {
        return mtimeMillis + "-" + size;
    }
}
