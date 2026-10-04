package studio.aoji.events;

import java.time.OffsetDateTime;

/**
 * api-spec {@code EventRow}. {@link EventRow}(DB 행)에 읽는 시점 계산 값을 더해 만든다(ADR-09).
 * {@code workflow}는 registry에서, {@code agentLabel}은 {@code studio.aoji.live.LiveStateService}가
 * 로비 세션 번호(서버 수명 내 {@code [세션 N]}, 재시작 전 이벤트는 {@code [세션]`)까지 계산해 채운다.
 * {@code Live.AgentLive.lastEvent}에도 같은 타입을 그대로 쓴다(api-spec "Snapshot·Registry·Live·
 * EventRow를 그대로 쓴다").
 */
public record EventRowResponse(
        long id,
        OffsetDateTime at,
        String hookEventName,
        String kind,
        String title,
        String summary,
        String sessionId,
        String agentId,
        String agentType,
        String agentLabel,
        String toolName,
        String workflow) {
}
