/**
 * ui-spec.md SCR-03 워크플로우 상세 · 픽셀 오피스 (`/workflows/:name`).
 * 구성(ui-rules.md 7): 헤더 → 왼쪽 오피스(3열, 04-4 배너는 카드 위) + 오른쪽 360px 패널.
 * FR-007, FR-011-AC5, FR-012-AC6, FR-013-AC4, FR-017-AC4.
 *
 * `AppShell`이 첫 스냅샷 전 스켈레톤을 그리므로 이 화면은 config·registry·live가 준비된 뒤에만 렌더된다
 * (01·02와 같은 패턴). 선택 에이전트는 URL `?agent=`에 둬서 새로고침·E2E로 재현할 수 있게 한다.
 */
import { useParams, useSearchParams } from "react-router-dom";
import { isCollectorDown } from "../../lib/derive/collectorDown";
import { officeSeats, seatAgentNames } from "../../lib/derive/officeSeats";
import { selectedAgentName } from "../../lib/derive/selectedAgent";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import { useSnapshotStore } from "../../state/snapshotStore";
import { Header } from "./Header";
import { Office } from "./Office";
import { Panel } from "./Panel";
import { WorkflowNotFound } from "./WorkflowNotFound";

export function WorkflowDetailScreen() {
  const { name } = useParams<{ name: string }>();
  const [searchParams] = useSearchParams();
  // `?agent=`만 바꾸고 나머지 쿼리는 보존한다(`?dialog=` 라우팅과 같은 유틸, ADR-14).
  const setQuery = useDialogNavigate();
  const { config, registry, live } = useSnapshotStore();

  if (config === null || registry === null || live === null) return null;

  const workflow = registry.workflows.find((candidate) => candidate.name === name);
  if (workflow === undefined) {
    return (
      <main className="px-page-x pt-6 pb-7">
        <WorkflowNotFound />
      </main>
    );
  }

  const collectorDown = isCollectorDown({
    everReceived: live.everReceived,
    hookConfigured: registry.hookConfigured,
  });
  const seats = officeSeats({
    lead: workflow.lead,
    members: workflow.members,
    undefinedSubagents: live.undefinedSubagents,
  });
  const selectedName = selectedAgentName({
    agentParam: searchParams.get("agent"),
    lead: workflow.lead,
    seatAgentNames: seatAgentNames(seats),
  });

  return (
    <main className="flex h-body-viewport flex-col px-page-x pt-6 pb-7">
      <Header
        workflow={workflow}
        skillCount={registry.skillCount}
        liveAgents={live.agents}
        registryAgents={registry.agents}
        hostPath={config.hostPath}
      />
      <div className="flex min-h-0 flex-1 gap-4">
        <Office
          workflow={workflow}
          live={live}
          collectorDown={collectorDown}
          selectedName={selectedName}
          onSelect={(agent) => setQuery({ agent })}
        />
        <Panel
          selectedName={selectedName}
          registry={registry}
          live={live}
          hostPath={config.hostPath}
          lead={workflow.lead}
          collectorDown={collectorDown}
        />
      </div>
    </main>
  );
}
