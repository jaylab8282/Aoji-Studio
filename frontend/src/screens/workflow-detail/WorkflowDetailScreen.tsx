/**
 * ui-spec.md SCR-03 워크플로우 상세 · 픽셀 오피스 (`/workflows/:name`) + SCR-04-4(수집 중단 띠) + 04-2(첫 로딩).
 * 구성: 상단 바(브레드크럼, 셸) → [04-4 띠] → 본문(안 여백 16 / `gutter` / 아래 24, 간격 16): 헤더 줄 → `[오피스 | 패널]`(간격 16).
 * 가로형은 오피스 그리드만·패널 최근 이벤트만 안에서 스크롤하고, 세로형은 패널이 오피스 바로 아래 전체 폭이며 본문이 스크롤한다(ADR-66).
 * FR-007, FR-011-AC5, FR-012-AC6, FR-013-AC4, FR-017-AC4.
 *
 * 화면 자체 `<main>`을 두지 않는다(`<main>`은 `AppShell` 하나, D-125). 제목 `<h1>`은 헤더의 워크플로우 이름 하나다.
 * 첫 `snapshot` 전(`ready === false`)에는 이 화면이 직접 스켈레톤을 그린다(04-2) — 라우트 `handle.ownLoading`.
 * 선택 에이전트는 URL `?agent=`에 둬서 새로고침·E2E로 재현할 수 있게 한다.
 */
import type { ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { isCollectorDown } from "../../lib/derive/collectorDown";
import { agentSeats, seatAgentNames } from "../../lib/derive/officeSeats";
import { selectedAgentName } from "../../lib/derive/selectedAgent";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import { useSnapshotStore } from "../../state/snapshotStore";
import { CollectorDown } from "./CollectorDown";
import { Header, HeaderSkeleton } from "./Header";
import { Office, OfficeSkeleton } from "./Office";
import { Panel, PanelSkeleton } from "./Panel";
import { WorkflowNotFound } from "./WorkflowNotFound";

/** 띠(고정) + 본문. 세로형은 띠 아래 본문만 스크롤한다. */
function DetailFrame({ banner = null, children }: { banner?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {banner}
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-gutter pt-4 pb-6 portrait:overflow-y-auto">{children}</div>
    </div>
  );
}

/** `[오피스 | 패널]`: 가로형 2열(패널 `w-panel`), 세로형 1열(패널이 오피스 아래). */
function DetailBody({ children }: { children: ReactNode }) {
  return (
    <div className="detail-body">
      {children}
    </div>
  );
}

export function WorkflowDetailScreen() {
  const { name = "" } = useParams<{ name: string }>();
  const [searchParams] = useSearchParams();
  // `?agent=`만 바꾸고 나머지 쿼리는 보존한다(`?dialog=` 라우팅과 같은 유틸, ADR-14).
  const setQuery = useDialogNavigate();
  const { ready, config, registry, live } = useSnapshotStore();

  if (!ready || config === null || registry === null || live === null) {
    return (
      <DetailFrame>
        <HeaderSkeleton name={name} />
        <DetailBody>
          <OfficeSkeleton />
          <PanelSkeleton />
        </DetailBody>
      </DetailFrame>
    );
  }

  const workflow = registry.workflows.find((candidate) => candidate.name === name);
  if (workflow === undefined) {
    return (
      <DetailFrame>
        <WorkflowNotFound />
      </DetailFrame>
    );
  }

  const collectorDown = isCollectorDown({
    everReceived: live.everReceived,
    hookConfigured: registry.hookConfigured,
  });
  const selectedName = selectedAgentName({
    agentParam: searchParams.get("agent"),
    lead: workflow.lead,
    seatAgentNames: seatAgentNames(
      agentSeats({ lead: workflow.lead, members: workflow.members, undefinedSubagents: live.undefinedSubagents }),
    ),
  });

  return (
    <DetailFrame banner={collectorDown ? <CollectorDown lastReceivedAt={live.lastReceivedAt} /> : null}>
      <Header
        workflow={workflow}
        skillCount={registry.skillCount}
        liveAgents={live.agents}
        registryAgents={registry.agents}
        defaultSessionCommand={config.defaultSessionCommand}
        collectorDown={collectorDown}
      />
      <DetailBody>
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
          lead={workflow.lead}
          collectorDown={collectorDown}
        />
      </DetailBody>
    </DetailFrame>
  );
}
