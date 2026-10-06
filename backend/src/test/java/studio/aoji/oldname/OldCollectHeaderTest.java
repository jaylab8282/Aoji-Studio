package studio.aoji.oldname;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * NFR-13 ① 옛 수집 헤더 거부 (ADR-62). 이 폴더(oldname/)만 옛 이름 글자를 쓸 수 있다.
 * 옛 헤더는 어떤 값이어도 인증에 쓰이지 않는다 - 새 헤더만 판정한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class OldCollectHeaderTest {

    private static final String OLD = "X-JayStudio-Collect-Token";
    private static final String NEW = "X-AojiStudio-Collect-Token";
    private static final String BODY =
            "{\"session_id\":\"s1\",\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\","
                    + "\"tool_input\":{\"command\":\"echo hi\"}}";

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
        registry.add("aojistudio.host-path", () -> "/Users/someone/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @BeforeEach
    void clean() {
        new JdbcTemplate(dataSource).update("DELETE FROM events");
    }

    private String token() throws Exception {
        return Files.readString(mountRoot.resolve(".aojistudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
    }

    private long countEvents() {
        return new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM events", Long.class);
    }

    private int send(String... headerNameValue) throws Exception {
        var req = post("/hooks/events").contentType(MediaType.APPLICATION_JSON).content(BODY);
        for (int i = 0; i < headerNameValue.length; i += 2) {
            req = req.header(headerNameValue[i], headerNameValue[i + 1]);
        }
        return mockMvc.perform(req).andReturn().getResponse().getStatus();
    }

    @Test
    @DisplayName("[NFR-13-1][FR-003-AC2] 옛 헤더만 + 맞는 토큰 값 → 401, events 0행, 로그에 토큰 값 0건")
    void oldHeaderOnlyIsRejected(CapturedOutput output) throws Exception {
        String token = token();

        assertThat(send(OLD, token)).isEqualTo(401);

        assertThat(countEvents()).isZero();
        assertThat(output.getAll()).doesNotContain(token);
    }

    @Test
    @DisplayName("[NFR-13-1][FR-003-AC2] 옛 헤더 + 새 헤더(맞음) → 204, 저장 1건(옛 헤더는 무시)")
    void oldHeaderWithMatchingNewHeaderIsAccepted(CapturedOutput output) throws Exception {
        String token = token();

        assertThat(send(NEW, token, OLD, "1".repeat(64))).isEqualTo(204);

        assertThat(countEvents()).isEqualTo(1);
        assertThat(output.getAll()).doesNotContain(token).doesNotContain("1".repeat(64));
    }

    @Test
    @DisplayName("[NFR-13-1][FR-003-AC2] 옛 헤더(맞는 값) + 새 헤더(틀림) → 401, 저장 0건")
    void oldHeaderCannotRescueWrongNewHeader() throws Exception {
        assertThat(send(NEW, "0".repeat(64), OLD, token())).isEqualTo(401);

        assertThat(countEvents()).isZero();
    }
}
