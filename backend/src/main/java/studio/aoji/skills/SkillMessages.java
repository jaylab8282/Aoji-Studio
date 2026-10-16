package studio.aoji.skills;

/** 스킬 API 서버 메시지 상수 (ADR-91 승인 문구, 한 곳). */
public final class SkillMessages {

    /** 404 {@code SKILL_NOT_FOUND}. */
    public static final String SKILL_NOT_FOUND = "이미 없는 스킬입니다";

    /** 409 {@code UNEDITABLE} — 형식 오류 SKILL.md. */
    public static final String UNEDITABLE = "에디터에서 SKILL.md를 고치세요";

    /** 400 {@code fields.name} — 이름 규칙 위반. */
    public static final String NAME_RULE = "소문자·숫자·하이픈만, 1~64자";

    /** 400 {@code fields.name} — 같은 이름의 폴더가 이미 있음(형식 오류 폴더 포함). */
    public static final String NAME_EXISTS = "이미 있는 이름입니다";

    /** 400 {@code fields.description} 빈 값. */
    public static final String REQUIRED = "필수";

    /** 400 {@code fields.description} 줄바꿈 포함(06과 같은 서버 문구). */
    public static final String NO_LINE_BREAK = "줄바꿈을 포함할 수 없습니다";

    /** 409 {@code IMPORTED_SKILL} — {@code SOURCE.md}가 있는 스킬 수정 (FR-020-AC6). */
    public static final String IMPORTED_SKILL = "가져온 스킬은 수정할 수 없습니다";

    /** 500 {@code IO_FAILED} — 만들기 쓰기 실패 (FR-020-E3). */
    public static final String CREATE_FAILED =
            "스킬 폴더를 만들지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 폴더 쓰기 권한을 확인한 뒤 다시 만드세요.";

    /** 500 {@code IO_FAILED} — 수정 쓰기 실패 (FR-020-E3). */
    public static final String UPDATE_FAILED = "SKILL.md를 바꾸지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 원래 파일은 그대로입니다.";

    /** 500 {@code IO_FAILED} — 휴지통 이동 실패 (FR-022-E1). */
    public static final String TRASH_FAILED =
            "스킬 폴더를 휴지통으로 옮기지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 폴더는 그대로입니다.";

    /** 형식 오류 사유 (FR-018-E1). */
    public static final String ERR_FRONTMATTER = "frontmatter 형식 오류";

    public static final String ERR_UTF8 = "UTF-8 인코딩 오류";
    public static final String ERR_NAME_MISMATCH = "name이 폴더 이름과 다름";

    private SkillMessages() {}
}
