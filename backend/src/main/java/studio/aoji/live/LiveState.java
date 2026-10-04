package studio.aoji.live;

import java.time.OffsetDateTime;
import java.util.Map;
import studio.aoji.events.EventRow;

/**
 * 메모리 상태 전체 (architecture.md §6.6). 불변이며 {@link LiveStateService}가
 * {@code AtomicReference}로 교체한다. 컨테이너 재시작 시 {@code sessions}는 복원하지 않는다
 * (FR-004-AC2 마지막 행, NFR-09) — {@code lastEventByAgent}·{@code lastReceivedAt}·
 * {@code everReceived}만 DB에서 시드한다.
 *
 * @param sessions 현재 살아있는 세션 레코드(key = agent_id ?? session_id)
 * @param lastEventByAgent agent_type별 마지막 이벤트(ADR-09, 기동 시 DB에서 시드, 01 카드 최근 활동용)
 * @param lobbyNumbers session_id → 로비 번호. 서버 수명 내 한 번 배정되면 세션이 끝나도 유지한다
 *     (재시작 전 이벤트의 대체 라벨 판정, api-spec {@code EventRow.agentLabel})
 * @param nextLobbyNo 다음에 배정할 로비 번호
 * @param lastReceivedAt 마지막 수신 시각(FR-003-AC6, 기동 시 DB에서 복원)
 * @param everReceived DB에 이벤트 1건 이상 저장됨(false → 04-1/04-4)
 */
public record LiveState(
        Map<SessionKey, SessionRecord> sessions,
        Map<String, EventRow> lastEventByAgent,
        Map<String, Integer> lobbyNumbers,
        int nextLobbyNo,
        OffsetDateTime lastReceivedAt,
        boolean everReceived) {

    public LiveState {
        sessions = Map.copyOf(sessions);
        lastEventByAgent = Map.copyOf(lastEventByAgent);
        lobbyNumbers = Map.copyOf(lobbyNumbers);
    }

    /** 기동 직후(시드 전) 빈 상태. */
    public static LiveState empty() {
        return new LiveState(Map.of(), Map.of(), Map.of(), 1, null, false);
    }
}
