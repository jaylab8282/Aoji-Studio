package studio.aoji.skills;

/**
 * 가져오기 실패 (ADR-84 결정 6). 컨트롤러가 {@code ApiException}으로 바꾼다. 메시지에 경로·예외 원문을 싣지
 * 않는다(NFR-08) — 사유 코드만 가진다.
 */
public class SkillImportException extends RuntimeException {

    /** 실패 종류. */
    public enum Kind {
        /** zip 거부(400, 이름 중복은 409). */
        REJECTED,
        /** {@code uploadId} 없음·만료(404). */
        UPLOAD_NOT_FOUND,
        /** 쓰기 실패(500). */
        IO_FAILED
    }

    private final Kind kind;
    private final SkillImportRejectReason reason;
    private final String entry;
    private final String name;

    private SkillImportException(Kind kind, SkillImportRejectReason reason, String entry, String name) {
        super(kind + (reason == null ? "" : ":" + reason));
        this.kind = kind;
        this.reason = reason;
        this.entry = entry;
        this.name = name;
    }

    public static SkillImportException rejected(SkillImportRejectReason reason, String entry, String name) {
        return new SkillImportException(Kind.REJECTED, reason, entry, name);
    }

    public static SkillImportException uploadNotFound() {
        return new SkillImportException(Kind.UPLOAD_NOT_FOUND, null, null, null);
    }

    public static SkillImportException ioFailed() {
        return new SkillImportException(Kind.IO_FAILED, null, null, null);
    }

    public Kind kind() {
        return kind;
    }

    public SkillImportRejectReason reason() {
        return reason;
    }

    /** 문제 항목 경로(zip 안 원래 표기). 없으면 null. */
    public String entry() {
        return entry;
    }

    /** 이름 사유({@code NAME_INVALID}·{@code NAME_EXISTS})의 스킬 이름. */
    public String name() {
        return name;
    }
}
