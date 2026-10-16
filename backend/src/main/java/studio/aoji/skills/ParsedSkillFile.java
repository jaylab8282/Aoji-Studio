package studio.aoji.skills;

/** SKILL.md 한 파일의 파싱 결과. {@code formatError}가 있으면 나머지 값은 비어 있다. */
public record ParsedSkillFile(String description, boolean userOnly, String body, String formatError) {

    static ParsedSkillFile error(String reason) {
        return new ParsedSkillFile("", false, "", reason);
    }
}
