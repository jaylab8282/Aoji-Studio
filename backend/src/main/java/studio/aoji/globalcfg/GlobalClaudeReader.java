package studio.aoji.globalcfg;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import studio.aoji.config.AppProperties;
import studio.aoji.globalcfg.GlobalSnapshot.PluginInstall;
import studio.aoji.globalcfg.GlobalSnapshot.Problem;
import studio.aoji.mcp.McpFileParser;
import studio.aoji.mcp.McpServerDef;
import studio.aoji.usage.UsageArea;
import studio.aoji.usage.UsageChangedNotifier;
import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.ObjectMapper;

/**
 * 전역 Claude 설정 읽기 (ADR-79 결정 5~7, ADR-85, FR-023-AC5, NFR-15·NFR-07). 연결된 파일의 크기·mtime(과
 * 거기서 찾은 플러그인 MCP 정의 파일)을 {@value #POLL_MILLIS}ms마다 보고 바뀌면 다시 읽는다. 읽는 키는 필요한
 * 것만이고 나머지는 {@code skipChildren()}한다: {@code ~/.claude.json}은 {@code mcpServers},
 * {@code projects["<hostPath>"]}의 {@code mcpServers}·{@code enabledMcpjsonServers}·
 * {@code disabledMcpjsonServers}·{@code disabledMcpServers}, {@code cachedUsageUtilization}(한도 키만).
 * {@code ~/.claude/settings.json}은 {@code enabledPlugins}만 본다. {@code .credentials.json}은 열지 않는다.
 * 서버 정의는 읽는 즉시 가린 값으로 바꾼다.
 *
 * <p>간격: 아키텍처 표기는 2초이지만 AC가 "바꾸면 2초 안"이므로 읽는 시간까지 들어오도록 1초로 본다(stat 몇 개).
 */
@Component
public class GlobalClaudeReader {

    static final long POLL_MILLIS = 1000;
    private static final Logger log = LoggerFactory.getLogger(GlobalClaudeReader.class);
    private static final String CONNECTED_PREFIX = "connected:";

    private final GlobalClaudeMounts mounts;
    private final AppProperties appProperties;
    private final McpFileParser mcpFileParser;
    private final UsageCacheParser usageCacheParser;
    private final UsageChangedNotifier notifier;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    private volatile GlobalSnapshot snapshot;
    /** 마지막으로 읽을 때의 연결 여부·파일 상태. 키 {@code connected:<항목>} 또는 파일 경로. */
    private Map<String, String> signature = Map.of();

    public GlobalClaudeReader(
            GlobalClaudeMounts mounts,
            AppProperties appProperties,
            McpFileParser mcpFileParser,
            UsageCacheParser usageCacheParser,
            UsageChangedNotifier notifier,
            ObjectMapper objectMapper,
            Clock clock) {
        this.mounts = mounts;
        this.appProperties = appProperties;
        this.mcpFileParser = mcpFileParser;
        this.usageCacheParser = usageCacheParser;
        this.notifier = notifier;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    /** 가장 최근에 읽은 결과. 아직 읽은 적이 없으면 지금 읽는다. */
    public GlobalSnapshot snapshot() {
        GlobalSnapshot current = snapshot;
        if (current == null) {
            synchronized (this) {
                if (snapshot == null) {
                    reload(false);
                }
                current = snapshot;
            }
        }
        return current;
    }

    @Scheduled(fixedDelay = POLL_MILLIS, initialDelay = POLL_MILLIS)
    void poll() {
        try {
            refresh();
        } catch (RuntimeException e) {
            log.warn("전역 설정 갱신 실패: reason={}", e.getClass().getSimpleName());
        }
    }

    /**
     * 연결 여부·파일 상태가 바뀌었으면 다시 읽고 {@code usage-changed}({@code mcp}·{@code settings}, 한도 캐시가
     * 바뀌면 {@code limits}도)를 알린다.
     *
     * @return 다시 읽었다
     */
    public synchronized boolean refresh() {
        if (snapshot == null) {
            reload(false);
            return true;
        }
        if (currentSignature(signature.keySet()).equals(signature)) {
            return false;
        }
        reload(true);
        return true;
    }

    private void reload(boolean notify) {
        GlobalSnapshot previous = snapshot;
        Map<String, String> readStats = new LinkedHashMap<>();
        List<Problem> problems = new ArrayList<>();
        Instant now = clock.instant();
        boolean anyConnected = false;

        List<McpServerDef> globalServers = new ArrayList<>();
        Set<String> enabledJson = new LinkedHashSet<>();
        Set<String> disabledJson = new LinkedHashSet<>();
        Set<String> disabledMcp = new LinkedHashSet<>();
        UsageCache usageCache = null;
        Map<String, Boolean> enabledPlugins = new LinkedHashMap<>();
        List<PluginInstall> plugins = new ArrayList<>();

        for (GlobalClaudeItem item : GlobalClaudeItem.values()) {
            boolean connected = mounts.connected(item);
            readStats.put(CONNECTED_PREFIX + item.key(), Boolean.toString(connected));
            anyConnected |= connected;
        }

        if (mounts.connected(GlobalClaudeItem.CLAUDE_JSON)) {
            Path file = mounts.path(GlobalClaudeItem.CLAUDE_JSON);
            readStats.put(file.toString(), stat(file));
            ClaudeJson parsed = readClaudeJson(file);
            if (parsed == null) {
                problems.add(parseProblem("global", "~/.claude.json", lastLine));
            } else {
                globalServers.addAll(parsed.servers);
                enabledJson.addAll(parsed.enabled);
                disabledJson.addAll(parsed.disabled);
                disabledMcp.addAll(parsed.disabledMcp);
                usageCache = parsed.usageCache;
            }
        }
        if (mounts.connected(GlobalClaudeItem.SETTINGS)) {
            Path file = mounts.path(GlobalClaudeItem.SETTINGS);
            readStats.put(file.toString(), stat(file));
            Map<String, Boolean> parsed = readEnabledPlugins(file);
            if (parsed == null) {
                problems.add(parseProblem("plugin", "~/.claude/settings.json", lastLine));
            } else {
                enabledPlugins.putAll(parsed);
            }
        }
        if (mounts.connected(GlobalClaudeItem.PLUGINS)) {
            readPlugins(readStats, problems, plugins);
        }

        Instant readAt = anyConnected ? now : null;
        GlobalSnapshot next = new GlobalSnapshot(
                readAt, globalServers, enabledJson, disabledJson, disabledMcp, usageCache, enabledPlugins, plugins, problems);
        snapshot = next;
        signature = readStats;

        if (notify && previous != null) {
            Consumer<String> mark = notifier::markChanged;
            mark.accept(UsageArea.MCP);
            mark.accept(UsageArea.SETTINGS);
            if (!Objects.equals(previous.usageCache(), next.usageCache())) {
                mark.accept(UsageArea.LIMITS);
            }
        }
    }

    // ---- ~/.claude.json ----------------------------------------------------------------------------------------

    private record ClaudeJson(
            List<McpServerDef> servers,
            Set<String> enabled,
            Set<String> disabled,
            Set<String> disabledMcp,
            UsageCache usageCache) {}

    /** 마지막 파싱 실패 줄(reload는 synchronized 안에서만 돈다). */
    private Integer lastLine;

    private ClaudeJson readClaudeJson(Path file) {
        lastLine = null;
        List<McpServerDef> servers = new ArrayList<>();
        Set<String> enabled = new LinkedHashSet<>();
        Set<String> disabled = new LinkedHashSet<>();
        Set<String> disabledMcp = new LinkedHashSet<>();
        UsageCache usageCache = null;
        try (InputStream in = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS);
                JsonParser parser = objectMapper.createParser(in)) {
            if (parser.nextToken() != JsonToken.START_OBJECT) {
                lastLine = parser.currentLocation().getLineNr();
                return null;
            }
            while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
                String key = parser.currentName();
                JsonToken value = parser.nextToken();
                if (key.equals("mcpServers") && value == JsonToken.START_OBJECT) {
                    mcpFileParser.readServerMap(parser, servers);
                } else if (key.equals("projects") && value == JsonToken.START_OBJECT) {
                    readProjects(parser, servers, enabled, disabled, disabledMcp);
                } else if (key.equals("cachedUsageUtilization")) {
                    usageCache = usageCacheParser.parse(parser);
                } else {
                    parser.skipChildren();
                }
            }
            if (parser.currentToken() != JsonToken.END_OBJECT) {
                lastLine = parser.currentLocation().getLineNr();
                return null;
            }
        } catch (JacksonException e) {
            lastLine = e.getLocation() == null ? null : e.getLocation().getLineNr();
            return null;
        } catch (IOException e) {
            return null;
        }
        return new ClaudeJson(servers, enabled, disabled, disabledMcp, usageCache);
    }

    private void readProjects(
            JsonParser parser,
            List<McpServerDef> servers,
            Set<String> enabled,
            Set<String> disabled,
            Set<String> disabledMcp) {
        String hostPath = stripSlash(appProperties.getHostPath());
        while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
            String projectPath = parser.currentName();
            JsonToken value = parser.nextToken();
            if (value != JsonToken.START_OBJECT || !stripSlash(projectPath).equals(hostPath)) {
                parser.skipChildren();
                continue;
            }
            while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
                String key = parser.currentName();
                JsonToken inner = parser.nextToken();
                switch (key) {
                    case "mcpServers" -> {
                        if (inner == JsonToken.START_OBJECT) {
                            mcpFileParser.readServerMap(parser, servers);
                        } else {
                            parser.skipChildren();
                        }
                    }
                    case "enabledMcpjsonServers" -> readStrings(parser, enabled);
                    case "disabledMcpjsonServers" -> readStrings(parser, disabled);
                    case "disabledMcpServers" -> readStrings(parser, disabledMcp);
                    default -> parser.skipChildren();
                }
            }
        }
    }

    /** 파서는 값 위치에 있다. 배열이면 문자열 원소만 모으고 {@code END_ARRAY}에서 멈춘다. */
    static void readStrings(JsonParser parser, Set<String> into) {
        if (parser.currentToken() != JsonToken.START_ARRAY) {
            parser.skipChildren();
            return;
        }
        JsonToken token;
        while ((token = parser.nextToken()) != JsonToken.END_ARRAY && token != null) {
            if (token == JsonToken.VALUE_STRING) {
                into.add(parser.getString());
            } else {
                parser.skipChildren();
            }
        }
    }

    // ---- ~/.claude/settings.json -------------------------------------------------------------------------------

    /** {@code enabledPlugins}만 읽는다. 파싱 실패면 null. */
    private Map<String, Boolean> readEnabledPlugins(Path file) {
        lastLine = null;
        Map<String, Boolean> result = new LinkedHashMap<>();
        try (InputStream in = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS);
                JsonParser parser = objectMapper.createParser(in)) {
            if (parser.nextToken() != JsonToken.START_OBJECT) {
                lastLine = parser.currentLocation().getLineNr();
                return null;
            }
            while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
                String key = parser.currentName();
                JsonToken value = parser.nextToken();
                if (key.equals("enabledPlugins") && value == JsonToken.START_OBJECT) {
                    while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
                        String plugin = parser.currentName();
                        JsonToken flag = parser.nextToken();
                        if (flag == JsonToken.VALUE_TRUE || flag == JsonToken.VALUE_FALSE) {
                            result.put(plugin, flag == JsonToken.VALUE_TRUE);
                        } else {
                            parser.skipChildren();
                        }
                    }
                } else {
                    parser.skipChildren();
                }
            }
            if (parser.currentToken() != JsonToken.END_OBJECT) {
                lastLine = parser.currentLocation().getLineNr();
                return null;
            }
        } catch (JacksonException e) {
            lastLine = e.getLocation() == null ? null : e.getLocation().getLineNr();
            return null;
        } catch (IOException e) {
            return null;
        }
        return result;
    }

    // ---- ~/.claude/plugins ---------------------------------------------------------------------------------------

    private record Install(String installPath, String projectPath) {}

    private void readPlugins(Map<String, String> readStats, List<Problem> problems, List<PluginInstall> plugins) {
        Path file = mounts.path(GlobalClaudeItem.PLUGINS).resolve("installed_plugins.json");
        readStats.put(file.toString(), stat(file));
        if (!GlobalClaudeMounts.noLinkBetween(mounts.mountRoot(), file)
                || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
            return;
        }
        Map<String, List<Install>> installs = readInstalledPlugins(file);
        if (installs == null) {
            problems.add(parseProblem("plugin", "~/.claude/plugins/installed_plugins.json", lastLine));
            return;
        }
        String hostPath = stripSlash(appProperties.getHostPath());
        for (Map.Entry<String, List<Install>> entry : installs.entrySet()) {
            String key = entry.getKey();
            String pluginName = key.contains("@") ? key.substring(0, key.indexOf('@')) : key;
            Set<String> seenPaths = new LinkedHashSet<>();
            List<McpServerDef> servers = new ArrayList<>();
            for (Install install : entry.getValue()) {
                if (install.projectPath != null && !stripSlash(install.projectPath).equals(hostPath)) {
                    continue; // 다른 프로젝트 전용 설치
                }
                if (install.installPath == null || !seenPaths.add(install.installPath)) {
                    continue; // 같은 installPath는 한 번만
                }
                Path dir = containerPath(install.installPath);
                if (dir == null) {
                    problems.add(new Problem("plugin", "~/.claude/plugins/" + pluginName, "outside-link", null));
                    continue;
                }
                readPluginDefinitions(dir, pluginName, readStats, problems, servers);
            }
            plugins.add(new PluginInstall(key, pluginName, dedupe(servers)));
        }
    }

    private void readPluginDefinitions(
            Path dir, String pluginName, Map<String, String> readStats, List<Problem> problems, List<McpServerDef> into) {
        Path pluginsRoot = mounts.path(GlobalClaudeItem.PLUGINS);
        Path mcpJson = dir.resolve(".mcp.json");
        Path pluginJson = dir.resolve(".claude-plugin").resolve("plugin.json");
        record Source(Path file, McpFileParser.Shape shape) {}
        for (Source source : List.of(
                new Source(mcpJson, McpFileParser.Shape.WRAPPED_OR_FLAT),
                new Source(pluginJson, McpFileParser.Shape.WRAPPED_ONLY))) {
            readStats.put(source.file.toString(), stat(source.file));
            if (!GlobalClaudeMounts.noLinkBetween(pluginsRoot, source.file)) {
                problems.add(new Problem("plugin", "~/.claude/plugins/" + pluginName, "outside-link", null));
                continue;
            }
            McpFileParser.Result result = mcpFileParser.read(source.file, source.shape);
            if (result.parseError()) {
                problems.add(parseProblem("plugin", "~/.claude/plugins/" + pluginName, result.line()));
            } else {
                into.addAll(result.servers());
            }
        }
    }

    private static List<McpServerDef> dedupe(List<McpServerDef> servers) {
        Map<String, McpServerDef> byName = new LinkedHashMap<>();
        for (McpServerDef server : servers) {
            byName.putIfAbsent(server.name(), server);
        }
        return new ArrayList<>(byName.values());
    }

    /** {@code {version, plugins: {키: [ {installPath, projectPath, …} ]}}}. {@code plugins}가 객체가 아니면 null. */
    private Map<String, List<Install>> readInstalledPlugins(Path file) {
        lastLine = null;
        Map<String, List<Install>> result = new LinkedHashMap<>();
        boolean sawPlugins = false;
        try (InputStream in = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS);
                JsonParser parser = objectMapper.createParser(in)) {
            if (parser.nextToken() != JsonToken.START_OBJECT) {
                lastLine = parser.currentLocation().getLineNr();
                return null;
            }
            while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
                String key = parser.currentName();
                JsonToken value = parser.nextToken();
                if (key.equals("plugins")) {
                    if (value != JsonToken.START_OBJECT) {
                        lastLine = parser.currentTokenLocation().getLineNr();
                        return null;
                    }
                    sawPlugins = true;
                    while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
                        String pluginKey = parser.currentName();
                        if (parser.nextToken() == JsonToken.START_ARRAY) {
                            result.put(pluginKey, readInstallArray(parser));
                        } else {
                            parser.skipChildren();
                        }
                    }
                } else {
                    parser.skipChildren();
                }
            }
            if (parser.currentToken() != JsonToken.END_OBJECT) {
                lastLine = parser.currentLocation().getLineNr();
                return null;
            }
        } catch (JacksonException e) {
            lastLine = e.getLocation() == null ? null : e.getLocation().getLineNr();
            return null;
        } catch (IOException e) {
            return null;
        }
        if (!sawPlugins) {
            lastLine = 1;
            return null;
        }
        return result;
    }

    private static List<Install> readInstallArray(JsonParser parser) {
        List<Install> installs = new ArrayList<>();
        JsonToken token;
        while ((token = parser.nextToken()) != JsonToken.END_ARRAY && token != null) {
            if (token != JsonToken.START_OBJECT) {
                parser.skipChildren();
                continue;
            }
            String installPath = null;
            String projectPath = null;
            while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
                String key = parser.currentName();
                JsonToken value = parser.nextToken();
                if (key.equals("installPath") && value == JsonToken.VALUE_STRING) {
                    installPath = parser.getString();
                } else if (key.equals("projectPath") && value == JsonToken.VALUE_STRING) {
                    projectPath = parser.getString();
                } else {
                    parser.skipChildren();
                }
            }
            installs.add(new Install(installPath, projectPath));
        }
        return installs;
    }

    /**
     * 호스트 경로의 {@code installPath}를 컨테이너 경로로 바꾼다. {@code <홈>/.claude/plugins/} 밖이거나 링크가
     * 끼어 있으면 null(NFR-07).
     */
    private Path containerPath(String installPath) {
        String hostPlugins = stripSlash(appProperties.getClaudeHomeHost()) + "/.claude/plugins";
        String normalized = stripSlash(installPath);
        if (!normalized.startsWith(hostPlugins + "/")) {
            return null;
        }
        Path pluginsRoot = mounts.path(GlobalClaudeItem.PLUGINS);
        Path resolved = pluginsRoot.resolve(normalized.substring(hostPlugins.length() + 1)).normalize();
        if (!resolved.startsWith(pluginsRoot.normalize()) || resolved.equals(pluginsRoot.normalize())) {
            return null;
        }
        return GlobalClaudeMounts.noLinkBetween(pluginsRoot, resolved) ? resolved : null;
    }

    // ---- 변경 감지 -------------------------------------------------------------------------------------------------

    private Map<String, String> currentSignature(Set<String> keys) {
        Map<String, String> now = new LinkedHashMap<>();
        for (String key : keys) {
            if (key.startsWith(CONNECTED_PREFIX)) {
                GlobalClaudeItem item = itemOf(key.substring(CONNECTED_PREFIX.length()));
                now.put(key, Boolean.toString(item != null && mounts.connected(item)));
            } else {
                now.put(key, stat(Path.of(key)));
            }
        }
        return now;
    }

    private static GlobalClaudeItem itemOf(String key) {
        for (GlobalClaudeItem item : GlobalClaudeItem.values()) {
            if (item.key().equals(key)) {
                return item;
            }
        }
        return null;
    }

    /** 크기·mtime(링크는 따라가지 않는다). 없으면 {@code absent}. */
    private static String stat(Path file) {
        try {
            BasicFileAttributes attrs = Files.readAttributes(file, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            return attrs.size() + ":" + attrs.lastModifiedTime().toInstant();
        } catch (IOException e) {
            return "absent";
        }
    }

    private static Problem parseProblem(String source, String file, Integer line) {
        log.warn("전역 설정 읽기 실패: source={} file={} reason=parse line={}", source, file, line);
        return new Problem(source, file, "parse", line);
    }

    private static String stripSlash(String path) {
        String value = path == null ? "" : path;
        while (value.length() > 1 && value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }
}
