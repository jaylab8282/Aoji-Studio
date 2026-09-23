import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { HomeScreen } from "../screens/home/HomeScreen";
import { WorkflowsScreen } from "../screens/workflows/WorkflowsScreen";
import { WorkflowDetailScreen } from "../screens/workflow-detail/WorkflowDetailScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { snapshotStore } from "../state/snapshotStore";
import { buildSnapshotFixture } from "../test/fixtures/snapshot";

// 실제 router.tsx와 같은 라우트 구성. 메모리 히스토리로 경로만 테스트.
function buildRouter(initialPath: string) {
  return createMemoryRouter(
    [
      {
        element: <App />,
        children: [
          { path: "/", element: <HomeScreen />, handle: { breadcrumb: "홈" } },
          { path: "/workflows", element: <WorkflowsScreen />, handle: { breadcrumb: "에이전트 워크플로우" } },
          {
            path: "/workflows/:name",
            element: <WorkflowDetailScreen />,
            handle: { breadcrumb: (params: Readonly<Record<string, string | undefined>>) => params.name ?? "" },
          },
          { path: "/settings", element: <SettingsScreen />, handle: { breadcrumb: "설정" } },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
}

describe("router", () => {
  // AppShell은 T-013부터 snapshotStore.ready가 true일 때만 본문(Outlet)을 그린다(FR-005-AC9).
  beforeEach(() => {
    snapshotStore.replace(buildSnapshotFixture());
  });

  afterEach(() => {
    snapshotStore.reset();
  });

  it("[T-001] / 경로 → 홈 화면 렌더", () => {
    render(<RouterProvider router={buildRouter("/")} />);
    expect(screen.getByRole("heading", { name: "에이전트 관제" })).toBeInTheDocument();
  });

  it("[T-001] /workflows 경로 → 에이전트 워크플로우 화면 렌더", () => {
    // T-015부터 02는 TopBar 브레드크럼("에이전트 워크플로우")만 제목이고 본문에 별도 h1이 없다
    // (ui-spec.md SCR-02, ui-rules.md 7). 로비 카드 제목으로 올바른 화면이 렌더됐는지 확인한다.
    render(<RouterProvider router={buildRouter("/workflows")} />);
    expect(screen.getByRole("heading", { name: "로비 · 메인 세션" })).toBeInTheDocument();
  });

  it("[T-001] /workflows/:name 경로 → 워크플로우 이름 렌더", () => {
    // T-016부터 03은 registry에 있는 워크플로우만 헤더를 그린다(없으면 FR-007-E2 안내).
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: {
        ...fixture.registry,
        workflows: [
          {
            name: "개발부서",
            description: "",
            filePath: ".jaystudio/teams/dev.json",
            lead: null,
            members: [],
            brokenRefs: [],
            rawMemberCount: 0,
          },
        ],
      },
    });
    render(<RouterProvider router={buildRouter("/workflows/개발부서")} />);
    expect(screen.getByRole("heading", { name: "개발부서" })).toBeInTheDocument();
  });

  it("[T-001] /settings 경로 → 설정 화면 렌더", () => {
    render(<RouterProvider router={buildRouter("/settings")} />);
    expect(screen.getByRole("heading", { name: "설정" })).toBeInTheDocument();
  });
});
