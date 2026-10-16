package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import studio.aoji.support.ClaudeHomeFixture;
import studio.aoji.support.FixtureFiles;
import studio.aoji.usage.TranscriptIngestService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** {@code GET /api/cost}·{@code GET /api/pricing} (FR-025·FR-026, api-spec {@code CostReport}·{@code PriceTable}). */
@SpringBootTest(properties = "aojistudio.transcript-auto-start=false")
@AutoConfigureMockMvc
class CostControllerTest {

    private static final String ORIGIN = "http://127.0.0.1:4180";
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
    ObjectMapper objectMapper;

    @Autowired
    TranscriptIngestService ingestService;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        FixtureFiles.copyInto("project-basic", mountRoot);
        ClaudeHomeFixture.copyBasic(claudeHome, HOST_PATH);
        registry.add("aojistudio.host-path", () -> HOST_PATH);
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("aojistudio.claude-home-host", () -> ClaudeHomeFixture.HOME_HOST);
        registry.add("aojistudio.claude-home-mount", () -> claudeHome.toString());
    }

    private JsonNode expected() throws IOException {
        return objectMapper.readTree(
                Files.readString(FixtureFiles.fixtureDir("claude-home-basic").resolve("expected.json")));
    }

    private MockHttpServletResponse call(String url) throws Exception {
        return mockMvc.perform(get(url).header("Origin", ORIGIN)).andReturn().getResponse();
    }

    @Test
    @DisplayName("[FR-026-AC1][FR-026-AC6][FR-025-AC4] GET /api/cost: api-spec 모양·합계·금액·단가 없는 모델 제외 수 = expected.json")
    void costReportMatchesExpectedAndSchema() throws Exception {
        ingestService.ingestOnce();

        MockHttpServletResponse response = call("/api/cost?period=all&tz=Asia/Seoul");

        assertThat(response.getStatus()).isEqualTo(200);
        String body = response.getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("AOJI-MARKER-CONVO-7f3a").doesNotContain("E-");
        JsonNode report = objectMapper.readTree(body);
        for (String key : List.of("period", "range", "transcripts", "totals", "estimate", "byDate", "byModel", "bySession", "byAgent")) {
            assertThat(report.has(key)).as(key).isTrue();
        }
        assertThat(report.get("period").asString()).isEqualTo("all");
        assertThat(report.get("transcripts").get("connected").asBoolean()).isTrue();
        assertThat(report.get("transcripts").get("state").asString()).isEqualTo("ready");
        assertThat(report.get("transcripts").get("skippedFiles").asInt()).isEqualTo(1);
        JsonNode expected = expected();
        assertThat(report.get("totals").get("total").asLong()).isEqualTo(expected.get("totals").get("total").asLong());
        assertThat(report.get("estimate").get("usd").decimalValue())
                .isEqualByComparingTo(new BigDecimal(expected.get("totals").get("usd").asString()));
        assertThat(report.get("estimate").get("excludedModelCount").asInt()).isEqualTo(1);
        JsonNode future = null;
        for (JsonNode row : report.get("byModel")) {
            if (row.get("model").asString().equals("claude-future-9")) {
                future = row;
            }
        }
        assertThat(future).isNotNull();
        assertThat(future.get("usd").isNull()).isTrue();
        assertThat(report.get("bySession")).hasSize(2);
        for (JsonNode agent : report.get("byAgent")) {
            assertThat(List.of("agent", "main", "unknown")).contains(agent.get("kind").asString());
        }
    }

    @Test
    @DisplayName("[FR-025-AC4] period·tz 검증 실패는 400 VALIDATION(fields.period, fields.tz)")
    void invalidPeriodAndTimezone() throws Exception {
        MockHttpServletResponse response = call("/api/cost?period=1y&tz=Nowhere/Land");

        assertThat(response.getStatus()).isEqualTo(400);
        JsonNode error = objectMapper.readTree(response.getContentAsString(StandardCharsets.UTF_8));
        assertThat(error.get("code").asString()).isEqualTo("VALIDATION");
        assertThat(error.get("fields").has("period")).isTrue();
        assertThat(error.get("fields").has("tz")).isTrue();
    }

    @Test
    @DisplayName("[FR-026-AC3][FR-026-AC4] GET /api/pricing: 단가표 그대로(18개 모델, 확인 날짜)")
    void pricingReturnsTable() throws Exception {
        MockHttpServletResponse response = call("/api/pricing");

        assertThat(response.getStatus()).isEqualTo(200);
        JsonNode table = objectMapper.readTree(response.getContentAsString(StandardCharsets.UTF_8));
        assertThat(table.get("source").asString()).isEqualTo("Anthropic 가격표");
        assertThat(table.get("checkedAt").asString()).isEqualTo("2026-10-15");
        assertThat(table.get("unit").asString()).isEqualTo("USD / 1M tokens");
        assertThat(table.get("models")).hasSize(18);
        JsonNode first = table.get("models").get(0);
        for (String key : List.of("model", "input", "output", "cacheWrite", "cacheRead")) {
            assertThat(first.has(key)).as(key).isTrue();
        }
    }

    private String browserToken() throws Exception {
        return objectMapper
                .readTree(call("/api/auth/browser-token").getContentAsString(StandardCharsets.UTF_8))
                .get("token")
                .asString();
    }

    @Test
    @DisplayName("[FR-026-AC4] 단가표를 바꾸는 메서드가 없다: POST·PUT·PATCH·DELETE는 405")
    void pricingHasNoWriteMethods() throws Exception {
        String token = browserToken();
        for (MockHttpServletRequestBuilder request : List.of(
                post("/api/pricing"), put("/api/pricing"), patch("/api/pricing"), delete("/api/pricing"))) {
            MockHttpServletResponse response = mockMvc.perform(request
                            .header("Origin", ORIGIN)
                            .header("X-AojiStudio-Browser-Token", token)
                            .contentType("application/json")
                            .content("{\"model\":\"x\"}"))
                    .andReturn()
                    .getResponse();

            assertThat(response.getStatus()).as(request.toString()).isEqualTo(405);
        }
        assertThat(call("/api/pricing").getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("[FR-026-AC4] /api/cost도 읽기 전용: POST는 405")
    void costHasNoWriteMethods() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(post("/api/cost")
                        .header("Origin", ORIGIN)
                        .header("X-AojiStudio-Browser-Token", browserToken()))
                .andReturn()
                .getResponse();

        assertThat(response.getStatus()).isEqualTo(405);
    }
}
