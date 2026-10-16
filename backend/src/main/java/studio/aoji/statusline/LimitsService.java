package studio.aoji.statusline;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.stereotype.Service;
import studio.aoji.globalcfg.GlobalClaudeReader;
import studio.aoji.globalcfg.UsageCache;

/**
 * 구독 플랜·5시간·주간 한도 (FR-027-AC4·AC8, ADR-83 결정 6). 창마다 상태줄 마지막 값({@code statusline_last})과
 * 한도 캐시({@code cachedUsageUtilization}) 중 받은 시각이 더 최근인 값을 고른다. 두 시각은 모두 {@link Instant}로
 * 바꿔 비교한다 — 상태줄 {@code received_at}은 서버 시계 시각, 캐시 {@code fetchedAtMs}는 에포크 밀리초이고,
 * 상태줄 {@code resets_at}(에포크 초)과 캐시 {@code resets_at}(ISO)도 파싱 단계에서 같은 {@link Instant}가 된다.
 * 같으면 상태줄을 쓴다. 캐시가 없거나 그 창이 형식이 다르면 상태줄 값만 쓴다. 플랜은 상태줄 값만이다.
 */
@Service
public class LimitsService {

    private final StatuslineStore store;
    private final GlobalClaudeReader globalClaudeReader;
    private final Clock clock;

    public LimitsService(StatuslineStore store, GlobalClaudeReader globalClaudeReader, Clock clock) {
        this.store = store;
        this.globalClaudeReader = globalClaudeReader;
        this.clock = clock;
    }

    public Limits limits() {
        Optional<StatuslineLast> last = store.last();
        UsageCache cache = globalClaudeReader.snapshot().usageCache();
        Instant cacheFetchedAt = cache == null ? null : Instant.ofEpochMilli(cache.fetchedAtMs());

        StatuslineLast.Window statuslineFive = last.map(StatuslineLast::fiveHour).orElse(null);
        StatuslineLast.Window statuslineSeven = last.map(StatuslineLast::sevenDay).orElse(null);
        Instant statuslineAt = last.map(StatuslineLast::receivedAt).orElse(null);

        String plan = last.map(StatuslineLast::plan).orElse(null);
        return new Limits(
                new Limits.Plan(plan, plan == null ? null : time(statuslineAt)),
                merge(statuslineAt, statuslineFive, cacheFetchedAt, cache == null ? null : cache.fiveHour()),
                merge(statuslineAt, statuslineSeven, cacheFetchedAt, cache == null ? null : cache.sevenDay()),
                time(statuslineAt));
    }

    private Limits.LimitValue merge(
            Instant statuslineAt, StatuslineLast.Window statusline, Instant cacheAt, UsageCache.Window cache) {
        boolean statuslineHas = statusline != null && statusline.present();
        if (statuslineHas && cache != null && cacheAt.isAfter(statuslineAt)) {
            return fromCache(cacheAt, cache);
        }
        if (statuslineHas) {
            return new Limits.LimitValue(
                    "ok", statusline.usedPercent(), time(statusline.resetsAt()), "statusline", time(statuslineAt));
        }
        if (cache != null) {
            return fromCache(cacheAt, cache);
        }
        if (statuslineAt != null) {
            return new Limits.LimitValue("missing", null, null, "statusline", time(statuslineAt));
        }
        return new Limits.LimitValue("never", null, null, null, null);
    }

    private Limits.LimitValue fromCache(Instant cacheAt, UsageCache.Window window) {
        return new Limits.LimitValue("ok", window.percent(), time(window.resetsAt()), "cache", time(cacheAt));
    }

    private OffsetDateTime time(Instant instant) {
        return instant == null ? null : instant.atZone(clock.getZone()).toOffsetDateTime();
    }
}
