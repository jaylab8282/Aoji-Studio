/**
 * ui-spec.md §공통 AppShell 왼쪽 사이드바(248px): 탭 3개 + 하단 CollectorStatus.
 * 선택 탭 = `bg-selected` + 왼쪽 초록 바.
 */
import { NavLink } from "react-router-dom";
import { CollectorStatus } from "./CollectorStatus";
import { SIDEBAR_TAB_HOME, SIDEBAR_TAB_SETTINGS, SIDEBAR_TAB_WORKFLOWS } from "../../lib/text";

const TABS: Array<{ to: string; label: string; end: boolean }> = [
  { to: "/", label: SIDEBAR_TAB_HOME, end: true },
  { to: "/workflows", label: SIDEBAR_TAB_WORKFLOWS, end: false },
  { to: "/settings", label: SIDEBAR_TAB_SETTINGS, end: true },
];

export function Sidebar() {
  return (
    <aside className="w-sidebar shrink-0 bg-chrome border-r border-border flex flex-col justify-between">
      <nav className="flex flex-col py-4">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `border-l-2 px-4 py-3 text-body ${
                isActive
                  ? "border-running bg-selected text-text"
                  : "border-transparent text-text-secondary"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <CollectorStatus />
    </aside>
  );
}
