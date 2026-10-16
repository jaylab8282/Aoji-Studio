package studio.aoji.globalcfg;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import studio.aoji.mcp.McpServerDef;

/**
 * 전역 Claude 설정에서 읽은 결과 — 필요한 키만, 서버 정의는 가린 값으로만 담는다(NFR-15, ADR-79 결정 6).
 * 계정·이메일·{@code accountUuid}·{@code settings.json}의 {@code env}는 어느 필드에도 없다.
 *
 * @param readAt 내용을 마지막으로 읽은 시각. 연결된 항목이 하나도 없으면 null
 * @param globalServers {@code ~/.claude.json}의 최상위 {@code mcpServers} + {@code projects["<hostPath>"].mcpServers}
 * @param enabledMcpjsonServers {@code projects["<hostPath>"].enabledMcpjsonServers}
 * @param disabledMcpjsonServers {@code projects["<hostPath>"].disabledMcpjsonServers}
 * @param disabledMcpServers {@code projects["<hostPath>"].disabledMcpServers}
 * @param usageCache 한도 캐시. 없거나 형태가 다르면 null
 * @param enabledPlugins {@code ~/.claude/settings.json}의 {@code enabledPlugins}
 * @param plugins {@code installed_plugins.json}의 플러그인(키 순)
 * @param problems 읽기 문제(parse·outside-link). 연결 안 됨은 {@link GlobalClaudeMounts}가 따로 안다
 */
public record GlobalSnapshot(
        Instant readAt,
        List<McpServerDef> globalServers,
        Set<String> enabledMcpjsonServers,
        Set<String> disabledMcpjsonServers,
        Set<String> disabledMcpServers,
        UsageCache usageCache,
        Map<String, Boolean> enabledPlugins,
        List<PluginInstall> plugins,
        List<Problem> problems) {

    public GlobalSnapshot {
        globalServers = List.copyOf(globalServers);
        enabledMcpjsonServers = Set.copyOf(enabledMcpjsonServers);
        disabledMcpjsonServers = Set.copyOf(disabledMcpjsonServers);
        disabledMcpServers = Set.copyOf(disabledMcpServers);
        enabledPlugins = Map.copyOf(enabledPlugins);
        plugins = List.copyOf(plugins);
        problems = List.copyOf(problems);
    }

    /**
     * 플러그인 한 개({@code <플러그인>@<마켓>} 키)의 MCP 서버.
     *
     * @param key {@code installed_plugins.json}의 키
     * @param pluginName {@code @} 앞 이름
     */
    public record PluginInstall(String key, String pluginName, List<McpServerDef> servers) {

        public PluginInstall {
            servers = List.copyOf(servers);
        }
    }

    /**
     * 읽기 문제 한 줄(api-spec {@code sourceErrors}).
     *
     * @param source {@code global} | {@code plugin}
     * @param file 표시할 파일 이름
     * @param kind {@code parse} | {@code outside-link}
     * @param line parse일 때 줄 번호
     */
    public record Problem(String source, String file, String kind, Integer line) {}

    static GlobalSnapshot empty() {
        return new GlobalSnapshot(null, List.of(), Set.of(), Set.of(), Set.of(), null, Map.of(), List.of(), List.of());
    }
}
