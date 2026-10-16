package studio.aoji.usage;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

/**
 * UTC 15분 구간 시작 문자열 {@code YYYY-MM-DDTHH:MM:00Z} (ADR-80 결정 2·3). 모든 표준 시간대 오프셋이
 * 15분의 배수라 어떤 시간대의 날짜 경계도 구간 경계와 정확히 일치한다. 문자열 사전순 = 시간순이다.
 */
public final class UsageBucket {

    private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:00'Z'");
    private static final int BUCKET_MINUTES = 15;

    private UsageBucket() {}

    /** {@code instant}가 속한 15분 구간의 시작. */
    public static String of(Instant instant) {
        ZonedDateTime utc = instant.atZone(ZoneOffset.UTC).truncatedTo(ChronoUnit.MINUTES);
        ZonedDateTime start = utc.minusMinutes(utc.getMinute() % BUCKET_MINUTES);
        return FORMAT.format(start);
    }

    /** 구간 시작 문자열 → 시각. */
    public static Instant parse(String bucket) {
        return Instant.parse(bucket);
    }
}
