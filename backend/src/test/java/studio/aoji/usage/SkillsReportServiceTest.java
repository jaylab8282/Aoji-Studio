package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
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

/**
 * 08 스킬 사용 집계. T-R4-01 {@code project-usage}를 임시 폴더로 복사하고 {@code usage.jsonl}을 재생한 뒤
 * {@code expected.json}의 {@code skills}와 비교한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SkillsReportServiceTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    SkillsReportService service;

    @Autowired
    Clock clock;

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

    private static boolean replayed;

    @BeforeEach
    void replayOnce() throws Exception {
        if (!replayed) {
            UsageScenario.replay(mockMvc, mountRoot);
            replayed = true;
        }
    }

    private JsonNode expected() throws IOException {
        return objectMapper.readTree(
                Files.readString(FixtureFiles.fixtureDir("project-usage").resolve("expected.json")));
    }

    private SkillsReport all() {
        return service.report(PeriodQuery.parse("all", "Asia/Seoul", clock));
    }

    private static SkillsReport.SkillRow row(SkillsReport report, String name) {
        return report.skills().stream().filter(r -> r.name().equals(name)).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("[FR-018-AC2] 행은 정의상 name 오름차순이고 definedAgents = skills:에 둔 에이전트(name 오름차순)")
    void rowsAreSortedAndDefinedAgentsMatch() throws IOException {
        SkillsReport report = all();

        List<String> expectedNames = new ArrayList<>();
        for (JsonNode skill : expected().get("skills").get("rows")) {
            expectedNames.add(skill.get("name").asText());
            List<String> defined = new ArrayList<>();
            skill.get("definedAgents").forEach(n -> defined.add(n.asText()));
            assertThat(row(report, skill.get("name").asText()).definedAgents()).as(skill.get("name").asText()).isEqualTo(defined);
        }
        assertThat(report.skills()).extracting(SkillsReport.SkillRow::name).isEqualTo(expectedNames);
        assertThat(row(report, "design-review").definedAgents()).containsExactly("proj-dev", "proj-lead");
    }

    @Test
    @DisplayName("[FR-018-AC3] 실제 사용 에이전트(기본 세션 포함)·횟수 내림차순·기본 세션 마지막·definedUnused")
    void actualAgentsAndDefinedUnused() throws IOException {
        SkillsReport report = all();

        for (JsonNode skill : expected().get("skills").get("rows")) {
            SkillsReport.SkillRow actual = row(report, skill.get("name").asText());
            List<SkillsReport.AgentCount> expectedAgents = new ArrayList<>();
            for (JsonNode a : skill.get("actualAgents")) {
                String agent = a.get("agent").asText();
                expectedAgents.add(new SkillsReport.AgentCount("기본 세션".equals(agent) ? null : agent, a.get("count").asLong()));
            }
            List<String> unused = new ArrayList<>();
            skill.get("definedUnused").forEach(n -> unused.add(n.asText()));
            assertThat(actual.actualAgents()).as("actual " + actual.name()).isEqualTo(expectedAgents);
            assertThat(actual.definedUnused()).as("unused " + actual.name()).isEqualTo(unused);
        }
        assertThat(row(report, "manual-only").definedUnused()).containsExactly("proj-ops");
    }

    @Test
    @DisplayName("[FR-018-AC6] usedAgentCount = 정의상 ∪ 실제 사용 에이전트 수, 기본 세션 제외")
    void usedAgentCountIsUnionWithoutDefaultSession() throws IOException {
        SkillsReport report = all();

        for (JsonNode skill : expected().get("skills").get("rows")) {
            assertThat(row(report, skill.get("name").asText()).usedAgentCount())
                    .as(skill.get("name").asText())
                    .isEqualTo(skill.get("usedAgentCount").asInt());
        }
        assertThat(row(report, "bad-yaml").usedAgentCount()).isZero();
        assertThat(row(report, "manual-only").usedAgentCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("[FR-019-AC2] total = call+slash+preload, % = total / 합계 × 100, 분모 = 지금 있는 스킬의 합")
    void totalPercentAndDenominator() throws IOException {
        SkillsReport report = all();

        assertThat(report.totalUses()).isEqualTo(expected().get("skills").get("totalUses").asLong());
        long sum = 0;
        for (JsonNode skill : expected().get("skills").get("rows")) {
            SkillsReport.SkillRow actual = row(report, skill.get("name").asText());
            long total = skill.get("total").asLong();
            sum += actual.usage().total();
            assertThat(actual.usage().total()).isEqualTo(total);
            assertThat(actual.usage().call() + actual.usage().slash() + actual.usage().preload()).isEqualTo(total);
            assertThat(actual.percent()).isCloseTo(skill.get("percent").asDouble(), within(1e-9));
        }
        assertThat(sum).isEqualTo(report.totalUses());
        assertThat(report.hookConfigured()).isTrue();
    }

    @Test
    @DisplayName("[FR-019-AC3] 방법별 횟수: 호출·직접 호출·미리 넣음")
    void countsPerMethod() throws IOException {
        SkillsReport report = all();

        for (JsonNode skill : expected().get("skills").get("rows")) {
            SkillsReport.SkillRow actual = row(report, skill.get("name").asText());
            assertThat(actual.usage().call()).as("call " + actual.name()).isEqualTo(skill.get("call").asLong());
            assertThat(actual.usage().slash()).as("slash " + actual.name()).isEqualTo(skill.get("slash").asLong());
            assertThat(actual.usage().preload()).as("preload " + actual.name()).isEqualTo(skill.get("preload").asLong());
        }
        SkillsReport.SkillRow designReview = row(report, "design-review");
        assertThat(designReview.usage()).isEqualTo(new SkillsReport.Usage(4, 1, 5, 10));
    }

    @Test
    @DisplayName("[FR-019-AC6] 지금 없는 스킬 이름(ghost-skill) 집계는 행·분모에서 제외")
    void deletedSkillNamesAreExcludedFromRowsAndDenominator() throws IOException {
        SkillsReport report = all();

        for (JsonNode ignored : expected().get("skills").get("ignoredNames")) {
            assertThat(report.skills()).extracting(SkillsReport.SkillRow::name).doesNotContain(ignored.asText());
        }
        // ghost-skill은 call 2건이 DB에 있지만 분모 19에 들어가지 않는다.
        assertThat(report.totalUses()).isEqualTo(19);
    }

    @Test
    @DisplayName("[FR-019-AC7] 모든 스킬 사용이 0이면 percent: null (기록 없음)")
    void allZeroUsageYieldsNullPercent() {
        Clock farFuture = Clock.fixed(Instant.parse("2031-01-01T00:00:00Z"), ZoneId.of("Asia/Seoul"));

        SkillsReport report = service.report(PeriodQuery.parse("7d", "Asia/Seoul", farFuture));

        assertThat(report.totalUses()).isZero();
        assertThat(report.skills()).hasSize(8);
        assertThat(report.skills()).allSatisfy(r -> {
            assertThat(r.percent()).isNull();
            assertThat(r.usage().total()).isZero();
            assertThat(r.actualAgents()).isEmpty();
        });
        assertThat(row(report, "manual-only").definedUnused()).containsExactly("proj-ops");
    }

    @Test
    @DisplayName("[FR-018-AC1] 형식 오류 스킬도 행에 포함되고 description은 빈 문자열, 사유가 formatError")
    void formatErrorRowsAreIncluded() {
        SkillsReport report = all();

        assertThat(row(report, "bad-utf8").formatError()).isEqualTo("UTF-8 인코딩 오류");
        assertThat(row(report, "bad-utf8").description()).isEmpty();
        assertThat(row(report, "imported-lint").imported()).isTrue();
        assertThat(row(report, "manual-only").userOnly()).isTrue();
        assertThat(report.skills()).hasSize(8);
    }
}
