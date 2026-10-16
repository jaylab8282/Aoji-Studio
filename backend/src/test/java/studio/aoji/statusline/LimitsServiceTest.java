package studio.aoji.statusline;

import static org.assertj.core.api.Assertions.assertThat;
import static studio.aoji.statusline.StatuslineTestSupport.cacheJson;
import static studio.aoji.statusline.StatuslineTestSupport.window;

import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import studio.aoji.support.MutableClock;

/** 구독 플랜·한도 병합 (FR-027-AC4·AC8·E1, FR-026-AC2, ADR-83 결정 6). 캐시는 A-27 실제 구조를 쓴다. */
class LimitsServiceTest {

    /** 캐시 {@code fetchedAtMs}(에포크 밀리초). */
    private static final long FETCHED_MS = 1_792_020_000_000L;

    private static final Instant FETCHED = Instant.ofEpochMilli(FETCHED_MS);
    private static final String CACHE_FIVE = window(21, "2099-01-01T05:00:00.000000+00:00");
    private static final String CACHE_SEVEN = window(48, "2099-01-04T09:00:00.000000+00:00");

    @TempDir
    Path home;

    @TempDir
    Path dbDir;

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-16T01:00:00Z"), ZoneId.of("Asia/Seoul"));

    private StatuslineStore store;

    private LimitsService service(String claudeJson) throws Exception {
        store = StatuslineTestSupport.store(dbDir.resolve("events.db"));
        return new LimitsService(store, StatuslineTestSupport.reader(home, claudeJson, clock), clock);
    }

    private void received(Instant at, String plan, StatuslineLast.Window five, StatuslineLast.Window seven) {
        store.save(new StatuslineLast(plan, five, seven, at));
    }

    @Test
    @DisplayName("[FR-027-E1] 상태줄도 캐시도 없으면 두 창 모두 never·source null, 플랜 null, 마지막 수신 null")
    void neverReceived() throws Exception {
        Limits limits = service(null).limits();

        assertThat(limits.fiveHour()).isEqualTo(new Limits.LimitValue("never", null, null, null, null));
        assertThat(limits.sevenDay()).isEqualTo(new Limits.LimitValue("never", null, null, null, null));
        assertThat(limits.plan().value()).isNull();
        assertThat(limits.plan().receivedAt()).isNull();
        assertThat(limits.statuslineLastReceivedAt()).isNull();
    }

    @Test
    @DisplayName("[FR-027-AC4] 캐시 fetchedAtMs가 상태줄 received_at보다 1ms라도 최근이면 캐시, 같거나 이전이면 상태줄 — 밀리초끼리 비교")
    void newerSourceWinsInMilliseconds() throws Exception {
        LimitsService service = service(cacheJson(FETCHED_MS, CACHE_FIVE, CACHE_SEVEN));
        StatuslineLast.Window five = StatuslineTestSupport.window(37.5, Instant.parse("2099-02-01T00:00:00Z"));
        StatuslineLast.Window seven = StatuslineTestSupport.window(12.25, Instant.parse("2099-02-08T00:00:00Z"));

        received(FETCHED.minusMillis(1), "max", five, seven);
        Limits cacheNewer = service.limits();
        assertThat(cacheNewer.fiveHour().source()).isEqualTo("cache");
        assertThat(cacheNewer.fiveHour().usedPercent()).isEqualTo(21.0);
        assertThat(cacheNewer.fiveHour().receivedAt().toInstant()).isEqualTo(FETCHED);
        assertThat(cacheNewer.sevenDay().source()).isEqualTo("cache");
        assertThat(cacheNewer.sevenDay().usedPercent()).isEqualTo(48.0);

        received(FETCHED, "max", five, seven);
        assertThat(service.limits().fiveHour().source()).as("같은 시각은 상태줄").isEqualTo("statusline");

        received(FETCHED.plusMillis(1), "max", five, seven);
        Limits statuslineNewer = service.limits();
        assertThat(statuslineNewer.fiveHour().source()).isEqualTo("statusline");
        assertThat(statuslineNewer.fiveHour().usedPercent()).isEqualTo(37.5);
        assertThat(statuslineNewer.fiveHour().receivedAt().toInstant()).isEqualTo(FETCHED.plusMillis(1));
        assertThat(statuslineNewer.sevenDay().usedPercent()).isEqualTo(12.25);
    }

    @Test
    @DisplayName("[FR-027-AC4] 창마다 고른다 — 상태줄이 최근이어도 그 창 값이 없으면 캐시 값")
    void perWindowSelection() throws Exception {
        LimitsService service = service(cacheJson(FETCHED_MS, CACHE_FIVE, CACHE_SEVEN));
        received(FETCHED.plusSeconds(60), "pro", StatuslineTestSupport.window(30, Instant.parse("2099-02-01T00:00:00Z")),
                StatuslineLast.Window.ABSENT);

        Limits limits = service.limits();

        assertThat(limits.fiveHour().source()).isEqualTo("statusline");
        assertThat(limits.sevenDay().source()).isEqualTo("cache");
        assertThat(limits.sevenDay().state()).isEqualTo("ok");
        assertThat(limits.sevenDay().usedPercent()).isEqualTo(48.0);
    }

    @Test
    @DisplayName("[FR-027-AC4] 상태줄 resets_at(에포크 초)과 캐시 resets_at(ISO)은 같은 시각으로 나온다")
    void resetsAtUnitsMatch() throws Exception {
        Instant reset = Instant.parse("2099-01-01T05:00:00Z");
        LimitsService service = service(cacheJson(FETCHED_MS, window(21, "2099-01-01T14:00:00.000000+09:00"), null));

        // 상태줄 값은 파서가 에포크 초에서 만든 Instant — 컨트롤러와 같은 경로
        StatuslinePayloadParser parser = new StatuslinePayloadParser(new tools.jackson.databind.ObjectMapper());
        StatuslineLast.Window fromEpochSeconds = parser
                .parse("{\"rate_limits\":{\"five_hour\":{\"used_percentage\":22,\"resets_at\":" + reset.getEpochSecond()
                        + "}}}")
                .parsed()
                .fiveHour();
        assertThat(fromEpochSeconds.resetsAt()).isEqualTo(reset);

        Limits cache = service.limits();
        assertThat(cache.fiveHour().source()).isEqualTo("cache");
        assertThat(cache.fiveHour().resetsAt().toInstant()).isEqualTo(reset);

        received(FETCHED.plusSeconds(1), null, fromEpochSeconds, StatuslineLast.Window.ABSENT);
        Limits statusline = service.limits();
        assertThat(statusline.fiveHour().source()).isEqualTo("statusline");
        assertThat(statusline.fiveHour().resetsAt().toInstant()).isEqualTo(cache.fiveHour().resetsAt().toInstant());
    }

    @Test
    @DisplayName("[FR-027-AC4] 캐시 없음·형식 다름(문자열 %·0~100 밖·ISO 아님·초 단위 fetchedAtMs) → 상태줄만")
    void unusableCacheFallsBackToStatusline() throws Exception {
        Instant at = Instant.parse("2026-10-16T00:00:00Z");
        StatuslineLast.Window five = StatuslineTestSupport.window(40, Instant.parse("2099-02-01T00:00:00Z"));

        String[] unusable = {
            cacheJson(FETCHED_MS, window("\"21\"", "2099-01-01T05:00:00Z"), window(150, "2099-01-04T09:00:00Z")),
            cacheJson(FETCHED_MS, window(21, "not-a-date"), window(-1, "2099-01-04T09:00:00Z")),
            cacheJson(1_792_020_000L, CACHE_FIVE, CACHE_SEVEN),
            "{\"cachedUsageUtilization\":\"broken\"}",
        };
        for (String claudeJson : unusable) {
            LimitsService service = service(claudeJson);
            received(at, null, five, StatuslineLast.Window.ABSENT);
            Limits limits = service.limits();
            assertThat(limits.fiveHour().source()).isEqualTo("statusline");
            assertThat(limits.fiveHour().usedPercent()).isEqualTo(40.0);
            assertThat(limits.sevenDay().state()).as(claudeJson).isEqualTo("missing");
            assertThat(limits.sevenDay().usedPercent()).isNull();
        }
    }

    @Test
    @DisplayName("[FR-027-AC4] 캐시만 있고 상태줄을 받은 적 없으면 캐시 값, 마지막 수신은 null")
    void cacheOnly() throws Exception {
        Limits limits = service(cacheJson(FETCHED_MS, CACHE_FIVE, CACHE_SEVEN)).limits();

        assertThat(limits.fiveHour()).extracting(Limits.LimitValue::state, Limits.LimitValue::source)
                .containsExactly("ok", "cache");
        assertThat(limits.statuslineLastReceivedAt()).isNull();
        assertThat(limits.plan().value()).as("플랜은 상태줄 값만").isNull();
    }

    @Test
    @DisplayName("[FR-027-E2] 상태줄을 받았지만 한도 키가 없고 캐시도 없으면 missing, 플랜만 있다")
    void receivedWithoutLimits() throws Exception {
        LimitsService service = service(null);
        received(clock.instant(), "pro", StatuslineLast.Window.ABSENT, StatuslineLast.Window.ABSENT);

        Limits limits = service.limits();

        assertThat(limits.fiveHour().state()).isEqualTo("missing");
        assertThat(limits.sevenDay().state()).isEqualTo("missing");
        assertThat(limits.fiveHour().usedPercent()).isNull();
        assertThat(limits.plan().value()).isEqualTo("pro");
        assertThat(limits.statuslineLastReceivedAt().toInstant()).isEqualTo(clock.instant());
    }

    @Test
    @DisplayName("[FR-026-AC2] 플랜 확인 여부 — 상태줄에 subscription_type이 있어야 confirmed, 캐시로는 확인되지 않는다")
    void planConfirmation() throws Exception {
        LimitsService service = service(cacheJson(FETCHED_MS, CACHE_FIVE, CACHE_SEVEN));
        assertThat(service.limits().plan().confirmed()).isFalse();

        received(clock.instant(), null, StatuslineLast.Window.ABSENT, StatuslineLast.Window.ABSENT);
        assertThat(service.limits().plan().confirmed()).as("받았지만 subscription_type 없음").isFalse();

        received(clock.instant(), "max", StatuslineLast.Window.ABSENT, StatuslineLast.Window.ABSENT);
        Limits limits = service.limits();
        assertThat(limits.plan().confirmed()).isTrue();
        assertThat(limits.plan().value()).isEqualTo("max");
        assertThat(limits.plan().receivedAt().toInstant()).isEqualTo(clock.instant());
    }

    @Test
    @DisplayName("[FR-027-AC8] 재시작(같은 DB 파일을 새로 열기) 뒤에도 마지막 값이 남고, 새로 받으면 한 행만 덮어쓴다")
    void lastValueSurvivesRestart() throws Exception {
        LimitsService first = service(null);
        Instant at = Instant.parse("2026-10-16T00:30:00.123Z");
        received(at, "max", StatuslineTestSupport.window(37.5, Instant.parse("2099-01-01T05:00:00Z")),
                StatuslineTestSupport.window(12.25, Instant.parse("2099-01-04T09:00:00Z")));
        assertThat(first.limits().fiveHour().usedPercent()).isEqualTo(37.5);

        LimitsService restarted = service(null);

        Limits limits = restarted.limits();
        assertThat(limits.plan().value()).isEqualTo("max");
        assertThat(limits.fiveHour().usedPercent()).isEqualTo(37.5);
        assertThat(limits.fiveHour().resetsAt().toInstant()).isEqualTo(Instant.parse("2099-01-01T05:00:00Z"));
        assertThat(limits.sevenDay().usedPercent()).isEqualTo(12.25);
        assertThat(limits.statuslineLastReceivedAt().toInstant()).isEqualTo(at);

        received(at.plusSeconds(5), null, StatuslineLast.Window.ABSENT, StatuslineLast.Window.ABSENT);
        Limits overwritten = restarted.limits();
        assertThat(overwritten.plan().value()).as("새 값으로 덮어쓴다 — 이전 플랜이 남지 않는다").isNull();
        assertThat(overwritten.fiveHour().state()).isEqualTo("missing");
    }
}
