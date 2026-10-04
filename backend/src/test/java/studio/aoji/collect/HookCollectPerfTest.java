package studio.aoji.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import studio.aoji.legacy.LegacyNames;

/**
 * 수집 응답 시간 (api-spec {@code POST /hooks/events} 설명, FR-003-AC3).
 * 1000회 반복해 p95 &lt; 100ms, 응답 204 빈 본문을 확인한다(conventions.md §8 성능 테스트).
 */
@SpringBootTest
@AutoConfigureMockMvc
class HookCollectPerfTest {

    private static final Logger log = LoggerFactory.getLogger(HookCollectPerfTest.class);
    private static final int ITERATIONS = 1000;

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    private String validToken() throws Exception {
        return Files.readString(mountRoot.resolve(".aojistudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
    }

    @Test
    void thousandRequestsWithNewHeaderRespondUnder100msP95WithEmptyBody() throws Exception {
        // [FR-003-AC3] 새 헤더 1000회 POST p95 < 100ms, 응답 204 본문 길이 0
        measure("X-AojiStudio-Collect-Token", "new-header");
    }

    @Test
    void thousandRequestsWithLegacyHeaderRespondUnder100msP95WithEmptyBody() throws Exception {
        // [FR-003-AC3][ADR-54] 옛 헤더 1000회 POST p95 < 100ms, 응답 204 본문 길이 0
        measure(LegacyNames.LEGACY_COLLECT_TOKEN_HEADER, "legacy-header");
    }

    private void measure(String headerName, String label) throws Exception {
        String token = validToken();
        long[] durationsNanos = new long[ITERATIONS];

        for (int i = 0; i < ITERATIONS; i++) {
            String body =
                    """
                    {"session_id":"perf-%d","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo %d"}}"""
                            .formatted(i, i);

            long start = System.nanoTime();
            mockMvc.perform(post("/hooks/events")
                            .contentType(MediaType.APPLICATION_JSON)
                            .header(headerName, token)
                            .content(body))
                    .andExpect(status().isNoContent())
                    .andExpect(content().string(""));
            durationsNanos[i] = System.nanoTime() - start;
        }

        long[] sorted = durationsNanos.clone();
        Arrays.sort(sorted);
        long p95Nanos = sorted[(int) Math.ceil(ITERATIONS * 0.95) - 1];
        double p95Millis = p95Nanos / 1_000_000.0;

        log.info("HookCollectController p95 [{}] over {} requests: {} ms", label, ITERATIONS, p95Millis);
        assertThat(p95Millis).isLessThan(100.0);
    }
}
