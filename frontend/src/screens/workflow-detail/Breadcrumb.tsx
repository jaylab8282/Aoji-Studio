/**
 * ui-spec.md SCR-03 첫 행: 브레드크럼 `홈 / 에이전트 워크플로우 / [이름]`.
 * `홈` → `/`, `에이전트 워크플로우` → `/workflows`. `TopBar`의 breadcrumb 자리에 들어간다.
 */
import { Link } from "react-router-dom";
import { BREADCRUMB_SEPARATOR, SIDEBAR_TAB_HOME, SIDEBAR_TAB_WORKFLOWS } from "../../lib/text";

export function WorkflowBreadcrumb({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2">
      <Link to="/" className="text-text-secondary">
        {SIDEBAR_TAB_HOME}
      </Link>
      <span className="text-text-faint">{BREADCRUMB_SEPARATOR}</span>
      <Link to="/workflows" className="text-text-secondary">
        {SIDEBAR_TAB_WORKFLOWS}
      </Link>
      <span className="text-text-faint">{BREADCRUMB_SEPARATOR}</span>
      <span className="text-text">{name}</span>
    </span>
  );
}
