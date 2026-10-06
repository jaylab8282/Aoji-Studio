import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextArea } from "./TextArea";

/** 브라우저 기본 포커스 표시를 지우는 클래스(ADR-46 A 금지 대상). 문자열을 조립해 죽은 유틸리티 생성을 막는다. */
const OUTLINE_RESET_CLASSES = [`outline-${"none"}`, `focus:outline-${"none"}`, `focus-visible:outline-${"none"}`];

// ui-spec.md §공통 TextArea, ADR-69: TextInput과 같은 표면, hover 없음, 초점 링은 base.css.
describe("TextArea", () => {
  it("[NFR-12] bg-soft·border-strong·rounded-control·고정폭 원문, hover·임의값·outline 제거 없음", () => {
    render(<TextArea aria-label="지침 (본문 = 시스템 프롬프트)" rows={4} />);

    const classes = screen
      .getByRole("textbox", { name: "지침 (본문 = 시스템 프롬프트)" })
      .className.split(/\s+/)
      .filter(Boolean);
    for (const cls of ["bg-soft", "border-border-strong", "rounded-control", "font-mono", "placeholder:text-text-muted"]) {
      expect(classes).toContain(cls);
    }
    expect(classes.filter((cls) => cls.startsWith("hover:") || cls.startsWith("focus-visible:"))).toEqual([]);
    expect(classes.filter((cls) => cls.includes("["))).toEqual([]);
    expect(classes.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);
  });

  it("[NFR-12] aria-invalid이면 테두리 danger 변형을 갖는다", () => {
    render(<TextArea aria-label="지침" aria-invalid />);
    expect(screen.getByRole("textbox", { name: "지침" })).toHaveClass("aria-invalid:border-danger");
  });
});
