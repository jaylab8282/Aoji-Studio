package studio.aoji.usage;

/** {@code usage_hook_agg.kind} (ADR-80 결정 2). */
public final class UsageKind {

    public static final String SKILL_CALL = "skill-call";
    public static final String SKILL_SLASH = "skill-slash";
    public static final String SESSION_START = "session-start";
    public static final String MCP_CALL = "mcp-call";

    private UsageKind() {}
}
