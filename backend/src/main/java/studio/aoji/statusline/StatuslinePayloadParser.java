package studio.aoji.statusline;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * {@code POST /hooks/statusline} 본문 검증 (ADR-83 결정 4, FR-027-E2·E3). 읽는 키는 {@code subscription_type},
 * {@code rate_limits.five_hour|seven_day.used_percentage|resets_at} 뿐이고 그 밖의 키는 값을 보지 않는다.
 * 키가 없으면 그 항목만 비어 있고(E2), 타입이 틀리거나 범위 밖이면 거부 사유 코드를 돌려준다(E3).
 * 사유 코드는 고정 문자열이라 입력 값이 로그로 새지 않는다.
 */
@Component
public class StatuslinePayloadParser {

    private static final Pattern PLAN = Pattern.compile("^[A-Za-z0-9 _.-]{1,40}$");
    private static final double MAX_PERCENT = 1000;
    /** 에포크 초로 볼 상한(5138년). 밀리초 값이 들어오면 단위가 섞인 것이라 거부한다. */
    private static final double MAX_EPOCH_SECONDS = 100_000_000_000d;

    private final ObjectMapper objectMapper;

    public StatuslinePayloadParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 검증을 통과한 값 또는 거부 사유 중 하나. */
    public record Result(Parsed parsed, String rejectReason) {

        public boolean accepted() {
            return parsed != null;
        }
    }

    /** 수신 시각을 붙이기 전의 값. */
    public record Parsed(String plan, StatuslineLast.Window fiveHour, StatuslineLast.Window sevenDay) {}

    public Result parse(String body) {
        JsonNode root;
        try {
            root = objectMapper.readTree(body);
        } catch (JacksonException e) {
            return reject("PARSE_ERROR");
        }
        if (root == null || !root.isObject()) {
            return reject("NOT_OBJECT");
        }

        String plan = null;
        JsonNode planNode = root.get("subscription_type");
        if (planNode != null && !planNode.isNull()) {
            if (!planNode.isString()) {
                return reject("SUBSCRIPTION_TYPE_TYPE");
            }
            if (!PLAN.matcher(planNode.stringValue()).matches()) {
                return reject("SUBSCRIPTION_TYPE_FORMAT");
            }
            plan = planNode.stringValue();
        }

        StatuslineLast.Window fiveHour = StatuslineLast.Window.ABSENT;
        StatuslineLast.Window sevenDay = StatuslineLast.Window.ABSENT;
        JsonNode limits = root.get("rate_limits");
        if (limits != null && !limits.isNull()) {
            if (!limits.isObject()) {
                return reject("RATE_LIMITS_TYPE");
            }
            Object five = window(limits.get("five_hour"), "FIVE_HOUR");
            if (five instanceof String reason) {
                return reject(reason);
            }
            Object seven = window(limits.get("seven_day"), "SEVEN_DAY");
            if (seven instanceof String reason) {
                return reject(reason);
            }
            fiveHour = (StatuslineLast.Window) five;
            sevenDay = (StatuslineLast.Window) seven;
        }
        return new Result(new Parsed(plan, fiveHour, sevenDay), null);
    }

    /** @return {@link StatuslineLast.Window} 또는 거부 사유(String) */
    private static Object window(JsonNode node, String prefix) {
        if (node == null || node.isNull()) {
            return StatuslineLast.Window.ABSENT;
        }
        if (!node.isObject()) {
            return prefix + "_TYPE";
        }
        Double percent = null;
        JsonNode used = node.get("used_percentage");
        if (used != null && !used.isNull()) {
            if (!used.isNumber()) {
                return prefix + "_USED_PERCENTAGE_TYPE";
            }
            double value = used.doubleValue();
            if (!Double.isFinite(value) || value < 0 || value > MAX_PERCENT) {
                return prefix + "_USED_PERCENTAGE_RANGE";
            }
            percent = value;
        }
        Instant resetsAt = null;
        JsonNode resets = node.get("resets_at");
        if (resets != null && !resets.isNull()) {
            if (resets.isNumber()) {
                double seconds = resets.doubleValue();
                if (!Double.isFinite(seconds) || seconds < 0 || seconds > MAX_EPOCH_SECONDS) {
                    return prefix + "_RESETS_AT_RANGE";
                }
                resetsAt = Instant.ofEpochMilli(Math.round(seconds * 1000));
            } else if (resets.isString()) {
                try {
                    resetsAt = OffsetDateTime.parse(resets.stringValue()).toInstant();
                } catch (DateTimeParseException e) {
                    return prefix + "_RESETS_AT_FORMAT";
                }
            } else {
                return prefix + "_RESETS_AT_TYPE";
            }
        }
        if (percent == null) {
            return StatuslineLast.Window.ABSENT;
        }
        return new StatuslineLast.Window(true, percent, resetsAt);
    }

    private static Result reject(String reason) {
        return new Result(null, reason);
    }
}
