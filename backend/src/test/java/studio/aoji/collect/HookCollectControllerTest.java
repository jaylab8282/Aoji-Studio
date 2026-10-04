package studio.aoji.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * hook 수집: 사용 이벤트 저장, 미사용 이벤트·형식 오류 거부 (api-spec {@code POST /hooks/events},
 * FR-003-AC9, FR-003-E1, FR-003-E2).
 */
@SpringBootTest
@AutoConfigureMockMvc
class HookCollectControllerTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    DataSource dataSource;

    private ch.qos.logback.classic.Logger controllerLogger;
    private ListAppender<ILoggingEvent> logAppender;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @BeforeEach
    void attachLogAppender() {
        controllerLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(HookCollectController.class);
        logAppender = new ListAppender<>();
        logAppender.start();
        controllerLogger.addAppender(logAppender);
    }

    @AfterEach
    void detachLogAppender() {
        controllerLogger.detachAppender(logAppender);
    }

    private String validToken() throws Exception {
        return Files.readString(mountRoot.resolve(".aojistudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
    }

    private long countEvents() {
        return new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM events", Long.class);
    }

    private void postHook(String body) throws Exception {
        mockMvc.perform(post("/hooks/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-AojiStudio-Collect-Token", validToken())
                        .content(body))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
    }

    @Test
    void allTwelveUsedEventKindsAreStored() throws Exception {
        // [FR-003-AC9] 12개 이벤트 각각 저장됨
        long before = countEvents();
        List<String> bodies = List.of(
                """
                {"session_id":"s1","hook_event_name":"SessionStart","cwd":"/workspace"}""",
                """
                {"session_id":"s1","hook_event_name":"SessionEnd","reason":"clear"}""",
                """
                {"session_id":"s1","hook_event_name":"UserPromptSubmit"}""",
                """
                {"session_id":"s1","hook_event_name":"Stop"}""",
                """
                {"session_id":"s1","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls"}}""",
                """
                {"session_id":"s1","hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"ls"}}""",
                """
                {"session_id":"s1","hook_event_name":"PostToolUseFailure","tool_name":"Bash","tool_input":{"command":"ls"}}""",
                """
                {"session_id":"s1","hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":"ls"}}""",
                """
                {"session_id":"s1","hook_event_name":"PermissionDenied","tool_name":"Bash","tool_input":{"command":"ls"}}""",
                """
                {"session_id":"s1","hook_event_name":"Notification","notification_type":"idle"}""",
                """
                {"session_id":"s1","hook_event_name":"SubagentStart","agent_type":"Explore"}""",
                """
                {"session_id":"s1","hook_event_name":"SubagentStop","agent_type":"Explore"}""");

        for (String body : bodies) {
            postHook(body);
        }

        assertThat(countEvents() - before).isEqualTo(12);
    }

    @Test
    void unsupportedEventNameIsNotStored() throws Exception {
        // [FR-003-AC9] PreCompact 등 미사용 이벤트 → 204 저장 0건
        long before = countEvents();

        postHook("""
                {"session_id":"s1","hook_event_name":"PreCompact"}""");

        assertThat(countEvents()).isEqualTo(before);
    }

    @Test
    void malformedJsonIsRejectedWithoutLoggingBody() throws Exception {
        // [FR-003-E1] JSON 깨짐 → 204 저장 0건, 로그에 본문 없음
        long before = countEvents();
        String marker = "SUPER-SECRET-MARKER-12345";

        mockMvc.perform(post("/hooks/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-AojiStudio-Collect-Token", validToken())
                        .content("{not-json:" + marker))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        assertThat(countEvents()).isEqualTo(before);
        assertThat(logAppender.list)
                .extracting(ILoggingEvent::getFormattedMessage)
                .noneMatch(message -> message.contains(marker));
    }

    @Test
    void missingHookEventNameIsRejected() throws Exception {
        // [FR-003-E1] hook_event_name 누락 → 204 저장 0건
        long before = countEvents();

        postHook("""
                {"session_id":"s1"}""");

        assertThat(countEvents()).isEqualTo(before);
        assertThat(logAppender.list)
                .extracting(ILoggingEvent::getFormattedMessage)
                .anyMatch(message -> message.startsWith("hook rejected:") && message.contains("event=-"));
    }

    @Test
    void undefinedAgentTypeEventIsStillStored() throws Exception {
        // [FR-003-E2] 정의 없는 agent_type(Explore) 이벤트 저장됨
        long before = countEvents();
        String uniqueSessionId = "undefined-agent-session-" + System.nanoTime();

        postHook(
                """
                {"session_id":"%s","hook_event_name":"SubagentStart","agent_id":"sub-1","agent_type":"Explore"}"""
                        .formatted(uniqueSessionId));

        assertThat(countEvents()).isEqualTo(before + 1);
        String storedAgentType = new JdbcTemplate(dataSource)
                .queryForObject(
                        "SELECT agent_type FROM events WHERE session_id = ?", String.class, uniqueSessionId);
        assertThat(storedAgentType).isEqualTo("Explore");
    }

    @Test
    void agentOutsideAnyWorkflowEventIsStillStored() throws Exception {
        // [FR-003-E2] 워크플로우 밖 에이전트 이벤트 저장됨 (T-005는 registry를 확인하지 않고 그대로 저장)
        long before = countEvents();

        postHook("""
                {"session_id":"s1","hook_event_name":"PreToolUse","agent_type":"lonely-agent","tool_name":"Bash","tool_input":{"command":"ls"}}""");

        assertThat(countEvents()).isEqualTo(before + 1);
    }
}
