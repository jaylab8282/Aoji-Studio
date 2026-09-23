import { useCallback } from "react";
import { createBrowserRouter, Navigate, useSearchParams, type RouteObject } from "react-router-dom";
import { App } from "./App";
import { HomeScreen } from "../screens/home/HomeScreen";
import { WorkflowsScreen } from "../screens/workflows/WorkflowsScreen";
import { WorkflowsHeader } from "../screens/workflows/WorkflowsHeader";
import { WorkflowDetailScreen } from "../screens/workflow-detail/WorkflowDetailScreen";
import { WorkflowBreadcrumb } from "../screens/workflow-detail/Breadcrumb";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { SIDEBAR_TAB_HOME, SIDEBAR_TAB_SETTINGS, SIDEBAR_TAB_WORKFLOWS } from "../lib/text";

// ui-spec.md §공통: 라우트 4개. 알 수 없는 경로 → `/`로 이동.
// `handle.breadcrumb`은 App.tsx가 TopBar에 넘긴다. `handle.rightExtra`는 TopBar 오른쪽 추가 버튼
// (02는 "Claude 열기 · 기본 세션", ui-spec.md §공통 TopBar).
// `handle.showProjectChip`은 프로젝트 칩 표시 여부로, 01·02만 true다(ADR-30). 03·07에는 칩을 두지 않는다.
export const routes: RouteObject[] = [
  {
    element: <App />,
    children: [
      { path: "/", element: <HomeScreen />, handle: { breadcrumb: SIDEBAR_TAB_HOME, showProjectChip: true } },
      {
        path: "/workflows",
        element: <WorkflowsScreen />,
        handle: {
          breadcrumb: SIDEBAR_TAB_WORKFLOWS,
          rightExtra: () => <WorkflowsHeader />,
          showProjectChip: true,
        },
      },
      {
        path: "/workflows/:name",
        element: <WorkflowDetailScreen />,
        handle: {
          breadcrumb: (params: Readonly<Record<string, string | undefined>>) => (
            <WorkflowBreadcrumb name={params.name ?? ""} />
          ),
        },
      },
      { path: "/settings", element: <SettingsScreen />, handle: { breadcrumb: SIDEBAR_TAB_SETTINGS } },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

// ADR-14 / ui-spec.md §공통: 05·06 팝업은 라우트가 아니라 `?dialog=` search param이다.
// 여는 쪽은 `lib/dialogNavigate.ts`의 `useDialogNavigate()`, 읽고 닫는 쪽은 이 훅을 쓴다.
export interface DialogRoute {
  /** `?dialog=` 값. 팝업이 없으면 null */
  name: string | null;
  /** `?workflow=` 값(팝업 대상 워크플로우). 없으면 null */
  workflow: string | null;
  /** 팝업을 닫는다: `?dialog`·`?workflow`만 지우고 나머지 쿼리(03의 `?agent=` 등)는 보존한다. */
  close: () => void;
}

export function useDialog(): DialogRoute {
  const [searchParams, setSearchParams] = useSearchParams();

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("dialog");
    next.delete("workflow");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return {
    name: searchParams.get("dialog"),
    workflow: searchParams.get("workflow"),
    close,
  };
}
