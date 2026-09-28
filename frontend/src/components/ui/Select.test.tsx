import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select } from "./Select";

/**
 * 브라우저 기본 포커스 표시를 지우는 클래스(ADR-46 A 금지 대상).
 * 문자열을 조립해 Tailwind가 이 테스트 문구에서 죽은 유틸리티를 만들지 않게 한다.
 */
const OUTLINE_RESET_CLASSES = [
  `outline-${"none"}`,
  `focus:outline-${"none"}`,
  `focus-visible:outline-${"none"}`,
];

// ui-spec.md §공통 "마우스 hover·키보드 `:focus-visible` 표현" 표 ①(ADR-46 A):
// 드롭다운은 `bg-soft` 표면이라 hover·focus에서 `bg-selected`로 한 단계 밝아진다.

describe("Select", () => {
  it("[ADR-46 A] hover:bg-selected (focus-visible도 같은 표현, 기본 포커스 표시 유지)", () => {
    render(
      <Select aria-label="층 선택" defaultValue="all">
        <option value="all">전체</option>
      </Select>,
    );

    const select = screen.getByRole("combobox", { name: "층 선택" });
    const classes = select.className.split(/\s+/).filter(Boolean);

    expect(classes).toContain("bg-soft");
    expect(classes).toContain("hover:bg-selected");
    expect(classes).toContain("focus-visible:bg-selected");
    // 새 색 값·임의값 없음, 기본 포커스 표시도 지우지 않는다.
    expect(classes.filter((cls) => cls.includes("["))).toEqual([]);
    expect(classes.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);
  });
});
