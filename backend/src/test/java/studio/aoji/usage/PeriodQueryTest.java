package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import studio.aoji.api.ApiException;

class PeriodQueryTest {

    private static Clock at(String utcInstant) {
        return Clock.fixed(Instant.parse(utcInstant), ZoneOffset.UTC);
    }

    @Test
    void seoulSevenDaysCoversTodayAndSixPreviousLocalDays() {
        // [FR-019-AC4] Asia/Seoul: 오늘 포함 최근 7일, 자정 = 전날 15:00Z
        PeriodQuery query = PeriodQuery.parse("7d", "Asia/Seoul", at("2026-10-16T03:00:00Z"));

        assertThat(query.firstDate()).isEqualTo(LocalDate.of(2026, 10, 10));
        assertThat(query.lastDate()).isEqualTo(LocalDate.of(2026, 10, 16));
        assertThat(query.fromBucket()).isEqualTo("2026-10-09T15:00:00Z");
        assertThat(query.toBucket()).isEqualTo("2026-10-16T15:00:00Z");
    }

    @Test
    void seoulDateBoundaryFallsExactlyOnBucketBoundary() {
        // [FR-019-AC4] 15:00Z는 서울 자정: 14:45Z 구간은 전날, 15:00Z 구간은 다음 날
        PeriodQuery query = PeriodQuery.parse("7d", "Asia/Seoul", at("2026-10-16T03:00:00Z"));

        assertThat(query.localDate("2026-10-15T14:45:00Z")).isEqualTo(LocalDate.of(2026, 10, 15));
        assertThat(query.localDate("2026-10-15T15:00:00Z")).isEqualTo(LocalDate.of(2026, 10, 16));
    }

    @Test
    void kolkataHalfHourOffsetBoundary() {
        // [FR-019-AC4] Asia/Kolkata(+05:30): 로컬 날짜가 UTC 18:30에 바뀐다
        PeriodQuery query = PeriodQuery.parse("7d", "Asia/Kolkata", at("2026-10-16T20:00:00Z"));

        assertThat(query.lastDate()).isEqualTo(LocalDate.of(2026, 10, 17));
        assertThat(query.fromBucket()).isEqualTo("2026-10-10T18:30:00Z");
        assertThat(query.toBucket()).isEqualTo("2026-10-17T18:30:00Z");
        assertThat(query.localDate("2026-10-16T18:15:00Z")).isEqualTo(LocalDate.of(2026, 10, 16));
        assertThat(query.localDate("2026-10-16T18:30:00Z")).isEqualTo(LocalDate.of(2026, 10, 17));
    }

    @Test
    void newYorkDstEndDayHasTwentyFiveHours() {
        // [FR-019-AC4] America/New_York 2026-11-01(DST 종료, 25시간): 7일 구간 = 169시간
        PeriodQuery query = PeriodQuery.parse("7d", "America/New_York", at("2026-11-02T12:00:00Z"));

        assertThat(query.firstDate()).isEqualTo(LocalDate.of(2026, 10, 27));
        assertThat(query.fromBucket()).isEqualTo("2026-10-27T04:00:00Z");
        assertThat(query.toBucket()).isEqualTo("2026-11-03T05:00:00Z");
        assertThat(Duration.between(query.from(), query.to())).isEqualTo(Duration.ofHours(169));
        assertThat(query.localDate("2026-11-01T03:45:00Z")).isEqualTo(LocalDate.of(2026, 10, 31));
        assertThat(query.localDate("2026-11-01T04:00:00Z")).isEqualTo(LocalDate.of(2026, 11, 1));
        assertThat(query.localDate("2026-11-02T04:45:00Z")).isEqualTo(LocalDate.of(2026, 11, 1));
        assertThat(query.localDate("2026-11-02T05:00:00Z")).isEqualTo(LocalDate.of(2026, 11, 2));
    }

    @Test
    void newYorkDstStartWeekHas167Hours() {
        // [FR-019-AC4] America/New_York 2026-03-08(DST 시작, 23시간): 7일 구간 = 167시간
        PeriodQuery query = PeriodQuery.parse("7d", "America/New_York", at("2026-03-08T20:00:00Z"));

        assertThat(query.fromBucket()).isEqualTo("2026-03-02T05:00:00Z");
        assertThat(query.toBucket()).isEqualTo("2026-03-09T04:00:00Z");
        assertThat(Duration.between(query.from(), query.to())).isEqualTo(Duration.ofHours(167));
    }

    @Test
    void thirtyDaysAndAllPeriods() {
        // [FR-019-AC4] 30d = 오늘 포함 30일, all = 경계 없음
        PeriodQuery thirty = PeriodQuery.parse("30d", "Asia/Seoul", at("2026-10-16T03:00:00Z"));
        PeriodQuery all = PeriodQuery.parse("all", "Asia/Seoul", at("2026-10-16T03:00:00Z"));

        assertThat(thirty.firstDate()).isEqualTo(LocalDate.of(2026, 9, 17));
        assertThat(thirty.fromBucket()).isEqualTo("2026-09-16T15:00:00Z");
        assertThat(all.fromBucket()).isNull();
        assertThat(all.toBucket()).isNull();
        assertThat(all.firstDate()).isNull();
    }

    @Test
    void missingPeriodDefaultsToSevenDays() {
        // [FR-019-AC4] period 생략 = 7d(api-spec 기본값)
        PeriodQuery query = PeriodQuery.parse(null, "UTC", at("2026-10-16T03:00:00Z"));

        assertThat(query.period()).isEqualTo("7d");
        assertThat(query.fromBucket()).isEqualTo("2026-10-10T00:00:00Z");
    }

    @Test
    void unknownTimeZoneIsValidationError() {
        // [FR-019-AC4] 잘못된 tz → 400 VALIDATION fields.tz
        for (String tz : new String[] {"Mars/Base", "+09:00", "", "  ", null}) {
            assertThatThrownBy(() -> PeriodQuery.parse("7d", tz, at("2026-10-16T03:00:00Z")))
                    .isInstanceOfSatisfying(ApiException.class, e -> {
                        assertThat(e.status()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(e.error().code()).isEqualTo("VALIDATION");
                        assertThat(e.error().fields()).containsEntry("tz", "알 수 없는 시간대");
                    });
        }
    }

    @Test
    void unknownPeriodIsValidationError() {
        // [FR-019-AC4] 잘못된 period → 400 VALIDATION fields.period
        for (String period : new String[] {"90d", "1d", "ALL", ""}) {
            assertThatThrownBy(() -> PeriodQuery.parse(period, "Asia/Seoul", at("2026-10-16T03:00:00Z")))
                    .isInstanceOfSatisfying(ApiException.class, e -> {
                        assertThat(e.status()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(e.error().code()).isEqualTo("VALIDATION");
                        assertThat(e.error().fields()).containsEntry("period", "7d·30d·all 중 하나");
                    });
        }
    }

    @Test
    void bothInvalidReportsBothFields() {
        // [FR-019-AC4] period·tz 둘 다 틀리면 fields에 둘 다
        assertThatThrownBy(() -> PeriodQuery.parse("x", "nope", at("2026-10-16T03:00:00Z")))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.error().fields())
                        .isEqualTo(Map.of("period", "7d·30d·all 중 하나", "tz", "알 수 없는 시간대")));
    }
}
