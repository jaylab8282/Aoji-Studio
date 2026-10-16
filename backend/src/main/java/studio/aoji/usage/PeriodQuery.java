package studio.aoji.usage;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import studio.aoji.api.ApiException;

/**
 * 기간 조회 파라미터 {@code period}·{@code tz} → 구간 {@code [from, to)} (FR-019-AC4, ADR-80 결정 3,
 * ADR-86 결정 3). {@code 7d}·{@code 30d}는 {@code tz}의 오늘 포함 최근 N일, {@code all}은 경계 없음.
 * 날짜 경계는 {@code tz}의 로컬 자정(DST 날짜는 23·25시간)이고, UTC 15분 구간 시작과 정확히 겹친다.
 *
 * @param from 구간 시작(포함). {@code all}이면 {@code null}
 * @param to 구간 끝(제외). {@code all}이면 {@code null}
 * @param firstDate 구간의 첫 로컬 날짜. {@code all}이면 {@code null}
 * @param lastDate 구간의 마지막 로컬 날짜(오늘). {@code all}이면 {@code null}
 */
public record PeriodQuery(
        String period, ZoneId zone, Instant from, Instant to, LocalDate firstDate, LocalDate lastDate) {

    public static final String PERIOD_MESSAGE = "7d·30d·all 중 하나";
    public static final String TZ_MESSAGE = "알 수 없는 시간대";

    /**
     * 검증하고 구간을 만든다. {@code period}가 {@code null}이면 기본 {@code 7d}. 틀리면 400 {@code VALIDATION}
     * ({@code fields.period}·{@code fields.tz}).
     */
    public static PeriodQuery parse(String period, String tz, Clock clock) {
        String effectivePeriod = period == null ? "7d" : period;
        Map<String, String> errors = new LinkedHashMap<>();
        if (!effectivePeriod.equals("7d") && !effectivePeriod.equals("30d") && !effectivePeriod.equals("all")) {
            errors.put("period", PERIOD_MESSAGE);
        }
        ZoneId zone = null;
        if (tz == null || tz.isBlank() || !ZoneId.getAvailableZoneIds().contains(tz)) {
            errors.put("tz", TZ_MESSAGE);
        } else {
            zone = ZoneId.of(tz);
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation(errors);
        }
        if (effectivePeriod.equals("all")) {
            return new PeriodQuery(effectivePeriod, zone, null, null, null, null);
        }
        int days = effectivePeriod.equals("7d") ? 7 : 30;
        LocalDate today = clock.instant().atZone(zone).toLocalDate();
        LocalDate first = today.minusDays(days - 1L);
        Instant from = first.atStartOfDay(zone).toInstant();
        Instant to = today.plusDays(1).atStartOfDay(zone).toInstant();
        return new PeriodQuery(effectivePeriod, zone, from, to, first, today);
    }

    /** {@code usage_*.bucket} 하한(포함). {@code all}이면 {@code null}. */
    public String fromBucket() {
        return from == null ? null : UsageBucket.of(from);
    }

    /** {@code usage_*.bucket} 상한(제외). {@code all}이면 {@code null}. */
    public String toBucket() {
        return to == null ? null : UsageBucket.of(to);
    }

    /** 구간 시작 문자열을 이 시간대의 로컬 날짜로 바꾼다(날짜별 나눔). */
    public LocalDate localDate(String bucket) {
        return UsageBucket.parse(bucket).atZone(ZoneOffset.UTC).withZoneSameInstant(zone).toLocalDate();
    }
}
