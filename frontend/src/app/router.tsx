import { createBrowserRouter, Navigate } from "react-router-dom";
import { App } from "./App";
import { HomeScreen } from "../screens/home/HomeScreen";
import { WorkflowsScreen } from "../screens/workflows/WorkflowsScreen";
import { WorkflowsHeader } from "../screens/workflows/WorkflowsHeader";
import { WorkflowDetailScreen } from "../screens/workflow-detail/WorkflowDetailScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { SIDEBAR_TAB_HOME, SIDEBAR_TAB_SETTINGS, SIDEBAR_TAB_WORKFLOWS } from "../lib/text";

// ui-spec.md §공통: 라우트 4개. 알 수 없는 경로 → `/`로 이동.
// `handle.breadcrumb`은 App.tsx가 TopBar에 넘긴다. `handle.rightExtra`는 TopBar 오른쪽 추가 버튼
// (02는 "Claude 열기 · 기본 세션", ui-spec.md §공통 TopBar).
export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: "/", element: <HomeScreen />, handle: { breadcrumb: SIDEBAR_TAB_HOME } },
      {
        path: "/workflows",
        element: <WorkflowsScreen />,
        handle: { breadcrumb: SIDEBAR_TAB_WORKFLOWS, rightExtra: () => <WorkflowsHeader /> },
      },
      {
        path: "/workflows/:name",
        element: <WorkflowDetailScreen />,
        handle: { breadcrumb: (params: Readonly<Record<string, string | undefined>>) => params.name ?? "" },
      },
      { path: "/settings", element: <SettingsScreen />, handle: { breadcrumb: SIDEBAR_TAB_SETTINGS } },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
