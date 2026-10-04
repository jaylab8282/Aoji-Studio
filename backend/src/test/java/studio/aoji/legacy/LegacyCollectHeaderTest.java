package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 옛 수집 헤더 수용 (ADR-54, api-spec {@code /hooks/events} 판정표). 경고는 인증 성공 시에만, 값은 마스킹(NFR-08).
 * 경고 빈도 상태가 메서드 사이에 새지 않도록 메서드마다 컨텍스트를 새로 만든다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class LegacyCollectHeaderTest {

    private static final String NEW = "X-AojiStudio-Collect-Token";
    private static final String OLD = LegacyNames.LEGACY_COLLECT_TOKEN_HEADER;
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

    private ch.qos.logback.classic.Logger warningsLogger;
    private ListAppender<ILoggingEvent> appender;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("aojistudio.host-path", () -> "/Users/someone/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @BeforeEach
    void attach() {
        new JdbcTemplate(dataSource).update("DELETE FROM events");
        warningsLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(LegacyWarnings.class);
        appender = new ListAppender<>();
        appender.start();
        warningsLogger.addAppender(appender);
    }

    @AfterEach
    void detach() {
        warningsLogger.detachAppender(appender);
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

    private List<String> warnings() {
        return appender.list.stream().map(ILoggingEvent::getFormattedMessage)
                .filter(m -> m.startsWith("[legacy] collect-header")).toList();
    }

    private void assertNoTokenInLogs(String... tokens) {
        for (ILoggingEvent e : appender.list) {
            for (String t : tokens) {
                assertThat(e.getFormattedMessage()).doesNotContain(t);
            }
        }
    }

    @Test
    void legacyOnlyMatchingIsAcceptedWithMaskedWarning() throws Exception {
        // [FR-003-AC2][NFR-08][ADR-54] ① 옛 헤더만·일치 → 204·저장 1건·경고 1줄(••••••••, 토큰 값 0건)
        String token = token();
        assertThat(send(OLD, token)).isEqualTo(204);
        assertThat(countEvents()).isEqualTo(1);
        assertThat(warnings()).hasSize(1);
        assertThat(warnings().get(0)).contains("••••••••").contains(OLD);
        assertNoTokenInLogs(token);
    }

    @Test
    void legacyOnlyMismatchIsRejectedWithoutWarning() throws Exception {
        // [FR-003-AC2][NFR-08][ADR-54] ② 옛 헤더만·불일치 → 401·저장 0·경고 0
        assertThat(send(OLD, "0".repeat(64))).isEqualTo(401);
        assertThat(countEvents()).isZero();
        assertThat(warnings()).isEmpty();
    }

    @Test
    void bothNewMatchesLegacyMismatchIsAcceptedWithIgnoredWarning() throws Exception {
        // [FR-003-AC2][NFR-08][ADR-54] ③ 둘 다·새 일치/옛 불일치 → 204·"옛 헤더 무시" 경고
        String token = token();
        assertThat(send(NEW, token, OLD, "1".repeat(64))).isEqualTo(204);
        assertThat(countEvents()).isEqualTo(1);
        assertThat(warnings()).hasSize(1);
        assertThat(warnings().get(0)).contains("무시").contains("••••••••");
        assertNoTokenInLogs(token, "1".repeat(64));
    }

    @Test
    void bothNewMismatchLegacyMatchesIsRejected() throws Exception {
        // [FR-003-AC2][NFR-08][ADR-54] ④ 둘 다·새 불일치/옛 일치 → 401·저장 0
        assertThat(send(NEW, "0".repeat(64), OLD, token())).isEqualTo(401);
        assertThat(countEvents()).isZero();
        assertThat(warnings()).isEmpty();
    }

    @Test
    void noHeaderIsRejected() throws Exception {
        // [FR-003-AC2][ADR-54] ⑤ 둘 다 없음 → 401
        assertThat(send()).isEqualTo(401);
        assertThat(countEvents()).isZero();
        assertThat(warnings()).isEmpty();
    }

    @Test
    void threeLegacyRequestsWithinAnHourWarnOnce() throws Exception {
        // [FR-003-AC2][NFR-08][ADR-54] ⑥ 1시간 안 3회 → 경고 1줄
        String token = token();
        for (int i = 0; i < 3; i++) {
            assertThat(send(OLD, token)).isEqualTo(204);
        }
        assertThat(countEvents()).isEqualTo(3);
        assertThat(warnings()).hasSize(1);
    }
}
