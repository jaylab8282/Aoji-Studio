/**
 * ui-spec.md §공통 AppShell 왼쪽 사이드바(248px): 로고·워드마크 + 탭 3개 + 하단 CollectorStatus.
 * 선택 탭 = `bg-selected` + 왼쪽 초록 바(둥근 카드, 사이드바 안쪽 여백을 둔다).
 * 비선택 탭의 hover·`:focus-visible`은 `bg-soft` + `text-text`다(ADR-46 A): 선택 표시에 `bg-selected`를
 * 쓰는 요소이므로 hover에 같은 값을 쓰면 선택과 구분되지 않는다. 선택 탭에는 hover 표현이 없다.
 * 로고·워드마크는 `docs/ui/screens/01-home.png` 좌상단 기준(리뷰 Major, T-014 round 2).
 */
import { NavLink } from "react-router-dom";
import { CollectorStatus } from "./CollectorStatus";
import { APP_WORDMARK, SIDEBAR_TAB_HOME, SIDEBAR_TAB_SETTINGS, SIDEBAR_TAB_WORKFLOWS } from "../../lib/text";

const TABS: Array<{ to: string; label: string; end: boolean }> = [
  { to: "/", label: SIDEBAR_TAB_HOME, end: true },
  { to: "/workflows", label: SIDEBAR_TAB_WORKFLOWS, end: false },
  { to: "/settings", label: SIDEBAR_TAB_SETTINGS, end: true },
];

export function Sidebar() {
  return (
    <aside className="w-sidebar shrink-0 bg-chrome border-r border-border flex flex-col justify-between">
      <div>
        <div className="h-header flex items-center gap-2.5 px-4">
          <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded-control bg-running" />
          <span className="text-section font-bold text-text">{APP_WORDMARK}</span>
        </div>
        <nav className="flex flex-col gap-1 px-3 py-2">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `rounded-control border-l-4 px-3 py-2.5 text-body ${
                  isActive
                    ? "border-running bg-selected text-text"
                    : "border-transparent text-text-secondary hover:bg-soft hover:text-text focus-visible:bg-soft focus-visible:text-text"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <CollectorStatus />
    </aside>
  );
}
