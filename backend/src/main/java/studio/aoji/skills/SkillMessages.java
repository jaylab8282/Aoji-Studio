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

    /** 500 {@code IO_FAILED} — 가져오기 쓰기 실패 (FR-021-AC6·E5). */
    public static final String IMPORT_FAILED =
            "스킬을 가져오지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 아무것도 남기지 않았습니다.";

    /** 404 {@code UPLOAD_NOT_FOUND} — 올린 zip 없음·만료. */
    public static final String UPLOAD_NOT_FOUND = "올린 zip을 찾을 수 없습니다 · 파일을 다시 고르세요";

    /** 400 {@code IMPORT_REJECTED} 거부 문구 (ADR-91, FR-021-E1~E3). {@code entry}·{@code name}은 사유가 쓰는 쪽만 본다. */
    public static String importRejected(SkillImportRejectReason reason, String entry, String name) {
        return switch (reason) {
            case NOT_ZIP, CORRUPT -> "zip 파일이 아니거나 손상되었습니다";
            case NO_SKILL_MD -> "맨 위나 맨 위 폴더 하나 안에 SKILL.md가 없습니다";
            case TOO_LARGE -> "zip이 10MB를 넘습니다";
            case TOO_MANY_FILES -> "파일이 500개를 넘습니다";
            case UNPACKED_TOO_LARGE -> "풀었을 때 50MB를 넘습니다";
            case ABSOLUTE_PATH -> IMPORT_BAD_ENTRY + " · " + printable(entry) + " · 절대 경로";
            case PATH_TRAVERSAL -> IMPORT_BAD_ENTRY + " · " + printable(entry) + " · 경로 이탈";
            case SYMLINK -> IMPORT_BAD_ENTRY + " · " + printable(entry) + " · 심볼릭 링크";
            case NAME_INVALID -> "스킬 이름 " + printable(name) + " · " + NAME_RULE;
            case NAME_EXISTS -> "스킬 이름 " + printable(name) + " · " + NAME_EXISTS;
        };
    }

    private static final String IMPORT_BAD_ENTRY = "가져올 수 없는 항목이 있습니다";

    /** 제어 문자를 바꾸고 길이를 줄여 메시지에 안전하게 싣는다. */
    private static String printable(String value) {
        if (value == null) {
            return "";
        }
        String cleaned = value.replaceAll("\\p{Cntrl}", "?");
        return cleaned.length() > 200 ? cleaned.substring(0, 200) + "…" : cleaned;
    }

    /** 형식 오류 사유 (FR-018-E1). */
    public static final String ERR_FRONTMATTER = "frontmatter 형식 오류";

    public static final String ERR_UTF8 = "UTF-8 인코딩 오류";
    public static final String ERR_NAME_MISMATCH = "name이 폴더 이름과 다름";

    private SkillMessages() {}
}
