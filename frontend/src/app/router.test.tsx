import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { HomeScreen } from "../screens/home/HomeScreen";
import { WorkflowsScreen } from "../screens/workflows/WorkflowsScreen";
import { WorkflowDetailScreen } from "../screens/workflow-detail/WorkflowDetailScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";

// 실제 router.tsx와 같은 라우트 구성. 메모리 히스토리로 경로만 테스트.
function buildRouter(initialPath: string) {
  return createMemoryRouter(
    [
      {
        element: <App />,
        children: [
          { path: "/", element: <HomeScreen /> },
          { path: "/workflows", element: <WorkflowsScreen /> },
          { path: "/workflows/:name", element: <WorkflowDetailScreen /> },
          { path: "/settings", element: <SettingsScreen /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
}

describe("router", () => {
  it("[T-001] / 경로 → 홈 화면 렌더", () => {
    render(<RouterProvider router={buildRouter("/")} />);
    expect(screen.getByRole("heading", { name: "에이전트 관제" })).toBeInTheDocument();
  });

  it("[T-001] /workflows 경로 → 에이전트 워크플로우 화면 렌더", () => {
    render(<RouterProvider router={buildRouter("/workflows")} />);
    expect(screen.getByRole("heading", { name: "에이전트 워크플로우" })).toBeInTheDocument();
  });

  it("[T-001] /workflows/:name 경로 → 워크플로우 이름 렌더", () => {
    render(<RouterProvider router={buildRouter("/workflows/개발부서")} />);
    expect(screen.getByRole("heading", { name: "개발부서" })).toBeInTheDocument();
  });

  it("[T-001] /settings 경로 → 설정 화면 렌더", () => {
    render(<RouterProvider router={buildRouter("/settings")} />);
    expect(screen.getByRole("heading", { name: "설정" })).toBeInTheDocument();
  });
});
