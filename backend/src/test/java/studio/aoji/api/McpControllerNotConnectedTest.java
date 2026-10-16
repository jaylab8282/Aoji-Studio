package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
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
import studio.aoji.support.FixtureFiles;
import studio.aoji.support.UsageScenario;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 전역 설정이 연결되지 않았을 때(홈 경로 없음) {@code GET /api/mcp} (FR-023-E2). */
@SpringBootTest
@AutoConfigureMockMvc
class McpControllerNotConnectedTest {

    private static final String ORIGIN = "http://127.0.0.1:4180";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        FixtureFiles.copyInto("project-usage", mountRoot);
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("aojistudio.claude-home-host", () -> "");
        registry.add("aojistudio.claude-home-mount", () -> "/nonexistent-claude-home");
    }

    private static boolean replayed;

    @BeforeEach
    void replayOnce() throws Exception {
        if (!replayed) {
            UsageScenario.replay(mockMvc, mountRoot);
            replayed = true;
        }
    }

    @Test
    @DisplayName("[FR-023-E2] 전역 연결 안 됨 → global·plugin sourceErrors not-connected, 프로젝트·에이전트·호출 기록은 유지")
    void notConnectedKeepsProjectAndCalls() throws Exception {
        JsonNode report = objectMapper.readTree(mockMvc.perform(get("/api/mcp?period=all&tz=Asia/Seoul").header("Origin", ORIGIN))
                .andReturn()
                .getResponse()
                .getContentAsString());

        List<String> errors = new ArrayList<>();
        report.get("sourceErrors").forEach(e -> errors.add(
                e.get("source").asString() + "|" + e.get("file").asString() + "|" + e.get("kind").asString()));
        assertThat(errors).containsExactlyInAnyOrder(
                "global|~/.claude.json|not-connected",
                "plugin|~/.claude/settings.json|not-connected",
                "plugin|~/.claude/plugins|not-connected");
        assertThat(report.get("sourceErrors").get(0).get("line").isNull()).isTrue();
        List<String> states = new ArrayList<>();
        report.get("sources").forEach(s -> states.add(s.get("state").asString()));
        assertThat(states).containsExactly("read", "not-connected", "not-connected", "read");
        assertThat(report.get("globalReadAt").isNull()).isTrue();

        List<String> names = new ArrayList<>();
        report.get("servers").forEach(s -> names.add(s.get("name").asString()));
        // 프로젝트 서버·에이전트 정의 서버는 유지
        assertThat(names).contains("github", "local-tool", "qa-browser");
        // 호출 기록은 유지: 정의를 못 읽은 서버는 호출 기록만으로 남는다
        assertThat(names).contains("claude_ai_drive", "docs-server", "plugin_demo-tools_demo-helper");
        for (JsonNode server : report.get("servers")) {
            if (server.get("name").asString().equals("docs-server")) {
                assertThat(server.get("locations").get(0).get("kind").asString()).isEqualTo("called-only");
                assertThat(server.get("actualAgents").get(0).get("count").asInt()).isEqualTo(2);
            }
            if (server.get("name").asString().equals("github")) {
                assertThat(server.get("locations").size()).as("전역 위치 없음").isEqualTo(1);
                assertThat(server.get("actualAgents").size()).isEqualTo(2);
            }
        }
    }
}
