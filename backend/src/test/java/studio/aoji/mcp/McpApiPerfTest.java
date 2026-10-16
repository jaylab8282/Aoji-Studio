package studio.aoji.mcp;

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
import studio.aoji.support.ClaudeHomeFixture;
import studio.aoji.support.FixtureFiles;

/**
 * 09 API 365일 집계 응답 시간 (NFR-02). 기본 {@code test}에서 빼고 Integration(T-R4-22)에서 1회만 돌리는
 * 성능 측정이다(conventions.md §8). 반복 루프 없이 요청 1번의 시간만 측정해 로그에 남긴다.
 */
@Tag("perf")
@SpringBootTest
@AutoConfigureMockMvc
class McpApiPerfTest {

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
    JdbcClient jdbcClient;

    @Autowired
    Clock clock;

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

    @Test
    @DisplayName("[NFR-02] GET /api/mcp 365일(15분 구간 35,040개 × 3칸) 집계 < 1s")
    void yearOfBucketsRespondsUnderOneSecond() throws Exception {
        Instant end = clock.instant().truncatedTo(ChronoUnit.DAYS);
        jdbcClient
                .sql(
                        """
                        WITH RECURSIVE b(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM b WHERE i < 35039)
                        INSERT INTO usage_hook_agg (bucket, kind, subject, agent, count)
                        SELECT strftime('%Y-%m-%dT%H:%M:00Z', :end, '-' || (i * 15) || ' minutes'), 'mcp-call', k.subject, k.agent, 1
                        FROM b, (SELECT 'github' AS subject, 'proj-dev' AS agent
                                 UNION ALL SELECT 'github', ''
                                 UNION ALL SELECT 'claude_ai_drive', 'proj-lead') k
                        """)
                .param("end", end.toString().replace("Z", ""))
                .update();

        long start = System.nanoTime();
        mockMvc.perform(get("/api/mcp?period=all&tz=Asia/Seoul").header("Origin", "http://127.0.0.1:4180"))
                .andExpect(status().isOk());
        long millis = (System.nanoTime() - start) / 1_000_000;

        System.out.println("[NFR-02] GET /api/mcp 365일 집계 " + millis + "ms");
        assertThat(millis).isLessThan(1000);
    }
}
