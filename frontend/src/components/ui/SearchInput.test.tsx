import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchInput } from "./SearchInput";

/** 브라우저 기본 포커스 표시를 지우는 클래스(ADR-46 A 금지 대상). 문자열을 조립해 죽은 유틸리티 생성을 막는다. */
const OUTLINE_RESET_CLASSES = [`outline-${"none"}`, `focus:outline-${"none"}`, `focus-visible:outline-${"none"}`];

// ui-spec.md §공통 SearchInput, ADR-69: `search` 아이콘(글자 ⌕ 아님) + TextInput 표면, hover 없음.
describe("SearchInput", () => {
  it("[NFR-12] search 아이콘, bg-soft·border-strong, hover·임의값·outline 제거 없음", () => {
    const { container } = render(<SearchInput aria-label="에이전트·워크플로우 검색" />);

    const input = screen.getByRole("searchbox", { name: "에이전트·워크플로우 검색" });
    const classes = input.className.split(/\s+/).filter(Boolean);
    for (const cls of ["min-h-control", "bg-soft", "border-border-strong", "placeholder:text-text-muted"]) {
      expect(classes).toContain(cls);
    }
    expect(classes.filter((cls) => cls.startsWith("hover:") || cls.startsWith("focus-visible:"))).toEqual([]);
    expect(classes.filter((cls) => cls.includes("["))).toEqual([]);
    expect(classes.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container).not.toHaveTextContent("⌕");
  });
});
