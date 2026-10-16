package studio.aoji.statusline;

import java.time.Instant;

/**
 * 마지막으로 받은 상태줄 값 한 행 ({@code statusline_last}, ADR-83 결정 5). 수신 시각은 서버 시계의 {@link Instant}
 * (밀리초 정밀도)이다 — 한도 캐시의 {@code fetchedAtMs}와 비교할 때 둘 다 {@link Instant}로 맞춘다.
 *
 * @param plan 구독 플랜. 입력에 없었으면 null
 * @param fiveHour 5시간 창
 * @param sevenDay 7일 창
 * @param receivedAt 서버가 받은 시각
 */
public record StatuslineLast(String plan, Window fiveHour, Window sevenDay, Instant receivedAt) {

    /**
     * 한도 한 창.
     *
     * @param present 입력에 {@code used_percentage}가 있었다(없으면 그 항목은 {@code 값 없음}, FR-027-E2)
     * @param usedPercent 사용률 %. present가 아니면 null
     * @param resetsAt 초기화 시각. 입력에 없으면 null
     */
    public record Window(boolean present, Double usedPercent, Instant resetsAt) {

        public static final Window ABSENT = new Window(false, null, null);
    }
}
