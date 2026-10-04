package studio.aoji.live;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * api-spec {@code Live}. {@link LiveStateService#live()}가 호출 시점의 {@link LiveState}와 registry로
 * 조립한다(ADR-09, 구성 파일이 바뀌면 다시 계산됨).
 *
 * @param agents key = 정상 정의 파일 name. 이벤트 없는 에이전트도 포함(status idle)
 * @param lobby {@code [세션 N]` 항목 먼저(N 오름차순), 그다음 워크플로우 밖 에이전트 name 오름차순
 */
public record Live(
        OffsetDateTime lastReceivedAt,
        boolean everReceived,
        Map<String, AgentLive> agents,
        List<LobbyEntry> lobby,
        List<UndefinedSubagent> undefinedSubagents) {

    public Live {
        agents = Map.copyOf(agents);
        lobby = List.copyOf(lobby);
        undefinedSubagents = List.copyOf(undefinedSubagents);
    }
}
