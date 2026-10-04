package studio.aoji.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.ResultSetMetaData;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 저장 시점 마스킹 (FR-015-AC2·AC3). 원문은 DB·API 응답·서버 로그 어디에도 남지 않는다.
 * SSE {@code event} 마스킹 확인은 {@code SseHub}가 생기는 T-007 범위다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class HookCollectMaskingTest {

    private static final String SECRET = "abc";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    DataSource dataSource;

    private ch.qos.logback.classic.Logger rootLogger;
    private ListAppender<ILoggingEvent> logAppender;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @BeforeEach
    void attachLogAppender() {
        // 루트 로거에 붙여 애플리케이션 어디에서도 원문(SECRET)이 로그로 새지 않는지 확인한다(NFR-08).
        rootLogger = (ch.qos.logback.classic.Logger)
                LoggerFactory.getLogger(ch.qos.logback.classic.Logger.ROOT_LOGGER_NAME);
        logAppender = new ListAppender<>();
        logAppender.start();
        rootLogger.addAppender(logAppender);
    }

    @AfterEach
    void detachLogAppender() {
        rootLogger.detachAppender(logAppender);
    }

    private String validToken() throws Exception {
        return Files.readString(mountRoot.resolve(".aojistudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
    }

    @Test
    void tokenInCommandIsMaskedInDbAndApiResponseAndNeverLogged() throws Exception {
        // [FR-015-AC2] tool_input.command에 'export TOKEN=abc' → DB summary·GET /api/events 모두 마스킹,
        // 로그 파일에 'abc' 없음. (SSE event 마스킹은 T-007에서 확인)
        String uniqueSessionId = "masking-session-" + System.nanoTime();
        String body =
                """
                {"session_id":"%s","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"export TOKEN=%s"}}"""
                        .formatted(uniqueSessionId, SECRET);

        mockMvc.perform(post("/hooks/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-AojiStudio-Collect-Token", validToken())
                        .content(body))
                .andExpect(status().isNoContent());

        // DB summary 마스킹
        String storedSummary = new JdbcTemplate(dataSource)
                .queryForObject(
                        "SELECT summary FROM events WHERE session_id = ?", String.class, uniqueSessionId);
        assertThat(storedSummary).doesNotContain(SECRET).contains("••••••••");

        // GET /api/events 응답 마스킹
        String json = mockMvc.perform(get("/api/events").header("Sec-Fetch-Site", "same-origin"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        assertThat(json).doesNotContain(SECRET);
        assertThat(json).contains(uniqueSessionId);

        // 로그에 원문 없음
        assertThat(logAppender.list)
                .extracting(ILoggingEvent::getFormattedMessage)
                .noneMatch(message -> message != null && message.contains(SECRET));
    }

    @Test
    void toolInputColumnDoesNotExistInEventsTable() throws Exception {
        // [FR-015-AC3] events 테이블에 tool_input 컬럼 없음
        List<String> columnNames = new JdbcTemplate(dataSource).query("SELECT * FROM events LIMIT 1", rs -> {
            ResultSetMetaData metaData = rs.getMetaData();
            List<String> names = new java.util.ArrayList<>();
            for (int i = 1; i <= metaData.getColumnCount(); i++) {
                names.add(metaData.getColumnName(i).toLowerCase());
            }
            return names;
        });

        assertThat(columnNames).doesNotContain("tool_input");
    }

    @Test
    void onlySummaryIsStoredNotRawToolInputValue() throws Exception {
        // [FR-015-AC3] summary 외 tool_input 값 미저장 — file_path 같은 다른 tool_input 키 값이
        // summary 텍스트 밖 어디에도 남지 않는다(테이블에 tool_input류 컬럼이 없으므로 저장 위치 자체가 없음).
        String uniqueSessionId = "raw-tool-input-session-" + System.nanoTime();
        String body =
                """
                {"session_id":"%s","hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"/workspace/secret-plan.md","unused_extra":"should-not-be-stored"}}"""
                        .formatted(uniqueSessionId);

        mockMvc.perform(post("/hooks/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-AojiStudio-Collect-Token", validToken())
                        .content(body))
                .andExpect(status().isNoContent());

        String storedSummary = new JdbcTemplate(dataSource)
                .queryForObject(
                        "SELECT summary FROM events WHERE session_id = ?", String.class, uniqueSessionId);
        // summary 규칙(FR-003-AC10)대로 file_path 하나만 담기고, 다른 tool_input 키(unused_extra)는 어디에도 없다.
        assertThat(storedSummary).isEqualTo("/workspace/secret-plan.md");
    }
}
