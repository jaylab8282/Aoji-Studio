package studio.aoji.mcp;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import studio.aoji.config.AppProperties;
import studio.aoji.files.PathGuard;
import studio.aoji.globalcfg.GlobalClaudeItem;
import studio.aoji.globalcfg.GlobalClaudeMounts;
import studio.aoji.globalcfg.GlobalClaudeReader;
import studio.aoji.globalcfg.GlobalSnapshot;
import studio.aoji.registry.AgentDefinition;
import studio.aoji.registry.AgentsScanResult;
import studio.aoji.registry.ParsedAgentFile;
import studio.aoji.registry.ProjectFolderScanner;
import studio.aoji.registry.RegistryService;
import studio.aoji.usage.PeriodQuery;
import studio.aoji.usage.UsageKind;
import studio.aoji.usage.UsageRepository;
import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.ObjectMapper;

/**
 * 09 MCP 서버 목록 + 사용 에이전트 (FR-023·FR-024, ADR-85). 프로젝트 {@code .mcp.json}·전역({@code ~/.claude.json})·
 * 플러그인·에이전트 정의의 서버와 기간 안 호출 기록을 정규화 이름으로 한 행에 합친다. 읽기 전용이고, 설정 값은
 * 읽는 즉시 가린 값만 다룬다(FR-023-AC2).
 */
@Service
public class McpCatalog {

    private static final Logger log = LoggerFactory.getLogger(McpCatalog.class);
    private static final List<String> KIND_ORDER = List.of("project", "global", "plugin", "agent", "called-only");

    private final AppProperties appProperties;
    private final GlobalClaudeReader globalReader;
    private final GlobalClaudeMounts globalMounts;
    private final McpFileParser fileParser;
    private final ProjectFolderScanner projectFolderScanner;
    private final PathGuard pathGuard;
    private final UsageRepository usageRepository;
    private final RegistryService registryService;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public McpCatalog(
            AppProperties appProperties,
            GlobalClaudeReader globalReader,
            GlobalClaudeMounts globalMounts,
            McpFileParser fileParser,
            ProjectFolderScanner projectFolderScanner,
            PathGuard pathGuard,
            UsageRepository usageRepository,
            RegistryService registryService,
            ObjectMapper objectMapper,
            Clock clock) {
        this.appProperties = appProperties;
        this.globalReader = globalReader;
        this.globalMounts = globalMounts;
        this.fileParser = fileParser;
        this.projectFolderScanner = projectFolderScanner;
        this.pathGuard = pathGuard;
        this.usageRepository = usageRepository;
        this.registryService = registryService;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    /** Claude Code 도구 이름 규칙: {@code [^A-Za-z0-9_-]} → {@code _} (ADR-85 결정 2). */
    public static String normalize(String name) {
        return name.replaceAll("[^A-Za-z0-9_-]", "_");
    }

    private record Definition(McpServerDef server, String kind, String detail, Boolean active) {}

    private static final class Group {
        private final String key;
        private final List<Definition> definitions = new ArrayList<>();

        private Group(String key) {
            this.key = key;
        }
    }

    /** 프로젝트 {@code .claude/settings.json}에서 읽는 활성 판정 키. */
    private record ProjectSettings(boolean enableAll, Set<String> enabled, Set<String> disabled, Integer errorLine, boolean error) {}

    public McpReport report(PeriodQuery query) {
        Path mountRoot = Path.of(appProperties.getMountPath());
        GlobalSnapshot global = globalReader.snapshot();
        boolean hookConfigured = registryService.current().hookConfigured();
        List<McpReport.SourceError> errors = new ArrayList<>();
        Map<String, Group> groups = new LinkedHashMap<>();

        // 프로젝트
        Path projectMcpFile = mountRoot.resolve(".mcp.json");
        McpFileParser.Result projectFile = GlobalClaudeMounts.noLinkBetween(mountRoot, projectMcpFile)
                ? fileParser.read(projectMcpFile, McpFileParser.Shape.WRAPPED_ONLY)
                : McpFileParser.Result.absent();
        ProjectSettings projectSettings = readProjectSettings(mountRoot, mountRoot.resolve(".claude").resolve("settings.json"));
        boolean projectError = false;
        if (projectFile.parseError()) {
            projectError = true;
            errors.add(new McpReport.SourceError("project", ".mcp.json", "parse", projectFile.line()));
            log.warn("MCP 출처 읽기 실패: source=project file=.mcp.json reason=parse");
        }
        if (projectSettings.error()) {
            projectError = true;
            errors.add(new McpReport.SourceError("project", ".claude/settings.json", "parse", projectSettings.errorLine()));
            log.warn("MCP 출처 읽기 실패: source=project file=.claude/settings.json reason=parse");
        }
        Set<String> enabled = new LinkedHashSet<>(projectSettings.enabled());
        enabled.addAll(global.enabledMcpjsonServers());
        Set<String> disabled = new LinkedHashSet<>(projectSettings.disabled());
        disabled.addAll(global.disabledMcpjsonServers());
        Set<String> projectNames = new TreeSet<>();
        for (McpServerDef server : projectFile.servers()) {
            Boolean active = disabled.contains(server.name())
                    ? Boolean.FALSE
                    : (projectSettings.enableAll() || enabled.contains(server.name()) ? Boolean.TRUE : null);
            add(groups, normalize(server.name()), new Definition(server, "project", null, active));
            projectNames.add(server.name());
        }

        // 전역
        boolean claudeJsonConnected = globalMounts.connected(GlobalClaudeItem.CLAUDE_JSON);
        Set<String> globalNames = new TreeSet<>();
        for (McpServerDef server : global.globalServers()) {
            Boolean active = global.disabledMcpServers().contains(server.name()) ? Boolean.FALSE : null;
            add(groups, normalize(server.name()), new Definition(server, "global", null, active));
            globalNames.add(server.name());
        }
        if (!claudeJsonConnected) {
            errors.add(new McpReport.SourceError("global", "~/.claude.json", "not-connected", null));
        }

        // 플러그인
        boolean settingsConnected = globalMounts.connected(GlobalClaudeItem.SETTINGS);
        boolean pluginsConnected = globalMounts.connected(GlobalClaudeItem.PLUGINS);
        Set<String> pluginKeys = new TreeSet<>();
        for (GlobalSnapshot.PluginInstall install : global.plugins()) {
            Boolean active = global.enabledPlugins().get(install.key());
            for (McpServerDef server : install.servers()) {
                String key = normalize("plugin_" + install.pluginName() + "_" + server.name());
                add(groups, key, new Definition(server, "plugin", install.pluginName(), active));
                pluginKeys.add(key);
            }
        }
        if (!settingsConnected) {
            errors.add(new McpReport.SourceError("plugin", "~/.claude/settings.json", "not-connected", null));
        }
        if (!pluginsConnected) {
            errors.add(new McpReport.SourceError("plugin", "~/.claude/plugins", "not-connected", null));
        }
        boolean globalError = false;
        boolean pluginError = false;
        for (GlobalSnapshot.Problem problem : global.problems()) {
            errors.add(new McpReport.SourceError(problem.source(), problem.file(), problem.kind(), problem.line()));
            if (problem.source().equals("global")) {
                globalError = true;
            } else {
                pluginError = true;
            }
        }

        // 에이전트
        AgentsScanResult agents = projectFolderScanner.scanAgents(mountRoot, pathGuard);
        List<AgentDefinition> validAgents = new ArrayList<>();
        for (ParsedAgentFile parsed : agents.validAgents()) {
            validAgents.add(parsed.definition());
        }
        validAgents.sort(Comparator.comparing(AgentDefinition::name));
        Set<String> agentServerNames = new TreeSet<>();
        for (AgentDefinition agent : validAgents) {
            for (McpServerDef server : agent.inlineMcpServers()) {
                add(groups, normalize(server.name()), new Definition(server, "agent", agent.name(), null));
                agentServerNames.add(server.name());
            }
        }

        // 호출 기록(기간 안 mcp-call). hook이 설정되지 않았으면 실제 사용은 없다.
        Map<String, Map<String, Long>> callsByServer = new HashMap<>();
        LocalDate earliest = null;
        List<UsageRepository.HookAggRow> rows = usageRepository.findHookAgg(query.fromBucket(), query.toBucket());
        for (UsageRepository.HookAggRow row : rows) {
            LocalDate date = query.localDate(row.bucket());
            if (earliest == null || date.isBefore(earliest)) {
                earliest = date;
            }
            if (hookConfigured && row.kind().equals(UsageKind.MCP_CALL)) {
                callsByServer
                        .computeIfAbsent(row.subject(), k -> new TreeMap<>())
                        .merge(row.agent(), row.count(), Long::sum);
            }
        }
        int calledOnlyCount = 0;
        for (String called : callsByServer.keySet()) {
            if (!groups.containsKey(called)) {
                calledOnlyCount++;
                groups.put(called, new Group(called));
            }
        }

        int inheritAll = (int) validAgents.stream().filter(a -> a.tools() == null).count();
        List<McpReport.Server> servers = new ArrayList<>();
        for (Group group : groups.values()) {
            servers.add(buildServer(group, validAgents, inheritAll, callsByServer.get(group.key), hookConfigured));
        }
        servers.sort(Comparator.comparing(McpReport.Server::name, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(McpReport.Server::name));

        List<McpReport.Source> sources = List.of(
                new McpReport.Source("project", projectError ? "error" : "read", projectNames.size(), 0),
                new McpReport.Source(
                        "global",
                        globalError ? "error" : (claudeJsonConnected ? "connected" : "not-connected"),
                        globalNames.size(),
                        0),
                new McpReport.Source(
                        "plugin",
                        pluginError ? "error" : (settingsConnected && pluginsConnected ? "connected" : "not-connected"),
                        pluginKeys.size(),
                        0),
                new McpReport.Source("agents", "read", agentServerNames.size(), calledOnlyCount));

        LocalDate today = clock.instant().atZone(query.zone()).toLocalDate();
        McpReport.Range range = query.firstDate() != null
                ? new McpReport.Range(query.firstDate(), query.lastDate())
                : new McpReport.Range(earliest, today);
        return new McpReport(
                query.period(),
                range,
                hookConfigured,
                sources,
                errors,
                global.readAt() == null ? null : global.readAt().atZone(clock.getZone()).toOffsetDateTime(),
                servers);
    }

    private static void add(Map<String, Group> groups, String key, Definition definition) {
        groups.computeIfAbsent(key, Group::new).definitions.add(definition);
    }

    private McpReport.Server buildServer(
            Group group,
            List<AgentDefinition> validAgents,
            int inheritAll,
            Map<String, Long> calls,
            boolean hookConfigured) {
        List<Definition> definitions = new ArrayList<>(group.definitions);
        definitions.sort(Comparator.comparingInt(d -> KIND_ORDER.indexOf(d.kind())));

        if (definitions.isEmpty()) {
            List<McpReport.AgentCount> actual = actualAgents(calls, hookConfigured);
            Set<String> used = new TreeSet<>();
            for (McpReport.AgentCount count : actual) {
                if (count.agent() != null) {
                    used.add(count.agent());
                }
            }
            return new McpReport.Server(
                    group.key,
                    List.of(new McpReport.Location("called-only", null)),
                    null,
                    null,
                    null,
                    null,
                    List.of(),
                    List.of(),
                    null,
                    actual,
                    used.size());
        }

        Definition first = definitions.getFirst();
        Set<McpReport.Location> locations = new LinkedHashSet<>();
        boolean anyTrue = false;
        boolean anyFalse = false;
        for (Definition definition : definitions) {
            locations.add(new McpReport.Location(definition.kind(), definition.detail()));
            anyTrue |= Boolean.TRUE.equals(definition.active());
            anyFalse |= Boolean.FALSE.equals(definition.active());
        }
        Boolean active = anyTrue ? Boolean.TRUE : (anyFalse ? Boolean.FALSE : null);

        List<McpReport.MaskedSetting> settings = new ArrayList<>();
        for (McpServerDef.Setting setting : first.server().settings()) {
            settings.add(new McpReport.MaskedSetting(setting.group(), setting.key(), McpMasker.MASK));
        }

        List<String> defined = new ArrayList<>();
        String toolPrefix = "mcp__" + group.key;
        for (AgentDefinition agent : validAgents) {
            boolean viaTools = agent.tools() != null
                    && agent.tools().stream().anyMatch(t -> t.equals(toolPrefix) || t.startsWith(toolPrefix + "__"));
            boolean viaServers = agent.mcpServers().stream().anyMatch(n -> normalize(n).equals(group.key));
            if (viaTools || viaServers) {
                defined.add(agent.name());
            }
        }
        List<McpReport.AgentCount> actual = actualAgents(calls, hookConfigured);
        Set<String> used = new TreeSet<>(defined);
        if (actual != null) {
            for (McpReport.AgentCount count : actual) {
                if (count.agent() != null) {
                    used.add(count.agent());
                }
            }
        }
        List<McpReport.Location> sortedLocations = new ArrayList<>(locations);
        sortedLocations.sort(Comparator.comparingInt((McpReport.Location l) -> KIND_ORDER.indexOf(l.kind()))
                .thenComparing(l -> l.detail() == null ? "" : l.detail()));
        return new McpReport.Server(
                first.server().name(),
                sortedLocations,
                active,
                first.server().transport(),
                first.server().command(),
                first.server().url(),
                settings,
                defined,
                inheritAll,
                actual,
                used.size());
    }

    /** hook이 설정되지 않았으면 null(`기록 없음`), 아니면 횟수 내림차순·`기본 세션`(null) 마지막. */
    private static List<McpReport.AgentCount> actualAgents(Map<String, Long> calls, boolean hookConfigured) {
        if (!hookConfigured) {
            return null;
        }
        List<McpReport.AgentCount> result = new ArrayList<>();
        if (calls != null) {
            for (Map.Entry<String, Long> entry : calls.entrySet()) {
                if (entry.getValue() > 0) {
                    result.add(new McpReport.AgentCount(entry.getKey().isEmpty() ? null : entry.getKey(), entry.getValue()));
                }
            }
        }
        result.sort(Comparator.comparing((McpReport.AgentCount c) -> c.agent() == null)
                .thenComparing(Comparator.comparingLong(McpReport.AgentCount::count).reversed())
                .thenComparing(c -> c.agent() == null ? "" : c.agent()));
        return result;
    }

    /** 프로젝트 {@code .claude/settings.json}에서 {@code enableAllProjectMcpServers}·{@code enabledMcpjsonServers}·{@code disabledMcpjsonServers}만 읽는다. */
    private ProjectSettings readProjectSettings(Path mountRoot, Path file) {
        // 마운트 루트부터 파일까지 중간 폴더·파일이 링크면 읽지 않는다(없는 파일로 본다, NFR-07).
        if (!GlobalClaudeMounts.noLinkBetween(mountRoot, file)) {
            return new ProjectSettings(false, Set.of(), Set.of(), null, false);
        }
        Set<String> enabled = new LinkedHashSet<>();
        Set<String> disabled = new LinkedHashSet<>();
        boolean enableAll = false;
        try (InputStream in = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS);
                JsonParser parser = objectMapper.createParser(in)) {
            if (parser.nextToken() != JsonToken.START_OBJECT) {
                return new ProjectSettings(false, Set.of(), Set.of(), parser.currentLocation().getLineNr(), true);
            }
            while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
                String key = parser.currentName();
                JsonToken value = parser.nextToken();
                switch (key) {
                    case "enableAllProjectMcpServers" -> enableAll = value == JsonToken.VALUE_TRUE;
                    case "enabledMcpjsonServers" -> readStrings(parser, enabled);
                    case "disabledMcpjsonServers" -> readStrings(parser, disabled);
                    default -> parser.skipChildren();
                }
            }
            if (parser.currentToken() != JsonToken.END_OBJECT) {
                return new ProjectSettings(false, Set.of(), Set.of(), parser.currentLocation().getLineNr(), true);
            }
        } catch (JacksonException e) {
            return new ProjectSettings(false, Set.of(), Set.of(), e.getLocation() == null ? null : e.getLocation().getLineNr(), true);
        } catch (IOException e) {
            return new ProjectSettings(false, Set.of(), Set.of(), null, false);
        }
        return new ProjectSettings(enableAll, enabled, disabled, null, false);
    }

    private static void readStrings(JsonParser parser, Set<String> into) {
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
}
