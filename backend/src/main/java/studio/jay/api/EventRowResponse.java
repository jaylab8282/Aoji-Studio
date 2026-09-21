package studio.jay.api;

import java.time.OffsetDateTime;

/**
 * api-spec {@code EventRow}. {@link studio.jay.events.EventRow}(DB 행)에 읽는 시점 계산 값을 더해
 * 만든다(ADR-09). {@code workflow}는 registry에서 해석하고, {@code agentLabel}은 {@code agentType}이
 * 있으면 그대로, 없으면 문자 그대로 {@code [세션]}을 쓴다 — 서버 수명 내 {@code [세션 N]} 번호 매기기는
 * {@code LiveStateService}(T-006)가 맡으며, api-spec이 말하는 "재시작 전 이벤트" 대체값과 같은 자리다.
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
