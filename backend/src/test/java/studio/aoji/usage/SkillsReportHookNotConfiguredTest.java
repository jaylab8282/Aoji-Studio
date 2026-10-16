package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
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

/** hook 미설정 프로젝트의 08 집계: {@code call}·{@code slash}는 0 (FR-019-E1). */
@SpringBootTest
@AutoConfigureMockMvc
class SkillsReportHookNotConfiguredTest {

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

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        FixtureFiles.copyInto("project-usage", mountRoot);
        Files.delete(mountRoot.resolve(".claude").resolve("settings.json"));
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

    @Test
    @DisplayName("[FR-019-E1] hook 미설정 → hookConfigured false, 모든 스킬 call·slash 0 (preload는 정의 기준 그대로)")
    void callAndSlashAreZeroWhenHookNotConfigured() throws Exception {
        SkillsReport report = service.report(PeriodQuery.parse("all", "Asia/Seoul", clock));

        assertThat(report.hookConfigured()).isFalse();
        assertThat(report.skills()).allSatisfy(row -> {
            assertThat(row.usage().call()).isZero();
            assertThat(row.usage().slash()).isZero();
            assertThat(row.usage().total()).isEqualTo(row.usage().preload());
        });
        assertThat(report.skills()).extracting(r -> r.usage().preload()).contains(5L);
    }
}
