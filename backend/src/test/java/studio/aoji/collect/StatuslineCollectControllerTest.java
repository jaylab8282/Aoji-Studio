package studio.aoji.collect;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import studio.aoji.support.FixtureFiles;
import studio.aoji.usage.UsageChangedNotifier;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * {@code POST /hooks/statusline} (FR-027-AC1·AC8·E2·E3, ADR-83)와 {@code GET /api/limits}·{@code Settings.statusline}.
 * 본문은 {@code tools/fixtures/statusline/*.json}에서 스크립트가 보내는 세 키만 뽑은 모양을 쓴다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class StatuslineCollectControllerTest {

    private static final String TOKEN_HEADER = "X-AojiStudio-Collect-Token";
    private static final String ORIGIN = "http://127.0.0.1:4180";
    private static final String HOST_PATH = "/Users/jaybee/Desktop/AojiStudio";
    private static final String MARKER = "AOJI-MARKER-STATUS-3b1e";
    private static final String FULL_BODY = "{\"subscription_type\":\"max\",\"rate_limits\":{"
            + "\"five_hour\":{\"used_percentage\":37.5,\"resets_at\":4070908800},"
            + "\"seven_day\":{\"used_percentage\":12.25,\"resets_at\":4071513600}}}";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @TempDir
    static Path claudeHome;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    JdbcClient jdbcClient;

    @MockitoBean
    UsageChangedNotifier notifier;

    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("aojistudio.host-path", () -> HOST_PATH);
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("aojistudio.claude-home-host", () -> "/home/fixture");
        registry.add("aojistudio.claude-home-mount", () -> claudeHome.toString());
    }

    @BeforeEach
    void setUp() {
        jdbcClient.sql("DELETE FROM statusline_last").update();
        reset(notifier);
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        logs.start();
        root.addAppender(logs);
        root.setLevel(Level.DEBUG);
    }

    @AfterEach
    void tearDown() {
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        root.detachAppender(logs);
        root.setLevel(Level.INFO);
    }

    private String token() throws Exception {
        return Files.readString(mountRoot.resolve(".aojistudio/collect-token"), StandardCharsets.UTF_8).strip();
    }

    private long rows() {
        return jdbcClient.sql("SELECT COUNT(*) FROM statusline_last").query(Long.class).single();
    }

    private String statuslineLogs() {
        return logs.list.stream()
                .filter(event -> event.getLoggerName().startsWith("studio.aoji"))
                .map(ILoggingEvent::getFormattedMessage)
                .reduce("", (a, b) -> a + b + "\n");
    }

    private void postOk(String body) throws Exception {
        mockMvc.perform(post("/hooks/statusline")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(TOKEN_HEADER, token())
                        .content(body))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
    }

    private JsonNode limits() throws Exception {
        String json = mockMvc.perform(get("/api/limits").header("Origin", ORIGIN))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(json);
    }

    @Test
    @DisplayName("[FR-027-AC1] 토큰 없음 → 401, 저장 0, statusline 로그 0, 알림 0")
    void missingTokenIs401() throws Exception {
        mockMvc.perform(post("/hooks/statusline").contentType(MediaType.APPLICATION_JSON).content(FULL_BODY))
                .andExpect(status().isUnauthorized())
                .andExpect(content().string(""));

        assertThat(rows()).isZero();
        assertThat(statuslineLogs()).as("앱 로그(studio.aoji) 0줄").isEmpty();
        verify(notifier, never()).markChanged(anyCollection());
    }

    @Test
    @DisplayName("[FR-027-AC1] 토큰 다름·옛 헤더 이름 → 401, 저장 0, statusline 로그 0")
    void wrongTokenIs401() throws Exception {
        mockMvc.perform(post("/hooks/statusline")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(TOKEN_HEADER, "0".repeat(64))
                        .content(FULL_BODY))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/hooks/statusline")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Wrong-Name-Token", token())
                        .content(FULL_BODY))
                .andExpect(status().isUnauthorized());

        assertThat(rows()).isZero();
        assertThat(statuslineLogs()).as("앱 로그(studio.aoji) 0줄").isEmpty();
    }

    @Test
    @DisplayName("[FR-027-AC1] Content-Type이 application/json이 아니면 415, 저장 0")
    void wrongContentTypeIs415() throws Exception {
        mockMvc.perform(post("/hooks/statusline")
                        .contentType(MediaType.TEXT_PLAIN)
                        .header(TOKEN_HEADER, token())
                        .content(FULL_BODY))
                .andExpect(status().isUnsupportedMediaType());

        assertThat(rows()).isZero();
    }

    @Test
    @DisplayName("[FR-027-AC1][FR-027-AC8] 유효 → 204, 한 행 저장, usage-changed limits·settings 알림, GET /api/limits에 반영")
    void validBodyIsStoredAndNotified() throws Exception {
        Instant before = Instant.now();

        postOk(FULL_BODY);

        assertThat(rows()).isEqualTo(1);
        verify(notifier).markChanged(List.of("limits", "settings"));
        JsonNode limits = limits();
        assertThat(limits.get("plan").get("value").asString()).isEqualTo("max");
        JsonNode five = limits.get("fiveHour");
        assertThat(five.get("state").asString()).isEqualTo("ok");
        assertThat(five.get("source").asString()).isEqualTo("statusline");
        assertThat(five.get("usedPercent").asDouble()).isEqualTo(37.5);
        assertThat(java.time.OffsetDateTime.parse(five.get("resetsAt").asString()).toInstant())
                .isEqualTo(Instant.ofEpochSecond(4070908800L));
        Instant receivedAt = java.time.OffsetDateTime.parse(five.get("receivedAt").asString()).toInstant();
        assertThat(receivedAt).isBetween(before.minusSeconds(1), Instant.now().plusSeconds(1));
        assertThat(limits.get("statuslineLastReceivedAt").asString()).isEqualTo(five.get("receivedAt").asString());
        assertThat(limits.get("sevenDay").get("usedPercent").asDouble()).isEqualTo(12.25);
    }

    @Test
    @DisplayName("[FR-027-AC8] 새 값을 받으면 같은 한 행을 덮어쓴다")
    void secondValueOverwritesSingleRow() throws Exception {
        postOk(FULL_BODY);
        postOk("{\"subscription_type\":\"pro\",\"rate_limits\":{\"five_hour\":{\"used_percentage\":50,\"resets_at\":4070908800}}}");

        assertThat(rows()).isEqualTo(1);
        JsonNode limits = limits();
        assertThat(limits.get("plan").get("value").asString()).isEqualTo("pro");
        assertThat(limits.get("fiveHour").get("usedPercent").asDouble()).isEqualTo(50.0);
        assertThat(limits.get("sevenDay").get("state").asString()).isEqualTo("missing");
    }

    @Test
    @DisplayName("[FR-027-E2] 한도 키가 없는 본문 → 204, 그 항목만 missing(플랜은 유지)")
    void bodyWithoutLimitsMarksOnlyThoseMissing() throws Exception {
        postOk("{\"subscription_type\":\"pro\"}");

        JsonNode limits = limits();
        assertThat(limits.get("plan").get("value").asString()).isEqualTo("pro");
        assertThat(limits.get("fiveHour").get("state").asString()).isEqualTo("missing");
        assertThat(limits.get("sevenDay").get("state").asString()).isEqualTo("missing");
        assertThat(limits.get("fiveHour").get("usedPercent").isNull()).isTrue();
    }

    @Test
    @DisplayName("[FR-027-E3] 타입 오류 → 204, 저장 0, 알림 0, 로그는 사유 코드만(값·표지 0회)")
    void invalidBodyIsAcceptedButNotStored() throws Exception {
        String bad = Files.readString(FixtureFiles.fixtureDir("statusline").resolve("bad-type.json"));
        assertThat(bad).contains(MARKER);

        postOk(bad);
        postOk("{\"subscription_type\":\"max\",\"rate_limits\":{\"five_hour\":{\"used_percentage\":\"" + MARKER + "\"}}}");
        postOk("not json " + MARKER);

        assertThat(rows()).isZero();
        verify(notifier, never()).markChanged(anyCollection());
        String logged = statuslineLogs();
        assertThat(logged).contains("statusline rejected: reason=SUBSCRIPTION_TYPE_TYPE")
                .contains("statusline rejected: reason=FIVE_HOUR_USED_PERCENTAGE_TYPE")
                .contains("statusline rejected: reason=PARSE_ERROR")
                .doesNotContain(MARKER)
                .doesNotContain("not-a-number");
    }

    @Test
    @DisplayName("[FR-027-E3] 본문이 64KB를 넘으면 읽지 않고 204, 저장 0, 사유 TOO_LARGE")
    void oversizedBodyIsRejected() throws Exception {
        postOk("{\"subscription_type\":\"" + "a".repeat(70_000) + "\"}");

        assertThat(rows()).isZero();
        assertThat(statuslineLogs()).contains("statusline rejected: reason=TOO_LARGE");
    }

    @Test
    @DisplayName("[FR-014-AC6] Settings.statusline — 예시는 토큰 없이 {}로 감싸 파싱되고, 마지막 수신 시각은 받은 뒤에 생긴다")
    void settingsStatusline() throws Exception {
        JsonNode before = settings();
        assertThat(before.get("lastReceivedAt").isNull()).isTrue();

        postOk(FULL_BODY);

        JsonNode after = settings();
        assertThat(after.get("lastReceivedAt").isNull()).isFalse();
        String example = after.get("settingsExample").asString();
        assertThat(example).doesNotContain(token());
        JsonNode parsed = objectMapper.readTree("{" + example + "}").get("statusLine");
        assertThat(parsed.get("type").asString()).isEqualTo("command");
        assertThat(parsed.get("command").asString())
                .isEqualTo("node \"" + HOST_PATH + "/.aojistudio/statusline.mjs\" --url http://127.0.0.1:4180/hooks/statusline -- <쓰던 상태줄 명령>");
    }

    private JsonNode settings() throws Exception {
        String json = mockMvc.perform(get("/api/settings").header("Origin", ORIGIN))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(json).get("statusline");
    }
}
