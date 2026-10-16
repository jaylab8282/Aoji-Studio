package studio.aoji.usage;

/** 집계 한 칸: 구간 안에서 +1 할 (kind, subject, agent). {@code agent} ''는 기본 세션. */
public record HookUsageEntry(String kind, String subject, String agent) {

    /** 이 칸이 바꾸는 화면 영역(ADR-86): MCP 호출은 {@code mcp}, 나머지는 {@code skills}. */
    public String area() {
        return UsageKind.MCP_CALL.equals(kind) ? UsageArea.MCP : UsageArea.SKILLS;
    }
}
