package studio.aoji.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * hook 수집 인증 (api-spec {@code POST /hooks/events}, FR-003-AC2).
 * T-002 범위: 검증 통과 여부만 확인한다. 저장(INSERT)은 T-005에서 구현하므로 이 태스크에서는
 * 성공 케이스를 포함해 항상 0건 저장됨을 함께 확인한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class HookCollectAuthTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    DataSource dataSource;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    private String validToken() throws Exception {
        return Files.readString(mountRoot.resolve(".aojistudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
    }

    private long countEvents() {
        return new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM events", Long.class);
    }

    @Test
    void missingTokenIsRejected() throws Exception {
        // [FR-003-AC2] 토큰 없음 → 401 저장 0건
        mockMvc.perform(post("/hooks/events").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().string(""));
        assertThat(countEvents()).isZero();
    }

    @Test
    void wrongTokenIsRejected() throws Exception {
        // [FR-003-AC2] 토큰 불일치 → 401
        mockMvc.perform(post("/hooks/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-JayStudio-Collect-Token", "0".repeat(64))
                        .content("{}"))
                .andExpect(status().isUnauthorized());
        assertThat(countEvents()).isZero();
    }

    @Test
    void wrongContentTypeIsRejected() throws Exception {
        // [FR-003-AC2] Content-Type text/plain → 415 저장 0건
        mockMvc.perform(post("/hooks/events")
                        .contentType(MediaType.TEXT_PLAIN)
                        .header("X-JayStudio-Collect-Token", validToken())
                        .content("{}"))
                .andExpect(status().isUnsupportedMediaType());
        assertThat(countEvents()).isZero();
    }

    @Test
    void validRequestReturnsNoContent() throws Exception {
        // [FR-003-AC2] 유효 → 204
        mockMvc.perform(post("/hooks/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-JayStudio-Collect-Token", validToken())
                        .content("{}"))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
        // T-002 범위: 검증 통과해도 저장 로직은 아직 없다(T-005에서 구현).
        assertThat(countEvents()).isZero();
    }
}
