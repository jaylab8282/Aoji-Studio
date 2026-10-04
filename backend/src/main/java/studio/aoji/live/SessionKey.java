package studio.aoji.live;

/**
 * {@link SessionRecord} 맵 키 = {@code agent_id}가 있으면 그 값, 없으면 {@code session_id}
 * (architecture.md §6.6, ADR-10).
 */
public record SessionKey(String value) {

    public static SessionKey of(HookPayload payload) {
        String agentId = payload.agentId();
        String key = (agentId != null && !agentId.isBlank()) ? agentId : payload.sessionId();
        return new SessionKey(key);
    }

    public static SessionKey forSessionId(String sessionId) {
        return new SessionKey(sessionId);
    }
}
