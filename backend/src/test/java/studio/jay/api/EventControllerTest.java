package studio.jay.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import studio.jay.events.EventRepository;
import studio.jay.events.EventRow;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 실시간 이벤트 조회 (api-spec {@code GET /api/events}, {@code GET /api/agents/{name}/events},
 * FR-007-AC6, FR-005-AC6).
 */
@SpringBootTest
@AutoConfigureMockMvc
class EventControllerTest {

    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    EventRepository eventRepository;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws Exception {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Files.writeString(
                mountRoot.resolve(".claude").resolve("agents").resolve("architect.md"),
                "---\nname: architect\ndescription: 설계\n---\n본문\n",
                StandardCharsets.UTF_8);

        registry.add("jaystudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("jaystudio.public-port", () -> "4180");
        registry.add("jaystudio.mount-path", () -> mountRoot.toString());
        registry.add("jaystudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    private EventRow insert(String sessionId, String agentId, String agentType, OffsetDateTime at) {
        return eventRepository.insert(new EventRow(
                0, at, "PreToolUse", sessionId, agentId, agentType, "Bash", null, "/workspace",
                "tool", "도구 실행 · Bash", "ls"));
    }

    @Test
    void agentEventsReturnLatestTenIncludingSubagentRuns() throws Exception {
        // [FR-007-AC6] agent별 최신순 10개, 서브 실행 이벤트 포함
        OffsetDateTime base = OffsetDateTime.parse("2026-09-21T09:00:00+09:00");
        for (int i = 0; i < 9; i++) {
            insert("s-main", null, "architect", base.plusSeconds(i));
        }
        // 서브에이전트로 실행된 이벤트도 agent_type이 같으면 포함된다.
        insert("s-sub", "sub-1", "architect", base.plusSeconds(100));
        // 다른 에이전트 이벤트는 제외된다.
        insert("s-other", null, "developer", base.plusSeconds(200));

        MvcResult result = mockMvc.perform(get("/api/agents/architect/events").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode items = objectMapper.readTree(result.getResponse().getContentAsString()).get("items");
        assertThat(items.size()).isEqualTo(10);
        assertThat(items.get(0).get("agentId").asString()).isEqualTo("sub-1");
        for (JsonNode item : items) {
            assertThat(item.get("agentType").asString()).isEqualTo("architect");
        }
    }

    @Test
    void agentEventsDefaultLimitIsTen() throws Exception {
        OffsetDateTime base = OffsetDateTime.parse("2026-09-21T09:00:00+09:00");
        for (int i = 0; i < 15; i++) {
            insert("s-main", null, "architect", base.plusSeconds(i));
        }

        MvcResult result = mockMvc.perform(get("/api/agents/architect/events").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode items = objectMapper.readTree(result.getResponse().getContentAsString()).get("items");
        assertThat(items.size()).isEqualTo(10);
    }

    @Test
    void recentEventsLimitIsCappedAtFifty() throws Exception {
        // [FR-005-AC6] /api/events limit 50 상한
        OffsetDateTime base = OffsetDateTime.parse("2026-09-21T09:00:00+09:00");
        for (int i = 0; i < 60; i++) {
            insert("s" + i, null, "architect", base.plusSeconds(i));
        }

        MvcResult uncapped = mockMvc.perform(
                        get("/api/events").queryParam("limit", "200").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode uncappedItems = objectMapper.readTree(uncapped.getResponse().getContentAsString()).get("items");
        assertThat(uncappedItems.size()).isEqualTo(50);

        MvcResult defaulted = mockMvc.perform(get("/api/events").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode defaultedItems = objectMapper.readTree(defaulted.getResponse().getContentAsString()).get("items");
        assertThat(defaultedItems.size()).isEqualTo(50);
    }

    @Test
    void agentLabelUsesAgentTypeAndWorkflowIsResolvedFromRegistry() throws Exception {
        // agentLabel·workflow(ADR-09) — architect는 워크플로우 밖이라 workflow는 null
        // 다른 테스트가 남긴 행보다 항상 최신이도록 미래 시각을 쓴다(같은 컨텍스트를 공유하는 클래스 내 순서 무관).
        insert("s1", null, "architect", OffsetDateTime.parse("2026-12-31T23:59:59+09:00"));

        MvcResult result = mockMvc.perform(get("/api/events").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode item = objectMapper.readTree(result.getResponse().getContentAsString()).get("items").get(0);
        assertThat(item.get("agentLabel").asString()).isEqualTo("architect");
        assertThat(item.get("workflow").isNull()).isTrue();
    }
}
