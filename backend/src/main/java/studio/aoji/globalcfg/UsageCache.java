package studio.aoji.globalcfg;

import java.time.Instant;

/**
 * {@code ~/.claude.json}의 {@code cachedUsageUtilization}에서 읽은 한도 캐시 (ADR-83 결정 6, A-27 정정).
 * 계정 식별자({@code accountUuid})는 읽지 않으므로 담지 않는다(NFR-15).
 *
 * @param fetchedAtMs 캐시를 받은 시각(에포크 밀리초)
 * @param fiveHour 5시간 창. 키 없음·형태 다름이면 null(그 창 캐시 없음)
 * @param sevenDay 7일 창. 키 없음·형태 다름이면 null
 */
public record UsageCache(long fetchedAtMs, Window fiveHour, Window sevenDay) {

    /**
     * 한도 한 창.
     *
     * @param percent 사용률 0~100(원값)
     * @param resetsAt 초기화 시각
     */
    public record Window(double percent, Instant resetsAt) {}
}
