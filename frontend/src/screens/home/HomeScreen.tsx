/**
 * ui-spec.md SCR-01 홈 + 04-1·04-2·04-5(01)·04-7(01). 구성 순서(ui-rules 7): 제목 줄(`01-2`) → KPI 4개(`01-3`) →
 * 상태 막대(`01-4`) → 대표 워크플로우 3개(`01-5`) → 실시간 이벤트(`01-6`, 남은 높이).
 * 화면 자체 `<main>`·`<h1>`을 두지 않는다: `<main>`은 `AppShell` 하나, 화면 제목 `<h1>`은 상단 바 하나(D-125).
 * 첫 `snapshot` 전(`ready === false`)에는 이 화면이 직접 스켈레톤을 그린다(04-2, FR-005-AC9) — 라우트 `handle.ownLoading`.
 * 정적 글자(제목·라벨·카드 제목·표 머리·각주)와 주 동작은 로딩 중에도 보인다.
 */
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { NoEventsYet } from "../../components/ui/NoEventsYet";
import { useSnapshotStore } from "../../state/snapshotStore";
import { EventsTable, EventsTableSkeleton } from "./EventsTable";
import { FeaturedWorkflows, FeaturedWorkflowsSkeleton } from "./FeaturedWorkflows";
import { KpiSection, KpiSectionSkeleton } from "./KpiSection";
import { StatusBar, StatusBarSkeleton } from "./StatusBar";
import { HOME_SUBTITLE, HOME_TITLE, OPEN_WORKFLOWS_BUTTON_LABEL } from "../../lib/text";

export function HomeScreen() {
  const navigate = useNavigate();
  const { ready, config, registry, live, recentEvents } = useSnapshotStore();
  // `replace()`가 config·registry·live를 항상 함께 채우므로 ready면 셋 다 non-null이다.
  const loaded = ready && config !== null && registry !== null && live !== null;

  return (
    <div
      data-testid={loaded ? "home" : "home-skeleton"}
      aria-busy={loaded ? undefined : true}
      className="flex h-full min-h-0 flex-col gap-4 px-gutter pt-6"
    >
      <section data-wf="01-2" className="flex flex-none items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-bold tracking-title text-text">{HOME_TITLE}</h2>
          <p className="mt-1 text-text-muted">{HOME_SUBTITLE}</p>
        </div>
        {/* 값을 쓰지 않는 주 동작이라 로딩 중에도 활성이다(ADR-44). */}
        <Button variant="primary" onClick={() => navigate("/workflows")}>
          {OPEN_WORKFLOWS_BUTTON_LABEL}
          <Icon name="arrow-right" />
        </Button>
      </section>

      {loaded ? (
        <>
          <KpiSection registry={registry} live={live} hostPath={config.hostPath} />
          {registry.agentsDirMissing ? null : <StatusBar registry={registry} live={live} />}
          <FeaturedWorkflows registry={registry} live={live} />
          {live.everReceived ? <EventsTable recentEvents={recentEvents} /> : <NoEventsYet />}
        </>
      ) : (
        <>
          <KpiSectionSkeleton />
          <StatusBarSkeleton />
          <FeaturedWorkflowsSkeleton />
          <EventsTableSkeleton />
        </>
      )}
    </div>
  );
}
