package studio.aoji.mcp;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/** api-spec {@code McpReport} — {@code GET /api/mcp} 응답 (09, FR-023·FR-024, ADR-85). */
public record McpReport(
        String period,
        Range range,
        boolean hookConfigured,
        List<Source> sources,
        List<SourceError> sourceErrors,
        OffsetDateTime globalReadAt,
        List<Server> servers) {

    public McpReport {
        sources = List.copyOf(sources);
        sourceErrors = List.copyOf(sourceErrors);
        servers = List.copyOf(servers);
    }

    /** api-spec {@code UsageRange}. */
    public record Range(LocalDate from, LocalDate to) {}

    /**
     * 읽은 곳 카드 한 칸.
     *
     * @param key {@code project} | {@code global} | {@code plugin} | {@code agents}
     * @param state {@code read} | {@code connected} | {@code not-connected} | {@code error}
     * @param calledOnlyCount {@code agents} 칸만 의미(호출 기록만 N), 그 밖은 0
     */
    public record Source(String key, String state, int serverCount, int calledOnlyCount) {}

    /**
     * 출처 오류 줄.
     *
     * @param source {@code project} | {@code global} | {@code plugin}
     * @param kind {@code parse} | {@code not-connected} | {@code outside-link}
     * @param line parse일 때 줄 번호
     */
    public record SourceError(String source, String file, String kind, Integer line) {}

    /** api-spec {@code AgentCount}: {@code agent == null}이 {@code 기본 세션}. */
    public record AgentCount(String agent, long count) {}

    /**
     * api-spec {@code McpServer.locations[]}.
     *
     * @param kind {@code project} | {@code global} | {@code plugin} | {@code agent} | {@code called-only}
     * @param detail plugin = 플러그인 이름 / agent = 에이전트 name / 그 밖 null
     */
    public record Location(String kind, String detail) {}

    /** api-spec {@code McpServer.maskedSettings[]}. 값은 항상 {@code ••••••••}. */
    public record MaskedSetting(String group, String key, String value) {}

    /** api-spec {@code McpServer}. */
    public record Server(
            String name,
            List<Location> locations,
            Boolean active,
            String transport,
            String command,
            String url,
            List<MaskedSetting> maskedSettings,
            List<String> definedAgents,
            Integer inheritAllCount,
            List<AgentCount> actualAgents,
            int usedAgentCount) {

        public Server {
            locations = List.copyOf(locations);
            maskedSettings = List.copyOf(maskedSettings);
            definedAgents = List.copyOf(definedAgents);
            actualAgents = actualAgents == null ? null : List.copyOf(actualAgents);
        }
    }
}
