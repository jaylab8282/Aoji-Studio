package studio.aoji.statusline;

import java.time.OffsetDateTime;

/**
 * api-spec {@code Limits} — {@code GET /api/limits} 응답 (FR-027, ADR-83).
 *
 * @param plan 구독 플랜(상태줄 값만, FR-027-AC4). value null이면 {@code 알 수 없음}
 * @param statuslineLastReceivedAt 마지막으로 받은 상태줄 값의 시각. 받은 적 없으면 null
 */
public record Limits(Plan plan, LimitValue fiveHour, LimitValue sevenDay, OffsetDateTime statuslineLastReceivedAt) {

    /** 구독 플랜. 플랜이 확인되면 value가 null이 아니다(FR-026-AC2). */
    public record Plan(String value, OffsetDateTime receivedAt) {

        public boolean confirmed() {
            return value != null;
        }
    }

    /**
     * 한도 한 창.
     *
     * @param state {@code ok}(값 있음) | {@code missing}(상태줄을 받았지만 이 항목 없음, FR-027-E2) |
     *     {@code never}(상태줄·캐시 어디에도 받은 적 없음, FR-027-E1)
     * @param source {@code statusline} | {@code cache} | null
     * @param receivedAt 상태줄 수신 시각 또는 캐시 {@code fetchedAtMs}
     */
    public record LimitValue(
            String state, Double usedPercent, OffsetDateTime resetsAt, String source, OffsetDateTime receivedAt) {}
}
