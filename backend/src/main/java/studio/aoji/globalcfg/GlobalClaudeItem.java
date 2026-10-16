package studio.aoji.globalcfg;

/** 전역 Claude 설정 연결 항목 4개 (ADR-79, api-spec {@code GlobalClaudeItemKey}). 선언 순서가 응답 순서다. */
public enum GlobalClaudeItem {
    /** {@code ~/.claude.json}(파일) */
    CLAUDE_JSON("claudeJson", false),
    /** {@code ~/.claude/settings.json}(파일) */
    SETTINGS("settings", false),
    /** {@code ~/.claude/plugins/}(폴더) */
    PLUGINS("plugins", true),
    /** {@code ~/.claude/projects/}(폴더) */
    PROJECTS("projects", true);

    private final String key;
    private final boolean folder;

    GlobalClaudeItem(String key, boolean folder) {
        this.key = key;
        this.folder = folder;
    }

    /** api-spec 키 이름. */
    public String key() {
        return key;
    }

    public boolean folder() {
        return folder;
    }
}
