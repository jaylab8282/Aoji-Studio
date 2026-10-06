import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select } from "./Select";

/** 브라우저 기본 포커스 표시를 지우는 클래스(ADR-46 A 금지 대상). 문자열을 조립해 죽은 유틸리티 생성을 막는다. */
const OUTLINE_RESET_CLASSES = [`outline-${"none"}`, `focus:outline-${"none"}`, `focus-visible:outline-${"none"}`];

// ui-spec.md §공통 Select, ADR-69: `chevron-down`, 선택 값 600, 비활성 점선. hover 없음.
describe("Select", () => {
  it("[NFR-12] bg-soft·border-strong·600, chevron-down 아이콘, hover·임의값·outline 제거 없음", () => {
    const { container } = render(
      <Select aria-label="층 선택" defaultValue="all">
        <option value="all">전체</option>
      </Select>,
    );

    const select = screen.getByRole("combobox", { name: "층 선택" });
    const classes = select.className.split(/\s+/).filter(Boolean);
    for (const cls of ["min-h-control", "bg-soft", "border-border-strong", "font-semibold", "appearance-none"]) {
      expect(classes).toContain(cls);
    }
    expect(classes.filter((cls) => cls.startsWith("hover:") || cls.startsWith("focus-visible:"))).toEqual([]);
    expect(classes.filter((cls) => cls.includes("["))).toEqual([]);
    expect(classes.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("[NFR-12] 비활성이면 점선·bg-card·muted 400·cursor-not-allowed 변형을 갖는다", () => {
    render(
      <Select aria-label="대상" disabled>
        <option>없음</option>
      </Select>,
    );
    const select = screen.getByRole("combobox", { name: "대상" });
    expect(select).toBeDisabled();
    expect(select).toHaveClass(
      "disabled:border-dashed",
      "disabled:border-border-dashed",
      "disabled:bg-card",
      "disabled:font-normal",
      "disabled:text-text-muted",
      "disabled:cursor-not-allowed",
    );
  });
});
