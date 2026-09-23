import type { ReactNode } from "react";
import { Outlet, useMatches, useParams } from "react-router-dom";
import { AppShell } from "../components/common/AppShell";
import { DialogHost } from "../dialogs/DialogHost";

type RouteHandle = {
  /** 03은 `홈 / 에이전트 워크플로우 / [이름]` 링크 브레드크럼이라 ReactNode도 받는다(ui-spec.md SCR-03). */
  breadcrumb?: ReactNode | ((params: Readonly<Record<string, string | undefined>>) => ReactNode);
  /** TopBar 오른쪽 추가 버튼(예: 02 "Claude 열기 · 기본 세션", ui-spec.md §공통 TopBar). */
  rightExtra?: () => ReactNode;
  /** TopBar 프로젝트 칩 표시 여부. 01·02만 true(ADR-30). TopBar는 라우트를 직접 읽지 않는다. */
  showProjectChip?: boolean;
};

// AppShell(사이드바·상단바)·04-3 배너·SSE 연결은 T-013에서 채운다.
// 브레드크럼·오른쪽 추가 버튼·프로젝트 칩 표시 여부는 각 라우트의 `handle`에서 가져온다.
// 05·06 팝업은 라우트가 아니라 `?dialog=`이므로 `DialogHost`를 여기 한 곳에서만 그린다(ADR-14).
export function App() {
  const matches = useMatches();
  const params = useParams();
  const current = matches.at(-1);
  const handle = current?.handle as RouteHandle | undefined;
  const breadcrumb =
    typeof handle?.breadcrumb === "function" ? handle.breadcrumb(params) : (handle?.breadcrumb ?? "");
  const rightExtra = handle?.rightExtra?.();

  return (
    <>
      <AppShell breadcrumb={breadcrumb} rightExtra={rightExtra} showProjectChip={handle?.showProjectChip === true}>
        <Outlet />
      </AppShell>
      <DialogHost />
    </>
  );
}
