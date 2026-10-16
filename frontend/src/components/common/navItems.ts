/**
 * 사이드 탭 메뉴 배열 (ui-spec.md §공통 `Sidebar`·SCR-00, ADR-88 결정 1). 가로형과 `rail:` 레일이 이 배열 하나로 그려진다.
 * 최종 6개: `홈`/`에이전트 워크플로우`/`스킬`/`MCP`/`비용`/`설정` (라우트 `/`·`/workflows`·`/skills`·`/mcp`·`/cost`·`/settings`).
 * 항목은 그 화면을 구현하는 태스크가 화면과 함께 이 배열에 더한다 — 빈 화면으로 가는 메뉴, 눌러도 아무 일 없는 메뉴를
 * 먼저 만들지 않는다(conventions.md §3 미구현 stub 금지). 스킬(T-R4-15)·MCP(T-R4-17)·비용(T-R4-18)이 아직 없다.
 */
import type { IconName } from "../ui/Icon";
import { SIDEBAR_TAB_HOME, SIDEBAR_TAB_SETTINGS, SIDEBAR_TAB_WORKFLOWS } from "../../lib/text";

export interface NavItem {
  /** 라우트 경로. 실제 라우트가 있어야 한다(`routes`에 없는 경로 금지). */
  to: string;
  label: string;
  icon: IconName;
  /** `true`면 정확히 일치할 때만 현재 메뉴(`/`, `/settings`). `false`면 하위 경로(03)도 현재. */
  end: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: SIDEBAR_TAB_HOME, icon: "house", end: true },
  { to: "/workflows", label: SIDEBAR_TAB_WORKFLOWS, icon: "building", end: false },
  { to: "/settings", label: SIDEBAR_TAB_SETTINGS, icon: "settings", end: true },
];
