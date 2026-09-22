/**
 * ui-spec.md SCR-01 홈. 구성 순서(ui-rules 7): 제목 → KPI 4개 → 상태 막대 → 대표 워크플로우 3개 → 실시간 이벤트 표.
 * `AppShell`이 `snapshotStore.ready`가 될 때까지 스켈레톤을 그리므로 이 화면은 항상 값이 준비된 뒤에만 렌더된다.
 */
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { useSnapshotStore } from "../../state/snapshotStore";
import { EventsTable } from "./EventsTable";
import { FeaturedWorkflows } from "./FeaturedWorkflows";
import { KpiSection } from "./KpiSection";
import { StatusBar } from "./StatusBar";
import { HOME_SUBTITLE, HOME_TITLE, OPEN_WORKFLOWS_BUTTON_LABEL } from "../../lib/text";

export function HomeScreen() {
  const navigate = useNavigate();
  const { config, registry, live, recentEvents } = useSnapshotStore();
  // AppShell은 `snapshotStore.ready`가 true일 때만 이 화면을 그리고(FR-005-AC9),
  // `replace()`가 config·registry·live를 항상 함께 채우므로 이 시점엔 셋 다 non-null이다.
  if (config === null || registry === null || live === null) return null;

  return (
    <main className="flex flex-col gap-6 px-page-x py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-title font-bold text-text">{HOME_TITLE}</h1>
          <p className="mt-1 text-body text-text-secondary">{HOME_SUBTITLE}</p>
        </div>
        <Button variant="primary" onClick={() => navigate("/workflows")}>
          {OPEN_WORKFLOWS_BUTTON_LABEL}
        </Button>
      </div>

      <KpiSection registry={registry} live={live} hostPath={config.hostPath} />

      {registry.agentsDirMissing ? null : <StatusBar registry={registry} live={live} />}

      <FeaturedWorkflows registry={registry} live={live} />

      <EventsTable live={live} recentEvents={recentEvents} />
    </main>
  );
}
