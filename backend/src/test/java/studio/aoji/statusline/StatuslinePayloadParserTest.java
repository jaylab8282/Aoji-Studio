package studio.aoji.statusline;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

/** 상태줄 본문 검증 (ADR-83 결정 4, FR-027-E2·E3). */
class StatuslinePayloadParserTest {

    private final StatuslinePayloadParser parser = new StatuslinePayloadParser(new ObjectMapper());

    @Test
    @DisplayName("[FR-027-E2] 키가 없는 항목은 그 항목만 비어 있다")
    void missingKeysAreAbsentOnly() {
        StatuslinePayloadParser.Parsed parsed = parser
                .parse("{\"rate_limits\":{\"five_hour\":{\"used_percentage\":10,\"resets_at\":4070908800}}}")
                .parsed();

        assertThat(parsed.plan()).isNull();
        assertThat(parsed.fiveHour().present()).isTrue();
        assertThat(parsed.fiveHour().resetsAt()).isEqualTo(Instant.ofEpochSecond(4070908800L));
        assertThat(parsed.sevenDay().present()).isFalse();
        assertThat(parser.parse("{}").accepted()).isTrue();
    }

    @Test
    @DisplayName("[FR-027-E3] 타입 오류·범위 밖·단위 혼동은 고정 사유 코드로 거부한다")
    void rejectsWithFixedReasonCodes() {
        assertThat(parser.parse("not json").rejectReason()).isEqualTo("PARSE_ERROR");
        assertThat(parser.parse("[]").rejectReason()).isEqualTo("NOT_OBJECT");
        assertThat(parser.parse("{\"subscription_type\":7}").rejectReason()).isEqualTo("SUBSCRIPTION_TYPE_TYPE");
        assertThat(parser.parse("{\"subscription_type\":\"max<script>\"}").rejectReason())
                .isEqualTo("SUBSCRIPTION_TYPE_FORMAT");
        assertThat(parser.parse("{\"rate_limits\":3}").rejectReason()).isEqualTo("RATE_LIMITS_TYPE");
        assertThat(parser.parse("{\"rate_limits\":{\"five_hour\":{\"used_percentage\":\"x\"}}}").rejectReason())
                .isEqualTo("FIVE_HOUR_USED_PERCENTAGE_TYPE");
        assertThat(parser.parse("{\"rate_limits\":{\"seven_day\":{\"used_percentage\":1000.5}}}").rejectReason())
                .isEqualTo("SEVEN_DAY_USED_PERCENTAGE_RANGE");
        assertThat(parser.parse("{\"rate_limits\":{\"seven_day\":{\"used_percentage\":-1}}}").rejectReason())
                .isEqualTo("SEVEN_DAY_USED_PERCENTAGE_RANGE");
        assertThat(parser.parse("{\"rate_limits\":{\"five_hour\":{\"used_percentage\":1,\"resets_at\":{\"a\":1}}}}")
                        .rejectReason())
                .isEqualTo("FIVE_HOUR_RESETS_AT_TYPE");
        assertThat(parser.parse("{\"rate_limits\":{\"five_hour\":{\"used_percentage\":1,\"resets_at\":1792020000000}}}")
                        .rejectReason())
                .as("밀리초 값을 초로 받지 않는다")
                .isEqualTo("FIVE_HOUR_RESETS_AT_RANGE");
        assertThat(parser.parse("{\"rate_limits\":{\"five_hour\":{\"used_percentage\":1,\"resets_at\":\"soon\"}}}")
                        .rejectReason())
                .isEqualTo("FIVE_HOUR_RESETS_AT_FORMAT");
    }

    @Test
    @DisplayName("[FR-027-AC4] resets_at은 에포크 초(수)와 ISO-8601 문자열을 같은 시각으로 읽는다, 0~1000% 허용")
    void epochSecondsAndIsoAgree() {
        StatuslinePayloadParser.Parsed parsed = parser
                .parse("{\"subscription_type\":\"max\",\"rate_limits\":{\"five_hour\":{\"used_percentage\":1000,"
                        + "\"resets_at\":4070908800},\"seven_day\":{\"used_percentage\":0,"
                        + "\"resets_at\":\"2099-01-01T09:00:00+09:00\"}}}")
                .parsed();

        assertThat(parsed.plan()).isEqualTo("max");
        assertThat(parsed.fiveHour().usedPercent()).isEqualTo(1000.0);
        assertThat(parsed.fiveHour().resetsAt()).isEqualTo(Instant.parse("2099-01-01T00:00:00Z"));
        assertThat(parsed.sevenDay().usedPercent()).isEqualTo(0.0);
        assertThat(parsed.sevenDay().resetsAt()).isEqualTo(parsed.fiveHour().resetsAt());
    }
}
