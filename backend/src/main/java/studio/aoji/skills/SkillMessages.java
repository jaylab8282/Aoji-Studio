package studio.aoji.skills;

/** 스킬 API 서버 메시지 상수 (ADR-91 승인 문구, 한 곳). */
public final class SkillMessages {

    /** 404 {@code SKILL_NOT_FOUND}. */
    public static final String SKILL_NOT_FOUND = "이미 없는 스킬입니다";

    /** 409 {@code UNEDITABLE} — 형식 오류 SKILL.md. */
    public static final String UNEDITABLE = "에디터에서 SKILL.md를 고치세요";

    /** 형식 오류 사유 (FR-018-E1). */
    public static final String ERR_FRONTMATTER = "frontmatter 형식 오류";

    public static final String ERR_UTF8 = "UTF-8 인코딩 오류";
    public static final String ERR_NAME_MISMATCH = "name이 폴더 이름과 다름";

    private SkillMessages() {}
}
