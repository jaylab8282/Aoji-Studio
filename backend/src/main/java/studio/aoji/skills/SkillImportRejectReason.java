package studio.aoji.skills;

/** api-spec {@code SkillImportRejectReason}. */
public enum SkillImportRejectReason {
    NOT_ZIP,
    CORRUPT,
    NO_SKILL_MD,
    TOO_LARGE,
    TOO_MANY_FILES,
    UNPACKED_TOO_LARGE,
    ABSOLUTE_PATH,
    PATH_TRAVERSAL,
    SYMLINK,
    NAME_INVALID,
    NAME_EXISTS
}
