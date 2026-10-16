package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import studio.aoji.support.FixtureFiles;
import studio.aoji.usage.HookUsageEntry;
import studio.aoji.usage.UsageBucket;
import studio.aoji.usage.UsageRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** {@code GET /api/skills}·{@code GET /api/skills/{skill}} (T-R4-08, FR-018·FR-019). */
@SpringBootTest
@AutoConfigureMockMvc
class SkillControllerTest {

    private static final String ORIGIN = "http://127.0.0.1:4180";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    UsageRepository usageRepository;

    @Autowired
    Clock clock;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        FixtureFiles.copyInto("project-usage", mountRoot);
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
    }

    private MvcResult call(String url, int expectedStatus) throws Exception {
        return mockMvc.perform(get(url).header("Origin", ORIGIN))
                .andExpect(status().is(expectedStatus))
                .andReturn();
    }

    private JsonNode json(String url, int expectedStatus) throws Exception {
        return objectMapper.readTree(call(url, expectedStatus).getResponse().getContentAsString());
    }

    @Test
    @DisplayName("[FR-018-AC1] GET /api/skills → 200, 스키마 필드 전부·이름 오름차순·형식 오류 포함, 개수 = Registry.skillCount")
    void listReturnsSchemaShapedBody() throws Exception {
        JsonNode body = json("/api/skills?period=all&tz=Asia/Seoul", 200);
        JsonNode state = json("/api/state", 200);

        assertThat(body.get("period").asString()).isEqualTo("all");
        assertThat(body.has("range")).isTrue();
        assertThat(body.get("hookConfigured").isBoolean()).isTrue();
        assertThat(body.get("totalUses").isNumber()).isTrue();
        JsonNode skills = body.get("skills");
        assertThat(skills).hasSize(8);
        assertThat(skills.get(0).get("name").asString()).isEqualTo("bad-utf8");
        JsonNode row = skills.get(2);
        assertThat(row.get("name").asString()).isEqualTo("design-review");
        for (String key : new String[] {"name", "description", "filePath", "userOnly", "imported", "formatError",
                "definedAgents", "usage", "percent", "actualAgents", "definedUnused", "usedAgentCount"}) {
            assertThat(row.has(key)).as(key).isTrue();
        }
        assertThat(row.get("formatError").isNull()).isTrue();
        assertThat(row.get("filePath").asString()).isEqualTo(".claude/skills/design-review/SKILL.md");
        assertThat(skills.get(0).get("formatError").asString()).isEqualTo("UTF-8 인코딩 오류");
        assertThat(state.get("registry").get("skillCount").asInt()).isEqualTo(skills.size());
        // percent는 분모가 0일 때만 null이다 (FR-019-AC7)
        assertThat(row.get("percent").isNull()).isEqualTo(body.get("totalUses").asLong() == 0);
    }

    @Test
    @DisplayName("[FR-019-AC2] period 기본 7d, 구간은 tz 기준 오늘 포함 N일 (range.from·to)")
    void defaultPeriodIsSevenDaysInTz() throws Exception {
        JsonNode body = json("/api/skills?tz=Asia/Seoul", 200);

        assertThat(body.get("period").asString()).isEqualTo("7d");
        java.time.LocalDate today = clock.instant().atZone(java.time.ZoneId.of("Asia/Seoul")).toLocalDate();
        assertThat(body.get("range").get("to").asString()).isEqualTo(today.toString());
        assertThat(body.get("range").get("from").asString()).isEqualTo(today.minusDays(6).toString());
    }

    @Test
    @DisplayName("[FR-019-AC3] period 7d·30d·all이 기간 경계대로 횟수를 거른다")
    void periodFiltersCounts() throws Exception {
        Instant eightDaysAgo = clock.instant().minus(Duration.ofDays(8));
        usageRepository.incrementHookAgg(
                UsageBucket.of(eightDaysAgo), new HookUsageEntry("skill-call", "release-notes", "proj-lead"), 3);

        assertThat(usage("7d", "release-notes")).isZero();
        assertThat(usage("30d", "release-notes")).isEqualTo(3);
        assertThat(usage("all", "release-notes")).isEqualTo(3);
        JsonNode all = json("/api/skills?period=all&tz=Asia/Seoul", 200);
        assertThat(all.get("range").get("from").asString())
                .isEqualTo(eightDaysAgo.atZone(java.time.ZoneId.of("Asia/Seoul")).toLocalDate().toString());
    }

    private long usage(String period, String skill) throws Exception {
        JsonNode body = json("/api/skills?period=" + period + "&tz=Asia/Seoul", 200);
        for (JsonNode row : body.get("skills")) {
            if (row.get("name").asString().equals(skill)) {
                return row.get("usage").get("call").asLong();
            }
        }
        throw new AssertionError(skill);
    }

    @Test
    @DisplayName("[FR-019-AC4] period·tz 검증: 400 VALIDATION fields.period / fields.tz")
    void invalidPeriodAndTzAreRejected() throws Exception {
        JsonNode badPeriod = json("/api/skills?period=1y&tz=Asia/Seoul", 400);
        JsonNode badTz = json("/api/skills?period=7d&tz=Mars/Base", 400);
        JsonNode missingTz = json("/api/skills?period=7d", 400);

        assertThat(badPeriod.get("code").asString()).isEqualTo("VALIDATION");
        assertThat(badPeriod.get("fields").get("period").asString()).isEqualTo("7d·30d·all 중 하나");
        assertThat(badTz.get("fields").get("tz").asString()).isEqualTo("알 수 없는 시간대");
        assertThat(missingTz.get("fields").get("tz").asString()).isEqualTo("알 수 없는 시간대");
    }

    @Test
    @DisplayName("[FR-018-AC1] GET /api/skills/{skill} → SkillDetail(본문 원문·revision·modifiedAt·imported)")
    void detailReturnsSkillDetail() throws Exception {
        JsonNode body = json("/api/skills/design-review", 200);
        JsonNode imported = json("/api/skills/imported-lint", 200);

        assertThat(body.get("name").asString()).isEqualTo("design-review");
        assertThat(body.get("filePath").asString()).isEqualTo(".claude/skills/design-review/SKILL.md");
        assertThat(body.get("userOnly").asBoolean()).isFalse();
        assertThat(body.get("imported").asBoolean()).isFalse();
        assertThat(body.get("body").asString()).isNotEmpty();
        assertThat(body.get("revision").asString()).matches("\\d+-\\d+");
        assertThat(java.time.OffsetDateTime.parse(body.get("modifiedAt").asString())).isNotNull();
        assertThat(imported.get("imported").asBoolean()).isTrue();
        assertThat(json("/api/skills/manual-only", 200).get("userOnly").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("[FR-018-E1] 형식 오류 스킬 상세 → 409 UNEDITABLE, 문구 에디터에서 SKILL.md를 고치세요")
    void formatErrorSkillIsUneditable() throws Exception {
        for (String name : new String[] {"bad-utf8", "bad-yaml", "name-mismatch", "no-delimiter"}) {
            JsonNode body = json("/api/skills/" + name, 409);
            assertThat(body.get("code").asString()).as(name).isEqualTo("UNEDITABLE");
            assertThat(body.get("message").asString()).isEqualTo("에디터에서 SKILL.md를 고치세요");
        }
    }

    @Test
    @DisplayName("[FR-018-E1] 없는 스킬·규칙에 안 맞는 이름 → 404 SKILL_NOT_FOUND, 문구 이미 없는 스킬입니다")
    void unknownSkillIsNotFound() throws Exception {
        for (String name : new String[] {"nope", "Bad_Name", "a".repeat(65)}) {
            MvcResult result = mockMvc.perform(get("/api/skills/" + name).header("Origin", ORIGIN)).andReturn();
            assertThat(result.getResponse().getStatus()).as(name).isEqualTo(404);
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            assertThat(body.get("code").asString()).isEqualTo("SKILL_NOT_FOUND");
            assertThat(body.get("message").asString()).isEqualTo("이미 없는 스킬입니다");
        }
    }
}
