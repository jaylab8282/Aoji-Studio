package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;

class TranscriptLineParserTest {

    private static final String MARKER = "AOJI-MARKER-CONVO-7f3a";
    private final TranscriptLineParser parser = new TranscriptLineParser(JsonMapper.builder().build());

    private TranscriptLine parse(String line) {
        byte[] bytes = line.getBytes(StandardCharsets.UTF_8);
        return parser.parse(bytes, bytes.length);
    }

    @Test
    @DisplayName("[FR-025-AC5][NFR-14] 본문 표지가 파서 결과에 0회 — 필요한 키만 담는다")
    void resultCarriesOnlyNeededKeysAndNoConversationText() {
        String line = "{\"type\":\"assistant\",\"sessionId\":\"s1\",\"timestamp\":\"2026-10-10T01:00:05.000Z\","
                + "\"cwd\":\"/w\",\"entrypoint\":\"cli\",\"isSidechain\":true,\"requestId\":\"req_1\","
                + "\"message\":{\"id\":\"msg_1\",\"model\":\"claude-opus-4-8\",\"content\":[{\"type\":\"text\",\"text\":\""
                + MARKER + "\"}],\"usage\":{\"input_tokens\":1,\"output_tokens\":2,"
                + "\"cache_creation_input_tokens\":3,\"cache_read_input_tokens\":4,\"service_tier\":\"standard\"}},"
                + "\"toolUseResult\":{\"stdout\":\"" + MARKER + "\"},\"prompt\":\"" + MARKER + "\"}";

        TranscriptLine parsed = parse(line);

        assertThat(parsed.error()).isFalse();
        assertThat(parsed.sessionId()).isEqualTo("s1");
        assertThat(parsed.timestamp()).isEqualTo("2026-10-10T01:00:05.000Z");
        assertThat(parsed.cwd()).isEqualTo("/w");
        assertThat(parsed.entrypoint()).isEqualTo("cli");
        assertThat(parsed.sidechain()).isTrue();
        assertThat(parsed.usage())
                .isEqualTo(new TranscriptLine.Usage("msg_1", "req_1", "claude-opus-4-8", 1, 2, 3, 4));
        assertThat(parsed.usage().messageKey()).isEqualTo("msg_1:req_1");
        assertThat(parsed.toString()).doesNotContain(MARKER);
    }

    @Test
    @DisplayName("[FR-025-AC5] 사용자 줄·agent-setting 줄: 토큰 없음, agentSetting만 읽고 agentName은 무시")
    void userAndAgentSettingLines() {
        TranscriptLine user = parse("{\"type\":\"user\",\"sessionId\":\"s1\",\"message\":{\"role\":\"user\",\"content\":\""
                + MARKER + "\"}}");
        TranscriptLine setting = parse("{\"type\":\"agent-setting\",\"agentSetting\":\"proj-lead\",\"agentName\":\"x\","
                + "\"sessionId\":\"s1\"}");

        assertThat(user.usage()).isNull();
        assertThat(user.toString()).doesNotContain(MARKER);
        assertThat(setting.agentSetting()).isEqualTo("proj-lead");
        assertThat(setting.toString()).doesNotContain("\"x\"");
    }

    @Test
    @DisplayName("[FR-025-E2][NFR-14] 깨진 줄은 error이고 결과·예외 어디에도 줄 조각·표지가 없다")
    void brokenLineIsErrorAndLogsNothing() {
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        root.addAppender(logs);
        try {
            TranscriptLine broken = parse("{\"type\":\"assistant\",\"message\":{\"id\":\"msg_broken\",\"usage\":{\"input_tokens\":9999," + MARKER);
            TranscriptLine notObject = parse("[1,2,3]");
            TranscriptLine truncated = parse("{\"type\":\"assistant\"");

            assertThat(broken).isSameAs(TranscriptLine.ERROR);
            assertThat(notObject.error()).isTrue();
            assertThat(truncated.error()).isTrue();
            assertThat(broken.toString()).doesNotContain(MARKER);
            assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage).noneMatch(m -> m.contains(MARKER));
        } finally {
            root.detachAppender(logs);
        }
    }

    @Test
    @DisplayName("[FR-025-E2] 공백뿐인 줄은 오류가 아니라 빈 결과")
    void blankLineIsNotError() {
        TranscriptLine blank = parse("  \t\r");

        assertThat(blank.error()).isFalse();
        assertThat(blank.usage()).isNull();
        assertThat(blank.hasSession()).isFalse();
    }

    @Test
    @DisplayName("[FR-025-AC1] 키가 없는 줄(requestId 없음)은 messageKey null, synthetic·0 토큰은 ignorable")
    void keyAndIgnorable() {
        TranscriptLine noRequest = parse(HarnessLines.line("msg_x", null, "claude-opus-4-8", 1, 1));
        TranscriptLine synthetic = parse(HarnessLines.line("msg_y", "r", "<synthetic>", 1, 1));
        TranscriptLine zero = parse(HarnessLines.line("msg_z", "r", "claude-opus-4-8", 0, 0));

        assertThat(noRequest.usage().messageKey()).isNull();
        assertThat(synthetic.usage().ignorable()).isTrue();
        assertThat(zero.usage().ignorable()).isTrue();
    }

    @Test
    @DisplayName("[FR-025-AC5] 숫자가 아닌 토큰 값과 음수는 0으로 둔다")
    void nonNumericTokensBecomeZero() {
        TranscriptLine parsed = parse("{\"type\":\"assistant\",\"requestId\":\"r\",\"message\":{\"id\":\"m\",\"model\":\"claude-opus-4-8\","
                + "\"usage\":{\"input_tokens\":\"7\",\"output_tokens\":-5,\"cache_read_input_tokens\":9}}}");

        assertThat(parsed.usage().input()).isZero();
        assertThat(parsed.usage().output()).isZero();
        assertThat(parsed.usage().cacheRead()).isEqualTo(9);
    }

    private static final class HarnessLines {
        static String line(String id, String req, String model, long in, long out) {
            return TranscriptHarness.assistant("s", id, req, model, "2026-10-10T01:00:00.000Z", in, out, 0, 0);
        }
    }
}
