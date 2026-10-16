package studio.aoji.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import studio.aoji.globalcfg.GlobalClaudeReader;
import studio.aoji.support.ClaudeHomeFixture;
import studio.aoji.support.FixtureFiles;
import studio.aoji.support.UsageScenario;
import studio.aoji.usage.PeriodQuery;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 09 MCP 목록 합치기 (FR-023-AC1~AC3·E1, ADR-85). {@code project-usage} + {@code claude-home-basic} 임시 사본에
 * {@code usage.jsonl}을 재생한 뒤 {@code expected.json}의 {@code mcp}와 비교한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class McpCatalogTest {

    private static final String HOST_PATH = "/Users/jaybee/Desktop/AojiStudio";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @TempDir
    static Path claudeHome;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    McpCatalog catalog;

    @Autowired
    GlobalClaudeReader globalReader;

    @Autowired
    Clock clock;

    @Autowired
    ObjectMapper objectMapper;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        FixtureFiles.copyInto("project-usage", mountRoot);
        ClaudeHomeFixture.copyBasic(claudeHome, HOST_PATH);
        registry.add("aojistudio.host-path", () -> HOST_PATH);
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("aojistudio.claude-home-host", () -> ClaudeHomeFixture.HOME_HOST);
        registry.add("aojistudio.claude-home-mount", () -> claudeHome.toString());
    }

    private static boolean replayed;
    private final Map<Path, byte[]> originals = new HashMap<>();
    private long touch;

    @BeforeEach
    void replayOnce() throws Exception {
        if (!replayed) {
            UsageScenario.replay(mockMvc, mountRoot);
            replayed = true;
        }
    }

    @AfterEach
    void restoreFiles() throws IOException {
        for (Map.Entry<Path, byte[]> entry : originals.entrySet()) {
            Files.write(entry.getKey(), entry.getValue());
            bump(entry.getKey());
        }
        originals.clear();
        globalReader.refresh();
    }

    private void rewrite(Path file, String content) throws IOException {
        originals.putIfAbsent(file, Files.readAllBytes(file));
        Files.writeString(file, content, StandardCharsets.UTF_8);
        bump(file);
        globalReader.refresh();
    }

    private void bump(Path file) throws IOException {
        Files.setLastModifiedTime(file, FileTime.from(Instant.now().plusSeconds(++touch * 10)));
    }

    private JsonNode expected() throws IOException {
        return objectMapper.readTree(
                        Files.readString(FixtureFiles.fixtureDir("project-usage").resolve("expected.json")))
                .get("mcp");
    }

    private McpReport all() {
        return catalog.report(PeriodQuery.parse("all", "Asia/Seoul", clock));
    }

    private static McpReport.Server row(McpReport report, String name) {
        return report.servers().stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("[FR-023-AC1] 정규화 이름으로 한 행, 위치 모두, 표시 이름 오름차순 — expected.json 행과 일치")
    void rowsMatchExpectedMergedByNormalizedName() throws Exception {
        McpReport report = all();

        List<String> expectedNames = new ArrayList<>();
        expected().get("rows").forEach(r -> expectedNames.add(r.get("name").asString()));
        assertThat(report.servers()).extracting(McpReport.Server::name).containsExactlyElementsOf(expectedNames);
        for (JsonNode expectedRow : expected().get("rows")) {
            McpReport.Server actual = row(report, expectedRow.get("name").asString());
            List<McpReport.Location> locations = new ArrayList<>();
            for (JsonNode location : expectedRow.get("locations")) {
                locations.add(new McpReport.Location(
                        location.get("kind").asString(),
                        location.has("detail") ? location.get("detail").asString() : null));
            }
            assertThat(actual.locations()).as("locations " + actual.name()).isEqualTo(locations);
        }
        // 같은 이름(github)은 한 행에 프로젝트·전역 위치 둘
        assertThat(row(report, "github").locations()).extracting(McpReport.Location::kind).containsExactly("project", "global");
        assertThat(report.servers().stream().filter(s -> s.name().equals("github"))).hasSize(1);
        // 플러그인 서버는 plugin_<플러그인>_<서버> 호출 이름으로 호출 기록과 합쳐진다(기본 세션 1회)
        McpReport.Server demo = row(report, "demo-helper");
        assertThat(demo.locations()).containsExactly(new McpReport.Location("plugin", "demo-tools"));
        assertThat(demo.actualAgents()).containsExactly(new McpReport.AgentCount(null, 1));
        // 다른 프로젝트 전용 설치의 서버는 목록에 없다
        for (JsonNode name : expected().get("notListed")) {
            assertThat(report.servers()).extracting(McpReport.Server::name).doesNotContain(name.asString());
        }
    }

    @Test
    @DisplayName("[FR-023-AC1] 플러그인 .mcp.json 평평한 모양(T-FIX-15)의 서버도 목록에 있고 transport·url·command가 읽힌다")
    void flatShapePluginServersAreListed() {
        McpReport report = all();

        McpReport.Server flatHttp = row(report, "flat-http");
        assertThat(flatHttp.transport()).isEqualTo("http");
        assertThat(flatHttp.url()).isEqualTo("https://example.test/mcp/flat");
        McpReport.Server flatStdio = row(report, "flat-stdio");
        assertThat(flatStdio.transport()).isEqualTo("stdio");
        assertThat(flatStdio.command()).isEqualTo("node flat-stdio.js");
        assertThat(flatStdio.locations()).containsExactly(new McpReport.Location("plugin", "flat-tools"));
    }

    @Test
    @DisplayName("[FR-023-AC1] 활성 판정 세 출처: 프로젝트 settings(enabled/disabled)·전역 disabledMcpServers·enabledPlugins, 모르면 null")
    void activeDeterminationFromThreeSources() throws Exception {
        McpReport report = all();

        for (JsonNode expectedRow : expected().get("rows")) {
            McpReport.Server actual = row(report, expectedRow.get("name").asString());
            Boolean expectedActive = expectedRow.get("active").isNull() ? null : expectedRow.get("active").asBoolean();
            assertThat(actual.active()).as("active " + actual.name()).isEqualTo(expectedActive);
        }
        assertThat(row(report, "github").active()).isTrue();
        assertThat(row(report, "local-tool").active()).isFalse();
        assertThat(row(report, "docs-server").active()).isFalse();
        assertThat(row(report, "qa-browser").active()).isNull();
        assertThat(row(report, "claude_ai_drive").active()).isNull();
    }

    @Test
    @DisplayName("[FR-023-AC1] enableAllProjectMcpServers true면 disabled가 아닌 프로젝트 서버는 활성, 비활성 플러그인은 false")
    void enableAllAndDisabledPlugin() throws Exception {
        Path settings = mountRoot.resolve(".claude").resolve("settings.json");
        rewrite(settings, "{\"enableAllProjectMcpServers\": true, \"disabledMcpjsonServers\": [\"local-tool\"]}");
        Path claudeSettings = claudeHome.resolve(".claude").resolve("settings.json");
        rewrite(claudeSettings, "{\"enabledPlugins\": {\"demo-tools@aoji-fixture-market\": false}}");

        McpReport report = all();

        assertThat(row(report, "github").active()).isTrue();
        assertThat(row(report, "local-tool").active()).isFalse();
        assertThat(row(report, "demo-helper").active()).isFalse();
        assertThat(row(report, "flat-http").active()).as("enabledPlugins에 키 없음").isNull();
    }

    @Test
    @DisplayName("[FR-023-AC3] 호출 기록만 있는 서버는 위치 called-only, 정의 정보 없음, 호출 기록 유지")
    void calledOnlyServers() {
        McpReport report = all();

        McpReport.Server drive = row(report, "claude_ai_drive");
        assertThat(drive.locations()).containsExactly(new McpReport.Location("called-only", null));
        assertThat(drive.transport()).isNull();
        assertThat(drive.command()).isNull();
        assertThat(drive.url()).isNull();
        assertThat(drive.maskedSettings()).isEmpty();
        assertThat(drive.inheritAllCount()).isNull();
        assertThat(drive.actualAgents()).containsExactly(new McpReport.AgentCount("proj-lead", 1));
        assertThat(report.sources().get(3).key()).isEqualTo("agents");
        assertThat(report.sources().get(3).calledOnlyCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("[FR-023-AC3] 정의가 있는 서버는 호출 기록이 없어도 called-only가 아니다")
    void definedServersWithoutCallsAreNotCalledOnly() {
        McpReport.Server flatStdio = row(all(), "flat-stdio");

        assertThat(flatStdio.locations()).extracting(McpReport.Location::kind).doesNotContain("called-only");
        assertThat(flatStdio.actualAgents()).isEmpty();
    }

    @Test
    @DisplayName("[FR-023-AC1] 읽은 곳 카드 4칸은 project → global → plugin → agents 순서이고 상태·개수가 맞다")
    void sourceCards() {
        McpReport report = all();

        assertThat(report.sources()).extracting(McpReport.Source::key).containsExactly("project", "global", "plugin", "agents");
        assertThat(report.sources()).extracting(McpReport.Source::state).containsExactly("read", "connected", "connected", "read");
        assertThat(report.sources()).extracting(McpReport.Source::serverCount).containsExactly(2, 2, 3, 1);
        assertThat(report.sourceErrors()).isEmpty();
        assertThat(report.globalReadAt()).isNotNull();
    }

    @Test
    @DisplayName("[FR-023-AC2] 설정 값은 가린 것만 나간다: 응답 어디에도 원래 값(표지)이 없다")
    void maskedSettingsOnly() throws Exception {
        McpReport report = all();
        String json = objectMapper.writeValueAsString(report);

        assertThat(json).doesNotContain(ClaudeHomeFixture.ENV_MARKER).doesNotContain(ClaudeHomeFixture.ACCOUNT_MARKER);
        McpReport.Server github = row(report, "github");
        assertThat(github.url()).isEqualTo("https://example.test/mcp/github?access=••••••••&org=••••••••");
        assertThat(github.maskedSettings())
                .containsExactly(new McpReport.MaskedSetting("headers", "Authorization", "••••••••"));
        assertThat(row(report, "local-tool").maskedSettings())
                .containsExactly(new McpReport.MaskedSetting("env", "LOCAL_TOOL_KEY", "••••••••"));
        assertThat(row(report, "local-tool").command()).isEqualTo("node tools/local-tool.js --quiet");
        assertThat(row(report, "docs-server").maskedSettings())
                .containsExactly(new McpReport.MaskedSetting("env", "DOCS_SERVER_KEY", "••••••••"));
    }

    @Test
    @DisplayName("[FR-023-E1] 프로젝트 .mcp.json이 깨지면 줄 번호와 함께 sourceErrors에 넣고 다른 출처는 그대로 보인다")
    void brokenProjectMcpJsonKeepsOtherSources() throws Exception {
        rewrite(mountRoot.resolve(".mcp.json"), "{\n  \"mcpServers\": {\n    \"github\": }\n}\n");

        McpReport report = all();

        assertThat(report.sourceErrors())
                .containsExactly(new McpReport.SourceError("project", ".mcp.json", "parse", 3));
        assertThat(report.sources().get(0).state()).isEqualTo("error");
        assertThat(report.servers()).extracting(McpReport.Server::name)
                .contains("docs-server", "demo-helper", "flat-http", "qa-browser", "claude_ai_drive", "github");
        assertThat(report.servers()).extracting(McpReport.Server::name).doesNotContain("local-tool");
        assertThat(row(report, "github").locations()).containsExactly(new McpReport.Location("global", null));
    }

    @Test
    @DisplayName("[FR-023-E1] 전역 ~/.claude.json이 깨져도 줄 번호를 남기고 프로젝트·플러그인 출처는 유지")
    void brokenClaudeJsonKeepsOtherSources() throws Exception {
        rewrite(claudeHome.resolve(".claude.json"), "{\n  \"mcpServers\": [\n");

        McpReport report = all();

        assertThat(report.sourceErrors()).anySatisfy(e -> {
            assertThat(e.source()).isEqualTo("global");
            assertThat(e.file()).isEqualTo("~/.claude.json");
            assertThat(e.kind()).isEqualTo("parse");
            assertThat(e.line()).isNotNull();
        });
        assertThat(report.sources().get(1).state()).isEqualTo("error");
        assertThat(report.sources().get(0).state()).isEqualTo("read");
        assertThat(row(report, "local-tool").locations()).containsExactly(new McpReport.Location("project", null));
        assertThat(row(report, "demo-helper").locations()).containsExactly(new McpReport.Location("plugin", "demo-tools"));
    }

    @Test
    @DisplayName("[FR-023-AC3] 플러그인 installPath가 <홈>/.claude/plugins/ 밖이면 읽지 않고 outside-link를 sourceErrors에 둔다")
    void pluginInstallPathOutsideIsOutsideLink() throws Exception {
        rewrite(
                claudeHome.resolve(".claude/plugins/installed_plugins.json"),
                "{\"version\":2,\"plugins\":{\"demo-tools@aoji-fixture-market\":[{\"installPath\":\"/etc\"}],"
                        + "\"flat-tools@aoji-fixture-market\":[{\"installPath\":\""
                        + ClaudeHomeFixture.HOME_HOST
                        + "/.claude/plugins/cache/aoji-fixture-market/flat-tools/1.0.0\"}]}}");

        McpReport report = all();

        assertThat(report.sourceErrors())
                .containsExactly(new McpReport.SourceError("plugin", "~/.claude/plugins/demo-tools", "outside-link", null));
        assertThat(report.sources().get(2).state()).isEqualTo("error");
        assertThat(report.servers()).extracting(McpReport.Server::name).doesNotContain("demo-helper").contains("flat-http");
    }

    @Test
    @DisplayName("[FR-023-E1] installed_plugins.json의 plugins가 객체가 아니면 plugin 출처 parse 오류")
    void pluginsNotObjectIsParseErrorInReport() throws Exception {
        rewrite(claudeHome.resolve(".claude/plugins/installed_plugins.json"), "{\"version\":2,\"plugins\":[]}");

        McpReport report = all();

        assertThat(report.sourceErrors()).extracting(McpReport.SourceError::source, McpReport.SourceError::kind)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("plugin", "parse"));
        assertThat(report.servers()).extracting(McpReport.Server::name).doesNotContain("demo-helper", "flat-http");
    }
}
