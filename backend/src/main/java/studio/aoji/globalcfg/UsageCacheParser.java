package studio.aoji.globalcfg;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import org.springframework.stereotype.Component;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;

/**
 * {@code cachedUsageUtilization} 객체 파서 (FR-027-AC4, ADR-83 결정 6). T-R4-13의 한도 병합이 쓴다.
 * 읽는 키: {@code fetchedAtMs}(정수, 에포크 밀리초), {@code utilization.five_hour|seven_day.utilization}
 * (숫자 0~100), {@code resets_at}(ISO-8601 문자열). 나머지 키({@code accountUuid} 포함)는 값을 만들지 않고
 * {@code skipChildren()}한다. 창의 값이 없거나 형태가 다르면(문자열 %·0~100 밖·ISO 아님) 그 창만 null이다.
 */
@Component
public class UsageCacheParser {

    /** 에포크 밀리초로 볼 하한(1973년). 초 단위 값이 들어오면 캐시 없음으로 본다. */
    private static final long MIN_EPOCH_MILLIS = 100_000_000_000L;

    /**
     * 파서는 {@code cachedUsageUtilization}의 값 위치에 있어야 한다. 객체면 끝까지 읽고 {@code END_OBJECT}에서
     * 멈춘다(그 밖의 값이면 건너뛴다).
     *
     * @return {@code fetchedAtMs}가 없거나 형태가 다르면 null(낡음을 판정할 수 없다)
     */
    public UsageCache parse(JsonParser parser) {
        if (parser.currentToken() != JsonToken.START_OBJECT) {
            parser.skipChildren();
            return null;
        }
        Long fetchedAtMs = null;
        UsageCache.Window fiveHour = null;
        UsageCache.Window sevenDay = null;
        while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
            String key = parser.currentName();
            JsonToken value = parser.nextToken();
            if (key.equals("fetchedAtMs")) {
                if (value == JsonToken.VALUE_NUMBER_INT) {
                    long millis = parser.getLongValue();
                    fetchedAtMs = millis >= MIN_EPOCH_MILLIS ? millis : null;
                }
            } else if (key.equals("utilization") && value == JsonToken.START_OBJECT) {
                while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
                    String window = parser.currentName();
                    JsonToken windowValue = parser.nextToken();
                    if (window.equals("five_hour") && windowValue == JsonToken.START_OBJECT) {
                        fiveHour = readWindow(parser);
                    } else if (window.equals("seven_day") && windowValue == JsonToken.START_OBJECT) {
                        sevenDay = readWindow(parser);
                    } else {
                        parser.skipChildren();
                    }
                }
            } else {
                parser.skipChildren();
            }
        }
        return fetchedAtMs == null ? null : new UsageCache(fetchedAtMs, fiveHour, sevenDay);
    }

    private UsageCache.Window readWindow(JsonParser parser) {
        Double percent = null;
        Instant resetsAt = null;
        while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
            String key = parser.currentName();
            JsonToken value = parser.nextToken();
            if (key.equals("utilization") && value.isNumeric()) {
                double number = parser.getDoubleValue();
                percent = number >= 0 && number <= 100 ? number : null;
            } else if (key.equals("resets_at") && value == JsonToken.VALUE_STRING) {
                try {
                    resetsAt = OffsetDateTime.parse(parser.getString()).toInstant();
                } catch (DateTimeParseException e) {
                    resetsAt = null;
                }
            } else {
                parser.skipChildren();
            }
        }
        return percent == null || resetsAt == null ? null : new UsageCache.Window(percent, resetsAt);
    }
}
