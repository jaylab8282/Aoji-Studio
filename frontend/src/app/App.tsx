import type { ReactNode } from "react";
import { Outlet, useMatches, useParams } from "react-router-dom";
import { AppShell } from "../components/common/AppShell";

type RouteHandle = {
  breadcrumb?: string | ((params: Readonly<Record<string, string | undefined>>) => string);
  /** TopBar 오른쪽 추가 버튼(예: 02 "Claude 열기 · 기본 세션", ui-spec.md §공통 TopBar). */
  rightExtra?: () => ReactNode;
};

// AppShell(사이드바·상단바)·04-3 배너·SSE 연결은 T-013에서 채운다.
// 브레드크럼·오른쪽 추가 버튼은 각 라우트의 `handle.breadcrumb`·`handle.rightExtra`에서 가져온다.
export function App() {
  const matches = useMatches();
  const params = useParams();
  const current = matches.at(-1);
  const handle = current?.handle as RouteHandle | undefined;
  const breadcrumb =
    typeof handle?.breadcrumb === "function" ? handle.breadcrumb(params) : (handle?.breadcrumb ?? "");
  const rightExtra = handle?.rightExtra?.();

  return (
    <AppShell breadcrumb={breadcrumb} rightExtra={rightExtra}>
      <Outlet />
    </AppShell>
  );
}
