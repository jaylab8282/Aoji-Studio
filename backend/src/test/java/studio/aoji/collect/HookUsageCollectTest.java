package studio.aoji.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import studio.aoji.support.FixtureFiles;
import studio.aoji.usage.UsageRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * hook 수집 → 일별 집계 통합 (FR-003-AC10·E1, FR-019-AC1, FR-024-AC2). T-R4-01 {@code project-usage}를 임시
 * 폴더로 복사하고 {@code usage.jsonl} 38건을 그대로 POST한 뒤 {@code expected.json}과 비교한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class HookUsageCollectTest {

    private static final String AGENT_NONE = "기본 세션";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcClient jdbcClient;

    @Autowired
    UsageRepository usageRepository;

    @Autowired
    ObjectMapper objectMapper;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        FixtureFiles.copyInto("project-usage", mountRoot);
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
    }

    private String token() throws IOException {
        return Files.readString(mountRoot.resolve(".aojistudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
    }

    private void postHook(String json) throws Exception {
        mockMvc.perform(post("/hooks/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-AojiStudio-Collect-Token", token())
                        .content(json))
                .andExpect(status().isNoContent());
    }

    private long aggTotal() {
        return jdbcClient.sql("SELECT COALESCE(SUM(count), 0) FROM usage_hook_agg").query(Long.class).single();
    }

    private long eventCount() {
        return jdbcClient.sql("SELECT COUNT(*) FROM events").query(Long.class).single();
    }

    @Test
    void replayedUsageScenarioMatchesExpectedAggregates() throws Exception {
        // [FR-019-AC1][FR-024-AC2][FR-003-AC10] usage.jsonl 재생 → 호출·직접 호출·세션 시작·MCP 서버별 에이전트 횟수
        JsonNode expected = objectMapper.readTree(
                Files.readString(FixtureFiles.fixtureDir("project-usage").resolve("expected.json")));
        for (String line : Files.readAllLines(Path.of("..", "tools", "replay", "scenarios", "usage.jsonl"))) {
            if (!line.isBlank()) {
                postHook(line);
            }
        }

        List<UsageRepository.HookAggRow> rows = usageRepository.findHookAgg(null, null);
        Map<String, Long> skillCall = new LinkedHashMap<>();
        Map<String, Long> skillSlash = new LinkedHashMap<>();
        Map<String, Long> mcpByServerAgent = new LinkedHashMap<>();
        long sessionStarts = 0;
        for (UsageRepository.HookAggRow row : rows) {
            switch (row.kind()) {
                case "skill-call" -> skillCall.merge(row.subject(), row.count(), Long::sum);
                case "skill-slash" -> skillSlash.merge(row.subject(), row.count(), Long::sum);
                case "session-start" -> sessionStarts += row.count();
                case "mcp-call" -> mcpByServerAgent.merge(
                        row.subject() + "|" + (row.agent().isEmpty() ? AGENT_NONE : row.agent()),
                        row.count(),
                        Long::sum);
                default -> throw new AssertionError(row.kind());
            }
        }

        for (JsonNode skill : expected.get("skills").get("rows")) {
            String name = skill.get("name").asText();
            assertThat(skillCall.getOrDefault(name, 0L)).as("call " + name).isEqualTo(skill.get("call").asLong());
            assertThat(skillSlash.getOrDefault(name, 0L)).as("slash " + name).isEqualTo(skill.get("slash").asLong());
        }
        for (String ignored : List.of("design-review-extra", "x")) {
            assertThat(skillSlash).doesNotContainKey(ignored);
        }
        assertThat(skillSlash).doesNotContainKey("ghost-skill");
        assertThat(skillCall).containsEntry("ghost-skill", 2L);
        assertThat(sessionStarts)
                .isEqualTo(expected.get("eventCounts").get("sessionStart").asLong()
                        + expected.get("eventCounts").get("subagentStart").asLong());
        Map<String, Long> expectedMcp = new LinkedHashMap<>();
        for (JsonNode row : expected.get("mcp").get("rows")) {
            for (JsonNode actual : row.get("actualAgents")) {
                expectedMcp.put(row.get("callName").asText() + "|" + actual.get("agent").asText(), actual.get("count").asLong());
            }
        }
        assertThat(mcpByServerAgent).isEqualTo(expectedMcp);
        // [FR-003-AC10] 슬래시 판정된 요약만 남고 그 밖 프롬프트는 '-'
        List<String> promptSummaries = jdbcClient
                .sql("SELECT summary FROM events WHERE hook_event_name = 'UserPromptSubmit' ORDER BY id")
                .query(String.class)
                .list();
        assertThat(promptSummaries)
                .containsExactly(
                        "/design-review", "/release-notes", "/manual-only", "/bad-yaml", "-", "-", "-", "-");
    }

    @Test
    void unusedEventIsAcceptedButStoredAndAggregatedNowhere() throws Exception {
        // [FR-003-E1] 쓰지 않는 이벤트는 204 이지만 events·집계 어디에도 남지 않는다
        long events = eventCount();
        long total = aggTotal();

        postHook("{\"session_id\":\"e1\",\"hook_event_name\":\"PreCompact\",\"agent_type\":\"proj-dev\"}");

        assertThat(eventCount()).isEqualTo(events);
        assertThat(aggTotal()).isEqualTo(total);
    }

    @Test
    void storedEventWithoutUsageMeaningDoesNotTouchAggregates() throws Exception {
        // [FR-019-AC1] 저장되지만 네 종류가 아닌 이벤트(Stop, PostToolUse Skill)는 집계 변화 없음
        long events = eventCount();
        long total = aggTotal();

        postHook("{\"session_id\":\"e2\",\"hook_event_name\":\"Stop\"}");
        postHook("{\"session_id\":\"e2\",\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Skill\","
                + "\"tool_input\":{\"skill\":\"design-review\"}}");

        assertThat(eventCount()).isEqualTo(events + 2);
        assertThat(aggTotal()).isEqualTo(total);
    }
}
