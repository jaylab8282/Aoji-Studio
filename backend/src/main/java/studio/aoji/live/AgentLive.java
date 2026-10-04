package studio.aoji.live;

import java.time.OffsetDateTime;
import studio.aoji.events.EventRowResponse;

/**
 * api-spec {@code AgentLive}. FR-004-AC3(우선순위)·AC4(agent_id 단위 합침)·FR-007-AC3(부모 라벨)·
 * FR-007-AC5(현재 도구·세션 시작·서브에이전트 수·작업 폴더)를 반영한 에이전트 하나의 표시 상태.
 *
 * @param currentTool 마지막 PreToolUse. idle이면 null(FR-007-AC5)
 * @param childCount 이 에이전트의 메인 레코드 session_id를 가진 서브 레코드 수
 * @param parentLabel 서브에이전트로 실행 중이면 부모 라벨. 아니면 null
 * @param lastEvent 이 에이전트의 마지막 이벤트(재시작 후 DB에서 복원, 01 카드 최근 활동용)
 */
public record AgentLive(
        String name,
        Status status,
        ToolRef currentTool,
        OffsetDateTime sessionStartedAt,
        int childCount,
        String cwd,
        String parentLabel,
        OffsetDateTime lastEventAt,
        EventRowResponse lastEvent) {
}
