package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import studio.aoji.globalcfg.GlobalClaudeReader;
import studio.aoji.registry.RegistryService;
import studio.aoji.support.ClaudeHomeFixture;
import studio.aoji.support.FixtureFiles;
import studio.aoji.support.UsageScenario;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** {@code GET /api/mcp} (FR-023·FR-024, api-spec {@code McpReport}). 연결된 전역 설정 + hook 재생 데이터. */
@SpringBootTest
@AutoConfigureMockMvc
class McpControllerTest {

    private static final String ORIGIN = "http://127.0.0.1:4180";
    private static final String HOST_PATH = "/Users/jaybee/Desktop/AojiStudio";
    private static final String URL = "/api/mcp?period=all&tz=Asia/Seoul";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @TempDir
    static Path claudeHome;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    RegistryService registryService;

    @Autowired
    GlobalClaudeReader globalReader;

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
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private byte[] originalProjectSettings;
    private byte[] originalClaudeJson;

    @BeforeEach
    void setUp() throws Exception {
        if (!replayed) {
            UsageScenario.replay(mockMvc, mountRoot);
            replayed = true;
        }
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        logs.start();
        root.addAppender(logs);
        root.setLevel(Level.DEBUG);
    }

    @AfterEach
    void tearDown() throws Exception {
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        root.detachAppender(logs);
        root.setLevel(Level.INFO);
        if (originalProjectSettings != null) {
            Files.write(mountRoot.resolve(".claude/settings.json"), originalProjectSettings);
            originalProjectSettings = null;
            registryService.rescanNow();
        }
        if (originalClaudeJson != null) {
            Path file = claudeHome.resolve(".claude.json");
            Files.write(file, originalClaudeJson);
            Files.setLastModifiedTime(file, FileTime.from(Instant.now().plusSeconds(600)));
            originalClaudeJson = null;
            globalReader.refresh();
        }
    }

    private JsonNode getReport() throws Exception {
        MockHttpServletResponse response =
                mockMvc.perform(get(URL).header("Origin", ORIGIN)).andReturn().getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        String body = response.getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).doesNotContain(ClaudeHomeFixture.ENV_MARKER).doesNotContain(ClaudeHomeFixture.ACCOUNT_MARKER);
        return objectMapper.readTree(body);
    }

    private static JsonNode server(JsonNode report, String name) {
        for (JsonNode server : report.get("servers")) {
            if (server.get("name").asString().equals(name)) {
                return server;
            }
        }
        throw new AssertionError("서버 행 없음: " + name);
    }

    private static List<String> names(JsonNode report) {
        List<String> result = new ArrayList<>();
        report.get("servers").forEach(s -> result.add(s.get("name").asString()));
        return result;
    }

    private static List<String> texts(JsonNode array) {
        List<String> result = new ArrayList<>();
        array.forEach(n -> result.add(n.asString()));
        return result;
    }

    private JsonNode expectedRow(String name) throws IOException {
        JsonNode rows = objectMapper
                .readTree(Files.readString(FixtureFiles.fixtureDir("project-usage").resolve("expected.json")))
                .get("mcp")
                .get("rows");
        for (JsonNode row : rows) {
            if (row.get("name").asString().equals(name)) {
                return row;
            }
        }
        throw new AssertionError("expected 행 없음: " + name);
    }

    @Test
    @DisplayName("[FR-023-AC1] 응답이 api-spec McpReport 모양이다: 필수 키·sources 4칸·servers 이름순")
    void responseMatchesSchemaShape() throws Exception {
        JsonNode report = getReport();

        for (String key : List.of("period", "range", "hookConfigured", "sources", "sourceErrors", "globalReadAt", "servers")) {
            assertThat(report.has(key)).as(key).isTrue();
        }
        assertThat(report.get("period").asString()).isEqualTo("all");
        assertThat(report.get("hookConfigured").asBoolean()).isTrue();
        assertThat(report.get("range").has("from")).isTrue();
        assertThat(report.get("range").get("to").asString()).matches("\\d{4}-\\d{2}-\\d{2}");
        List<String> sourceKeys = new ArrayList<>();
        report.get("sources").forEach(s -> sourceKeys.add(s.get("key").asString()));
        assertThat(sourceKeys).containsExactly("project", "global", "plugin", "agents");
        for (JsonNode server : report.get("servers")) {
            for (String key : List.of(
                    "name", "locations", "active", "transport", "command", "url", "maskedSettings", "definedAgents",
                    "inheritAllCount", "actualAgents", "usedAgentCount")) {
                assertThat(server.has(key)).as(server.get("name").asString() + "." + key).isTrue();
            }
        }
        assertThat(names(report)).isSortedAccordingTo(String.CASE_INSENSITIVE_ORDER);
        assertThat(report.get("globalReadAt").asString()).matches("\\d{4}-\\d{2}-\\d{2}T.*[+-]\\d{2}:\\d{2}");
    }

    @Test
    @DisplayName("[FR-024-AC1] 정의상 사용 에이전트(tools mcp__ 허용·mcpServers 참조/정의)와 전체 상속 수(inheritAllCount)")
    void definedAgentsAndInheritAll() throws Exception {
        JsonNode report = getReport();

        for (String name : List.of("github", "docs-server", "qa-browser", "local-tool", "demo-helper", "flat-http")) {
            JsonNode expected = expectedRow(name);
            JsonNode actual = server(report, name);
            assertThat(texts(actual.get("definedAgents"))).as("defined " + name).isEqualTo(texts(expected.get("definedAgents")));
            assertThat(actual.get("inheritAllCount").asInt()).as("inheritAll " + name).isEqualTo(expected.get("inheritAllCount").asInt());
        }
        assertThat(texts(server(report, "github").get("definedAgents"))).containsExactly("mcp-inline", "mcp-reader");
        assertThat(server(report, "claude_ai_drive").get("inheritAllCount").isNull()).as("호출 기록만 서버는 null").isTrue();
        assertThat(texts(server(report, "github").get("definedAgents"))).doesNotContain("mcp-limited");
    }

    @Test
    @DisplayName("[FR-024-AC2] 실제 사용 에이전트·횟수(기본 세션 포함, agent null), 횟수 내림차순·기본 세션 마지막")
    void actualAgentsIncludeDefaultSession() throws Exception {
        JsonNode report = getReport();

        for (String name : List.of("github", "docs-server", "qa-browser", "demo-helper", "claude_ai_drive", "flat-http")) {
            JsonNode expected = expectedRow(name).get("actualAgents");
            JsonNode actual = server(report, name).get("actualAgents");
            assertThat(actual.size()).as("size " + name).isEqualTo(expected.size());
            for (int i = 0; i < expected.size(); i++) {
                String agent = expected.get(i).get("agent").asString();
                JsonNode actualAgent = actual.get(i).get("agent");
                if (agent.equals("기본 세션")) {
                    assertThat(actualAgent.isNull()).as(name + " 기본 세션은 agent null").isTrue();
                } else {
                    assertThat(actualAgent.asString()).isEqualTo(agent);
                }
                assertThat(actual.get(i).get("count").asLong()).isEqualTo(expected.get(i).get("count").asLong());
            }
        }
        JsonNode github = server(report, "github").get("actualAgents");
        assertThat(github.get(0).get("agent").asString()).isEqualTo("proj-dev");
        assertThat(github.get(0).get("count").asInt()).isEqualTo(3);
        assertThat(github.get(1).get("agent").isNull()).isTrue();
        assertThat(server(report, "flat-http").get("actualAgents").isArray()).as("호출 없음 = 빈 배열").isTrue();
        assertThat(server(report, "flat-http").get("actualAgents")).isEmpty();
    }

    @Test
    @DisplayName("[FR-024-AC4] usedAgentCount = 정의상 ∪ 실제, 기본 세션·전체 상속 제외")
    void usedAgentCountExcludesDefaultSessionAndInheritAll() throws Exception {
        JsonNode report = getReport();

        for (JsonNode expected : objectMapper
                .readTree(Files.readString(FixtureFiles.fixtureDir("project-usage").resolve("expected.json")))
                .get("mcp")
                .get("rows")) {
            assertThat(server(report, expected.get("name").asString()).get("usedAgentCount").asInt())
                    .as(expected.get("name").asString())
                    .isEqualTo(expected.get("usedAgentCount").asInt());
        }
        assertThat(server(report, "github").get("usedAgentCount").asInt()).isEqualTo(3);
        assertThat(server(report, "demo-helper").get("usedAgentCount").asInt()).as("기본 세션 1회뿐").isZero();
        assertThat(server(report, "flat-stdio").get("usedAgentCount").asInt()).as("전체 상속 6명은 세지 않는다").isZero();
    }

    @Test
    @DisplayName("[FR-024-E1] hook 미설정이면 actualAgents는 null(기록 없음), 정의상 값은 그대로, 호출 기록만 행은 없다")
    void hookNotConfiguredHasNullActualAgents() throws Exception {
        Path settings = mountRoot.resolve(".claude/settings.json");
        originalProjectSettings = Files.readAllBytes(settings);
        Files.writeString(settings, "{}");
        registryService.rescanNow();

        JsonNode report = getReport();

        assertThat(report.get("hookConfigured").asBoolean()).isFalse();
        for (JsonNode server : report.get("servers")) {
            assertThat(server.get("actualAgents").isNull()).as(server.get("name").asString()).isTrue();
        }
        assertThat(texts(server(report, "github").get("definedAgents"))).containsExactly("mcp-inline", "mcp-reader");
        assertThat(names(report)).doesNotContain("claude_ai_drive");
        assertThat(server(report, "github").get("usedAgentCount").asInt()).as("정의상 2명만").isEqualTo(2);
    }

    @Test
    @DisplayName("[FR-023-E1] .claude/settings.json이 깨지면 줄 번호와 함께 sourceErrors, 프로젝트 서버 목록은 유지")
    void brokenProjectSettingsReportsLine() throws Exception {
        Path settings = mountRoot.resolve(".claude/settings.json");
        originalProjectSettings = Files.readAllBytes(settings);
        Files.writeString(settings, "{\n  \"enabledMcpjsonServers\": [\n");
        registryService.rescanNow();

        JsonNode report = getReport();

        JsonNode error = report.get("sourceErrors").get(0);
        assertThat(error.get("source").asString()).isEqualTo("project");
        assertThat(error.get("file").asString()).isEqualTo(".claude/settings.json");
        assertThat(error.get("kind").asString()).isEqualTo("parse");
        assertThat(error.get("line").asInt()).isPositive();
        assertThat(server(report, "github").get("active").asBoolean()).as("전역 projects 항목의 enabledMcpjsonServers로 판정").isTrue();
        assertThat(server(report, "docs-server").get("name").asString()).isEqualTo("docs-server");
    }

    @Test
    @DisplayName("[FR-023-AC6] 쓰기 메서드(POST·PUT·PATCH·DELETE)는 405이고 응답·로그에 표지 AOJI-MARKER-ENV-91c2가 0회")
    void writeMethodsAreNotAllowedAndMarkerNeverLeaks() throws Exception {
        String token = objectMapper
                .readTree(mockMvc.perform(get("/api/auth/browser-token").header("Origin", ORIGIN))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("token")
                .asString();
        List<MockHttpServletRequestBuilder> writes = List.of(post("/api/mcp"), put("/api/mcp"), patch("/api/mcp"), delete("/api/mcp"));
        for (MockHttpServletRequestBuilder write : writes) {
            MockHttpServletResponse response = mockMvc.perform(write
                            .header("Origin", ORIGIN)
                            .header("X-AojiStudio-Browser-Token", token)
                            .contentType("application/json")
                            .content("{\"name\":\"x\",\"command\":\"node\"}"))
                    .andReturn()
                    .getResponse();
            assertThat(response.getStatus()).isEqualTo(405);
            assertThat(response.getContentAsString()).doesNotContain(ClaudeHomeFixture.ENV_MARKER);
        }
        getReport();
        assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage).noneMatch(m -> m.contains(ClaudeHomeFixture.ENV_MARKER));
    }

    @Test
    @DisplayName("[FR-023-AC6] period·tz가 틀리면 400 VALIDATION(fields.period·fields.tz)")
    void invalidQueryIsValidationError() throws Exception {
        MockHttpServletResponse response =
                mockMvc.perform(get("/api/mcp?period=1y&tz=Nowhere/City").header("Origin", ORIGIN)).andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(400);
        JsonNode body = objectMapper.readTree(response.getContentAsString());
        assertThat(body.get("code").asString()).isEqualTo("VALIDATION");
        assertThat(body.get("fields").has("period")).isTrue();
        assertThat(body.get("fields").has("tz")).isTrue();
    }

    @Test
    @DisplayName("[FR-023-AC5] 전역 ~/.claude.json이 바뀌면 2초 안에 목록과 globalReadAt이 갱신된다")
    void globalChangeIsPickedUpWithinTwoSeconds() throws Exception {
        Path claudeJson = claudeHome.resolve(".claude.json");
        originalClaudeJson = Files.readAllBytes(claudeJson);
        String before = getReport().get("globalReadAt").asString();
        assertThat(server(getReport(), "docs-server").get("name").asString()).isEqualTo("docs-server");

        Files.writeString(
                claudeJson, Files.readString(claudeJson).replace("\"docs-server\": {", "\"docs-renamed\": {"));
        Files.setLastModifiedTime(claudeJson, FileTime.from(Instant.now().plusSeconds(300)));
        long started = System.nanoTime();
        JsonNode report = null;
        while ((System.nanoTime() - started) / 1_000_000 < 2000) {
            report = getReport();
            if (names(report).contains("docs-renamed")) {
                break;
            }
            Thread.sleep(50);
        }

        assertThat(report).isNotNull();
        assertThat(server(report, "docs-renamed").get("locations").get(0).get("kind").asString()).isEqualTo("global");
        assertThat((System.nanoTime() - started) / 1_000_000).isLessThanOrEqualTo(2000);
        assertThat(report.get("globalReadAt").asString()).isNotEqualTo(before);
    }
}
