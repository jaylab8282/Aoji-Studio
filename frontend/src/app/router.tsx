import { createBrowserRouter, Navigate } from "react-router-dom";
import { App } from "./App";
import { HomeScreen } from "../screens/home/HomeScreen";
import { WorkflowsScreen } from "../screens/workflows/WorkflowsScreen";
import { WorkflowDetailScreen } from "../screens/workflow-detail/WorkflowDetailScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";

// ui-spec.md §공통: 라우트 4개. 알 수 없는 경로 → `/`로 이동.
export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: "/", element: <HomeScreen /> },
      { path: "/workflows", element: <WorkflowsScreen /> },
      { path: "/workflows/:name", element: <WorkflowDetailScreen /> },
      { path: "/settings", element: <SettingsScreen /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
