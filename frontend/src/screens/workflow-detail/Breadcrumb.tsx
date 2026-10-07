/**
 * ui-spec.md SCR-03 상단 바 브레드크럼 (`03-1`): `홈 / 에이전트 워크플로우 / [이름]`. `TopBar`의 breadcrumb 자리에 들어간다.
 * `홈` → `/`, `에이전트 워크플로우` → `/workflows` (링크 `text-link`, 높이 34, hover·초점 밑줄 — ADR-49 ④·ADR-69).
 * 구분자(`aria-hidden`)와 마지막 현재 위치 이름(700, `text-text`, `aria-current="page"`)에는 이동 동작이 없어 hover·focus 표현이 없다.
 */
import { Link } from "react-router-dom";
import { BREADCRUMB_SEPARATOR, SIDEBAR_TAB_HOME, SIDEBAR_TAB_WORKFLOWS } from "../../lib/text";

export function WorkflowBreadcrumb({ name }: { name: string }) {
  return (
    <nav aria-label="위치" className="flex min-w-0 items-center gap-2 whitespace-nowrap text-text-muted">
      <Link to="/" className="inline-flex min-h-control items-center text-link hover:underline focus-visible:underline">
        {SIDEBAR_TAB_HOME}
      </Link>
      <span aria-hidden="true">{BREADCRUMB_SEPARATOR}</span>
      <Link to="/workflows" className="inline-flex min-h-control items-center text-link hover:underline focus-visible:underline">
        {SIDEBAR_TAB_WORKFLOWS}
      </Link>
      <span aria-hidden="true">{BREADCRUMB_SEPARATOR}</span>
      <b aria-current="page" className="font-bold text-text">
        {name}
      </b>
    </nav>
  );
}
