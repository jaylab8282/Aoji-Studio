import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
import { NAV_ITEMS } from "./navItems";
import { routes } from "../../app/router";
import { snapshotStore } from "../../state/snapshotStore";
import { SIDEBAR_TAB_HOME, SIDEBAR_TAB_SETTINGS, SIDEBAR_TAB_WORKFLOWS } from "../../lib/text";

/**
 * 브라우저 기본 포커스 표시를 지우는 클래스(ADR-46 A 금지 대상).
 * 문자열을 조립해 Tailwind가 이 테스트 문구에서 죽은 유틸리티를 만들지 않게 한다.
 */
const OUTLINE_RESET_CLASSES = [
  `outline-${"none"}`,
  `focus:outline-${"none"}`,
  `focus-visible:outline-${"none"}`,
];

// ui-spec.md §공통 `Sidebar`·SCR-00 + "마우스 hover·키보드 `:focus-visible` 표현" 표 ②(ADR-46 A).
// 사이드 탭은 선택 표시에 `bg-selected`를 쓰므로 hover는 한 단계 아래인 `bg-soft`여야 한다
// (같은 값을 쓰면 hover와 선택이 구분되지 않는다 — A-22 핵심 제약).

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

function link(name: string): HTMLElement {
  return screen.getByRole("link", { name });
}

function classesOf(name: string): string[] {
  return link(name).className.split(/\s+/).filter(Boolean);
}

describe("Sidebar", () => {
  afterEach(() => {
    snapshotStore.reset();
  });

  it("[NFR-12] 구조: aside '주 메뉴'(NAV) · 로고 NAV-1 · 메뉴 NAV-2 · 수집 NAV-3·NAV-3R", () => {
    const { container } = renderAt("/");

    const side = screen.getByRole("complementary", { name: "주 메뉴" });
    expect(side).toHaveAttribute("data-wf", "NAV");
    for (const wf of ["NAV-1", "NAV-2", "NAV-3", "NAV-3R"]) {
      expect(container.querySelector(`[data-wf="${wf}"]`), wf).not.toBeNull();
    }
    expect(within(side).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/", "/workflows", "/settings"]);
  });

  it("[NFR-12] 로고: 심볼 31×28 alt='Aoji Studio' + 워드마크 120×23 alt='' (public 파일), 태그라인은 rail:에서 숨김", () => {
    const { container } = renderAt("/");

    const symbol = screen.getByRole("img", { name: "Aoji Studio" });
    expect(symbol).toHaveAttribute("src", "/logo-symbol.png");
    expect(symbol).toHaveAttribute("srcset", "/logo-symbol@2x.png 2x");
    expect(symbol).toHaveAttribute("width", "31");
    expect(symbol).toHaveAttribute("height", "28");
    const word = container.querySelector<HTMLImageElement>('img[src="/logo-wordmark.png"]')!;
    expect(word).toHaveAttribute("alt", "");
    expect(word).toHaveAttribute("srcset", "/logo-wordmark@2x.png 2x");
    expect(word).toHaveAttribute("width", "120");
    expect(word).toHaveAttribute("height", "23");
    expect(word).toHaveClass("rail:hidden");
    const tagline = screen.getByText("AI AGENT ORCHESTRATION PLATFORM");
    expect(tagline).toHaveClass("rail:hidden", "text-min", "tracking-tagline", "text-text-muted");
  });

  it("[NFR-12] 현재 메뉴 aria-current='page': / → 홈, /workflows → 에이전트 워크플로우, /settings → 설정", () => {
    for (const [path, current] of [
      ["/", SIDEBAR_TAB_HOME],
      ["/workflows", SIDEBAR_TAB_WORKFLOWS],
      ["/settings", SIDEBAR_TAB_SETTINGS],
    ] as const) {
      const { unmount } = renderAt(path);
      const currents = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
      expect(currents.map((a) => a.getAttribute("aria-label")), path).toEqual([current]);
      unmount();
    }
  });

  it("[NFR-12] 03(/workflows/개발부서)에서도 '에이전트 워크플로우'가 현재 메뉴다", () => {
    renderAt("/workflows/dev-dept");

    expect(link(SIDEBAR_TAB_WORKFLOWS)).toHaveAttribute("aria-current", "page");
    expect(link(SIDEBAR_TAB_HOME)).not.toHaveAttribute("aria-current");
    expect(link(SIDEBAR_TAB_SETTINGS)).not.toHaveAttribute("aria-current");
  });

  it("[NFR-12] 메뉴: aria-label·title·툴팁(data-tip) = 메뉴 이름, 글자는 rail:에서 숨고 아이콘은 aria-hidden", () => {
    renderAt("/");

    for (const [label, icon] of [
      [SIDEBAR_TAB_HOME, "house"],
      [SIDEBAR_TAB_WORKFLOWS, "building"],
      [SIDEBAR_TAB_SETTINGS, "settings"],
    ] as const) {
      const a = link(label);
      expect(a, label).toHaveAttribute("aria-label", label);
      expect(a, label).toHaveAttribute("title", label);
      expect(a.parentElement, label).toHaveAttribute("data-tip", label);
      expect(a.parentElement, label).toHaveClass("tooltip-rail");
      expect(a, label).toHaveClass("rail:w-rail-item-w", "rail:min-h-rail-item-h", "rail:justify-center");
      expect(within(a).getByText(label), icon).toHaveClass("rail:hidden");
      expect(a.querySelector("svg"), icon).toHaveAttribute("aria-hidden", "true");
      expect(a.querySelector("svg"), icon).toHaveAttribute("width", "18");
    }
  });

  it("[NFR-12] 현재 메뉴 표현: bg-selected + text-text 600 + 아이콘 text-link + 왼쪽 brand-blue 막대(비선택에는 없음)", () => {
    renderAt("/workflows");

    const current = link(SIDEBAR_TAB_WORKFLOWS);
    expect(current).toHaveClass("bg-selected", "text-text", "font-semibold");
    expect(current.querySelector("svg")).toHaveClass("text-link");
    expect(within(current).getByTestId("nav-current-bar")).toHaveClass("bg-brand-blue", "w-0.5");
    for (const label of [SIDEBAR_TAB_HOME, SIDEBAR_TAB_SETTINGS]) {
      expect(link(label).querySelector('[data-testid="nav-current-bar"]'), label).toBeNull();
      expect(link(label).querySelector("svg"), label).not.toHaveClass("text-link");
    }
  });

  it("[ADR-46 A] 비선택 탭 → hover:bg-soft + hover:text-text, 선택 탭 → hover 클래스 없이 bg-selected 유지", () => {
    renderAt("/");

    // 선택 탭(`홈`): 표현은 그대로고 hover·focus 표현이 없다(선택이 최종 상태다).
    const selected = classesOf(SIDEBAR_TAB_HOME);
    expect(selected).toContain("bg-selected");
    expect(selected).toContain("text-text");
    expect(selected.filter((cls) => cls.startsWith("hover:") || cls.startsWith("focus-visible:"))).toEqual([]);

    for (const label of [SIDEBAR_TAB_WORKFLOWS, SIDEBAR_TAB_SETTINGS]) {
      const tab = classesOf(label);
      // 비선택 탭 hover·focus: 배경 `bg-soft` + 글자 `text-text`.
      expect(tab, label).toContain("hover:bg-soft");
      expect(tab, label).toContain("hover:text-text");
      expect(tab, label).toContain("focus-visible:bg-soft");
      expect(tab, label).toContain("focus-visible:text-text");
      // hover가 선택 표현과 달라야 한다: 비선택 탭에는 `bg-selected`가 없다.
      expect(tab, label).not.toContain("hover:bg-selected");
      expect(tab, label).not.toContain("focus-visible:bg-selected");
      expect(tab, label).not.toContain("bg-selected");
      expect(tab, label).toContain("text-text-secondary");
      expect(tab.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);
    }
  });
  it("[NFR-12] NAV_ITEMS 한 배열로 가로형·레일을 그린다: 항목 수 = 링크 수, 순서·아이콘·글자가 배열과 같다", () => {
    const { container } = renderAt("/");
    const links = within(container.querySelector('[data-wf="NAV-2"]') as HTMLElement).getAllByRole("link");

    expect(links).toHaveLength(NAV_ITEMS.length);
    NAV_ITEMS.forEach((item, index) => {
      const anchor = links[index] as HTMLElement;
      expect(anchor).toHaveAttribute("href", item.to);
      expect(anchor).toHaveAttribute("aria-label", item.label);
      expect(anchor.querySelector(`svg.lucide-${item.icon}`)).not.toBeNull();
    });
  });

  it("[NFR-12] 눌러도 아무 일 없는 메뉴가 없다: 모든 NAV_ITEMS 경로가 실제 라우트이고 구현 전 화면(스킬·MCP·비용)은 아직 없다", () => {
    const children = routes[0]?.children ?? [];
    const definedPaths = children.map((route) => route.path).filter((path): path is string => path !== undefined && path !== "*");

    for (const item of NAV_ITEMS) {
      expect(definedPaths, `${item.label} → ${item.to}`).toContain(item.to);
    }
    expect(NAV_ITEMS.map((item) => item.to)).toEqual(["/", "/workflows", "/settings"]);
    for (const label of ["스킬", "MCP", "비용"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });
});
