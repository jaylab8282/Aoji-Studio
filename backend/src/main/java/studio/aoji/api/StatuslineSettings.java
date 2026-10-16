package studio.aoji.api;

import java.time.OffsetDateTime;

/**
 * api-spec {@code StatuslineSettings} — {@code Settings.statusline} (07 상태줄 연동 카드, FR-014-AC6, ADR-83).
 *
 * @param settingsExample `설정 예시 복사`가 그대로 복사하는 조각(바깥 {@code {}} 없음, 토큰 없음)
 * @param lastReceivedAt 마지막으로 받은 상태줄 값의 시각. 없으면 null
 */
public record StatuslineSettings(String settingsExample, OffsetDateTime lastReceivedAt) {}
