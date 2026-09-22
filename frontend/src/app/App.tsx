import { Outlet, useMatches, useParams } from "react-router-dom";
import { AppShell } from "../components/common/AppShell";

type BreadcrumbHandle = {
  breadcrumb?: string | ((params: Readonly<Record<string, string | undefined>>) => string);
};

// AppShell(사이드바·상단바)·04-3 배너·SSE 연결은 T-013에서 채운다.
// 브레드크럼은 각 라우트의 `handle.breadcrumb`에서 가져온다(ui-spec.md §공통 TopBar).
export function App() {
  const matches = useMatches();
  const params = useParams();
  const current = matches.at(-1);
  const handle = current?.handle as BreadcrumbHandle | undefined;
  const breadcrumb =
    typeof handle?.breadcrumb === "function" ? handle.breadcrumb(params) : (handle?.breadcrumb ?? "");

  return (
    <AppShell breadcrumb={breadcrumb}>
      <Outlet />
    </AppShell>
  );
}
