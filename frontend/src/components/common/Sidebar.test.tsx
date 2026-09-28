import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
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

// ui-spec.md §공통 `Sidebar` + "마우스 hover·키보드 `:focus-visible` 표현" 표 ②(ADR-46 A).
// 사이드 탭은 선택 표시에 `bg-selected`를 쓰므로 hover는 한 단계 아래인 `bg-soft`여야 한다
// (같은 값을 쓰면 hover와 선택이 구분되지 않는다 — A-22 핵심 제약).

function classesOf(name: string): string[] {
  return screen.getByRole("link", { name }).className.split(/\s+/).filter(Boolean);
}

describe("Sidebar", () => {
  afterEach(() => {
    snapshotStore.reset();
  });

  it("[ADR-46 A] 비선택 탭 → hover:bg-soft + hover:text-text, 선택 탭 → hover 클래스 없고 bg-selected + border-running 유지", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    // 선택 탭(`홈`): 표현은 그대로고 hover·focus 표현이 없다(선택이 최종 상태다).
    const selected = classesOf(SIDEBAR_TAB_HOME);
    expect(selected).toContain("bg-selected");
    expect(selected).toContain("border-running");
    expect(selected).toContain("text-text");
    expect(selected.filter((cls) => cls.startsWith("hover:") || cls.startsWith("focus-visible:"))).toEqual([]);

    for (const label of [SIDEBAR_TAB_WORKFLOWS, SIDEBAR_TAB_SETTINGS]) {
      const tab = classesOf(label);
      // 비선택 탭 hover·focus: 배경 `bg-soft` + 글자 `text-text`.
      expect(tab, label).toContain("hover:bg-soft");
      expect(tab, label).toContain("hover:text-text");
      expect(tab, label).toContain("focus-visible:bg-soft");
      expect(tab, label).toContain("focus-visible:text-text");
      // hover가 선택 표현과 달라야 한다: 비선택 탭에는 `bg-selected`·왼쪽 초록 바가 없다.
      expect(tab, label).not.toContain("hover:bg-selected");
      expect(tab, label).not.toContain("focus-visible:bg-selected");
      expect(tab, label).not.toContain("bg-selected");
      expect(tab, label).not.toContain("border-running");
      expect(tab, label).toContain("text-text-secondary");
      expect(tab.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);
    }
  });
});
