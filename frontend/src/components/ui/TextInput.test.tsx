import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextInput } from "./TextInput";

/** 브라우저 기본 포커스 표시를 지우는 클래스(ADR-46 A 금지 대상). 문자열을 조립해 죽은 유틸리티 생성을 막는다. */
const OUTLINE_RESET_CLASSES = [`outline-${"none"}`, `focus:outline-${"none"}`, `focus-visible:outline-${"none"}`];

// ui-spec.md §공통 Field/TextInput, ADR-69: 입력은 hover가 없고 초점 링은 base.css `:focus-visible`이 그린다.
describe("TextInput", () => {
  it("[NFR-12] 높이 34·bg-soft·border-strong·rounded-control·placeholder muted, hover·임의값·outline 제거 없음", () => {
    render(<TextInput aria-label="이름 (name)" />);

    const classes = screen.getByRole("textbox", { name: "이름 (name)" }).className.split(/\s+/).filter(Boolean);
    for (const cls of ["min-h-control", "bg-soft", "border-border-strong", "rounded-control", "placeholder:text-text-muted"]) {
      expect(classes).toContain(cls);
    }
    expect(classes.filter((cls) => cls.startsWith("hover:") || cls.startsWith("focus-visible:"))).toEqual([]);
    expect(classes.filter((cls) => cls.includes("["))).toEqual([]);
    expect(classes.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);
  });

  it("[NFR-12] aria-invalid이면 테두리 danger 변형을 갖고, mono는 고정폭 글자", () => {
    render(<TextInput aria-label="이름" aria-invalid mono />);

    const input = screen.getByRole("textbox", { name: "이름" });
    expect(input).toBeInvalid();
    expect(input).toHaveClass("aria-invalid:border-danger", "font-mono", "text-text-mono");
  });
});
