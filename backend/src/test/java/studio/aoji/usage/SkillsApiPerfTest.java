package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import studio.aoji.support.FixtureFiles;

/**
 * 08 API 365일 집계 응답 시간 (NFR-02). 기본 {@code test}에서 빼고 Integration(T-R4-22)에서 1회만 돌리는
 * 성능 측정이다(conventions.md §8). 반복 루프 없이 요청 1번의 시간만 측정해 로그에 남긴다.
 */
@Tag("perf")
@SpringBootTest
@AutoConfigureMockMvc
class SkillsApiPerfTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcClient jdbcClient;

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

    @Test
    @DisplayName("[NFR-02] GET /api/skills 365일(15분 구간 35,040개 × 4칸) 집계 < 1s")
    void yearOfBucketsRespondsUnderOneSecond() throws Exception {
        Instant end = clock.instant().truncatedTo(ChronoUnit.DAYS);
        jdbcClient
                .sql(
                        """
                        WITH RECURSIVE b(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM b WHERE i < 35039)
                        INSERT INTO usage_hook_agg (bucket, kind, subject, agent, count)
                        SELECT strftime('%Y-%m-%dT%H:%M:00Z', :end, '-' || (i * 15) || ' minutes'), k.kind, k.subject, k.agent, 1
                        FROM b, (SELECT 'skill-call' AS kind, 'design-review' AS subject, 'proj-dev' AS agent
                                 UNION ALL SELECT 'skill-slash', 'release-notes', ''
                                 UNION ALL SELECT 'session-start', '', 'proj-dev'
                                 UNION ALL SELECT 'session-start', '', 'proj-lead') k
                        """)
                .param("end", end.toString().replace("Z", ""))
                .update();

        long start = System.nanoTime();
        mockMvc.perform(get("/api/skills?period=all&tz=Asia/Seoul").header("Origin", "http://127.0.0.1:4180"))
                .andExpect(status().isOk());
        long millis = (System.nanoTime() - start) / 1_000_000;

        System.out.println("[NFR-02] GET /api/skills 365일 집계 " + millis + "ms");
        assertThat(millis).isLessThan(1000);
    }
}
