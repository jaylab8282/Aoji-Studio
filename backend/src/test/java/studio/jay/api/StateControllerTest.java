package studio.jay.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import studio.jay.registry.RegistryService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * {@code GET /api/state} (api-spec, NFR-02). 에이전트 100·워크플로우 30 fixture로 목록 API
 * 1초 기준을 측정한다. fixture는 {@code tools/fixtures/}에 두지 않고(대용량·일회성) 임시 폴더에
 * 테스트가 직접 만든다(태스크 지시).
 */
@SpringBootTest
@AutoConfigureMockMvc
class StateControllerTest {

    private static final Logger log = LoggerFactory.getLogger(StateControllerTest.class);
    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";
    private static final int AGENT_COUNT = 100;
    private static final int WORKFLOW_COUNT = 30;

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    RegistryService registryService;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        Path agentsDir = mountRoot.resolve(".claude").resolve("agents");
        Files.createDirectories(agentsDir);
        for (int i = 0; i < AGENT_COUNT; i++) {
            String name = "agent%03d".formatted(i);
            Files.writeString(
                    agentsDir.resolve(name + ".md"),
                    "---\nname: " + name + "\ndescription: 에이전트 " + i + "\n---\n본문 " + i + "\n",
                    StandardCharsets.UTF_8);
        }

        Path teamsDir = mountRoot.resolve(".jaystudio").resolve("teams");
        Files.createDirectories(teamsDir);
        for (int w = 0; w < WORKFLOW_COUNT; w++) {
            String name = "workflow%02d".formatted(w);
            String lead = "agent%03d".formatted((w * 3) % AGENT_COUNT);
            String member1 = "agent%03d".formatted((w * 3 + 1) % AGENT_COUNT);
            String member2 = "agent%03d".formatted((w * 3 + 2) % AGENT_COUNT);
            String json =
                    """
                    {"schemaVersion":1,"name":"%s","description":"워크플로우 %d","lead":"%s","members":["%s","%s"]}"""
                            .formatted(name, w, lead, member1, member2);
            Files.writeString(teamsDir.resolve(name + ".json"), json, StandardCharsets.UTF_8);
        }

        registry.add("jaystudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("jaystudio.public-port", () -> "4180");
        registry.add("jaystudio.mount-path", () -> mountRoot.toString());
        registry.add("jaystudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @Test
    void stateReturnsSnapshotMatchingRegistryCounts() throws Exception {
        // GET /api/state 기본 동작: registry가 fixture의 에이전트 100·워크플로우 30을 그대로 반영
        registryService.rescanNow();

        MvcResult result = mockMvc.perform(get("/api/state").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("registry").get("agents").size()).isEqualTo(AGENT_COUNT);
        assertThat(body.get("registry").get("workflows").size()).isEqualTo(WORKFLOW_COUNT);
        assertThat(body.get("live")).isNotNull();
        assertThat(body.get("config")).isNotNull();
        assertThat(body.get("recentEvents")).isNotNull();
    }

    @Test
    void stateRespondsUnderOneSecondWithHundredAgentsAndThirtyWorkflows() throws Exception {
        // [NFR-02] 에이전트 100·워크플로우 30 fixture GET /api/state < 1s
        registryService.rescanNow();

        int iterations = 20;
        long[] durationsNanos = new long[iterations];
        for (int i = 0; i < iterations; i++) {
            long start = System.nanoTime();
            mockMvc.perform(get("/api/state").header("Origin", ALLOWED_ORIGIN)).andExpect(status().isOk());
            durationsNanos[i] = System.nanoTime() - start;
        }

        long maxNanos = 0;
        for (long d : durationsNanos) {
            maxNanos = Math.max(maxNanos, d);
        }
        double maxMillis = maxNanos / 1_000_000.0;

        log.info("GET /api/state max over {} iterations (agents={}, workflows={}): {} ms", iterations, AGENT_COUNT, WORKFLOW_COUNT, maxMillis);
        assertThat(maxMillis).isLessThan(1000.0);
    }
}
