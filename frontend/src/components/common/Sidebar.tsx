/**
 * ui-spec.md §공통 `Sidebar`(`data-wf="NAV"`)·SCR-00. 가로형 232px(로고 lockup + 태그라인, 메뉴 아이콘 + 글자),
 * `rail:`(세로형·폭 1199 이하) 64px 레일(로고 심볼만, 메뉴 44×40 아이콘 + 툴팁 + `aria-label`).
 * 배치 전환은 CSS `rail:`만 쓴다(ADR-66) — 두 형태의 요소가 모두 DOM에 있고 CSS가 보이는 쪽을 고른다.
 * 현재 메뉴 = `bg-selected` + `text-text` 600 + 아이콘 `text-link` + 왼쪽 2px `brand-blue` 막대 + `aria-current="page"`
 * (`/workflows*`는 03까지 `에이전트 워크플로우`가 현재).
 * 비선택 메뉴의 hover·`:focus-visible`은 `bg-soft` + `text-text`다(ADR-46 A): 선택 표시에 `bg-selected`를 쓰므로
 * hover에 같은 값을 쓰면 선택과 구분되지 않는다. 선택 메뉴에는 hover 표현이 없다.
 * 로고는 `public/`의 파일을 그대로 쓴다(conventions.md §3): 심볼 31×28 `alt="Aoji Studio"` + 워드마크 120×23 `alt=""`.
 */
import { NavLink } from "react-router-dom";
import { CollectorStatus } from "./CollectorStatus";
import { Icon, type IconName } from "../ui/Icon";
import {
  APP_TAGLINE,
  APP_WORDMARK,
  SIDEBAR_LABEL,
  SIDEBAR_TAB_HOME,
  SIDEBAR_TAB_SETTINGS,
  SIDEBAR_TAB_WORKFLOWS,
} from "../../lib/text";

const TABS: Array<{ to: string; label: string; icon: IconName; end: boolean }> = [
  { to: "/", label: SIDEBAR_TAB_HOME, icon: "house", end: true },
  { to: "/workflows", label: SIDEBAR_TAB_WORKFLOWS, icon: "building", end: false },
  { to: "/settings", label: SIDEBAR_TAB_SETTINGS, icon: "settings", end: true },
];

const NAV_BASE =
  "rail-tip flex min-h-control items-center gap-3 rounded-control px-3 transition-colors duration-120 ease-standard rail:min-h-rail-item-h rail:w-rail-item-w rail:justify-center rail:p-0";

export function Sidebar() {
  return (
    <aside
      aria-label={SIDEBAR_LABEL}
      data-wf="NAV"
      className="relative flex min-h-0 flex-col gap-1 border-r border-border bg-chrome px-3 py-4 rail:items-center rail:px-2.5"
    >
      <div data-wf="NAV-1" className="mb-6 grid gap-1.5 pt-0.5 rail:justify-items-center rail:p-0">
        <div className="flex h-logo items-center gap-2.5">
          <img
            src="/logo-symbol.png"
            srcSet="/logo-symbol@2x.png 2x"
            width={31}
            height={28}
            alt={APP_WORDMARK}
            className="block h-logo w-auto"
          />
          <img
            src="/logo-wordmark.png"
            srcSet="/logo-wordmark@2x.png 2x"
            width={120}
            height={23}
            alt=""
            className="block rail:hidden"
          />
        </div>
        <p className="font-mono text-min leading-snug tracking-tagline whitespace-nowrap text-text-muted rail:hidden">
          {APP_TAGLINE}
        </p>
      </div>
      <nav data-wf="NAV-2" className="grid gap-1 rail:justify-items-center">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            aria-label={tab.label}
            title={tab.label}
            data-tip={tab.label}
            className={({ isActive }) =>
              `${NAV_BASE} ${
                isActive
                  ? "bg-selected font-semibold text-text"
                  : "text-text-secondary hover:bg-soft hover:text-text focus-visible:bg-soft focus-visible:text-text"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <span
                    aria-hidden="true"
                    data-testid="nav-current-bar"
                    className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-dot bg-brand-blue rail:-left-2.5"
                  />
                ) : null}
                <Icon name={tab.icon} size="md" className={isActive ? "text-link" : undefined} />
                <span className="rail:hidden">{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <CollectorStatus />
    </aside>
  );
}
