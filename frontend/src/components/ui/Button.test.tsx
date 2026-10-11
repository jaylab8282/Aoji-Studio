import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, type ButtonVariant } from "./Button";

/**
 * 브라우저 기본 포커스 표시를 지우는 클래스(ADR-46 A 금지 대상).
 * 문자열을 조립해 Tailwind가 이 테스트 문구에서 죽은 유틸리티를 만들지 않게 한다.
 */
const OUTLINE_RESET_CLASSES = [
  `outline-${"none"}`,
  `focus:outline-${"none"}`,
  `focus-visible:outline-${"none"}`,
];

// ui-spec.md §공통 `Button`, ADR-69, conventions.md §7 MUST.
// 비활성은 variant 표현을 대체하는 표현이라 variant와 무관하게 모두 같은 모양이다.

const ALL_VARIANTS: ButtonVariant[] = ["primary", "accent", "secondary", "add", "danger"];

// variant 채움 배경·강조 테두리 색 클래스(비활성일 때 하나도 남으면 안 된다).
const VARIANT_FILL_CLASSES = [
  "bg-action",
  "bg-action-soft",
  "bg-soft",
  "bg-danger-soft",
  "border-action",
  "border-action-border",
  "border-border-strong",
  "border-danger-border",
];

function classesOf(name: string): string[] {
  return screen.getByRole("button", { name }).className.split(/\s+/).filter(Boolean);
}

describe("Button", () => {
  it("[NFR-12] variant별 활성 클래스(primary·accent·secondary·add·danger)", () => {
    const expected: Record<ButtonVariant, string[]> = {
      primary: ["bg-action", "text-on-action", "border", "border-action", "min-h-control-primary", "px-4"],
      accent: ["bg-action-soft", "text-link", "border", "border-action-border", "min-h-control"],
      secondary: ["bg-soft", "text-text", "border", "border-border-strong", "min-h-control"],
      add: ["bg-card", "text-text-muted", "border", "border-border-dashed", "border-dashed"],
      danger: ["bg-danger-soft", "text-danger", "border", "border-danger-border"],
    };

    for (const [variant, classes] of Object.entries(expected) as Array<[ButtonVariant, string[]]>) {
      const { unmount } = render(<Button variant={variant}>실행</Button>);
      const button = screen.getByRole("button", { name: "실행" });
      expect(button).toBeEnabled();
      const shape = classesOf("실행");
      for (const cls of classes) {
        expect(shape, `${variant} 활성 모양에 ${cls}`).toContain(cls);
      }
      // 모든 활성 버튼은 600 글자와 아이콘 간격 6(gap-1.5), 모서리 control이다. 활성에는 비활성 표현이 섞이지 않는다.
      expect(shape).toContain("font-semibold");
      expect(shape).toContain("gap-1.5");
      expect(shape).toContain("rounded-control");
      expect(shape).not.toContain("cursor-not-allowed");
      if (variant !== "add") expect(shape).not.toContain("border-dashed");
      unmount();
    }
  });

  it("[NFR-12] 비활성이면 variant 무관 같은 표현(점선·bg-card·text-muted 400·cursor-not-allowed)", () => {
    const { unmount } = render(
      <>
        {ALL_VARIANTS.map((variant) => (
          <Button key={variant} variant={variant} disabled>
            {variant}
          </Button>
        ))}
      </>,
    );

    // 높이·안 여백은 크기 규칙(primary 36·16)이라 비교에서 뺀다 — `_base.css` `.btn.off`도 크기를 덮어쓰지 않는다.
    const shapes = ALL_VARIANTS.map((variant) =>
      classesOf(variant)
        .filter((cls) => !/^(min-h-|px-)/.test(cls))
        .sort()
        .join(" "),
    );
    expect(new Set(shapes).size).toBe(1);

    const shape = classesOf("primary");
    for (const cls of ["bg-card", "border-dashed", "border-border-dashed", "text-text-muted", "font-normal", "cursor-not-allowed"]) {
      expect(shape).toContain(cls);
    }
    expect(shape).not.toContain("font-semibold");
    for (const fill of VARIANT_FILL_CLASSES) {
      expect(shape).not.toContain(fill);
    }
    for (const variant of ALL_VARIANTS) {
      expect(screen.getByRole("button", { name: variant })).toBeDisabled();
      expect(screen.getByRole("button", { name: variant })).toHaveAttribute("aria-disabled", "true");
    }
    unmount();
  });

  it("[NFR-12] `disabledReason`이면 비활성 + 이유 줄 렌더 + 버튼 aria-describedby가 이유 줄을 가리킨다", () => {
    render(
      <Button variant="primary" disabledReason="쓰기 권한 없음">
        워크플로우 추가
      </Button>,
    );

    const button = screen.getByRole("button", { name: "워크플로우 추가" });
    expect(button).toBeDisabled();
    const reason = screen.getByText("쓰기 권한 없음");
    expect(reason.id).not.toBe("");
    expect(button).toHaveAttribute("aria-describedby", reason.id);
    expect(button).toHaveAccessibleDescription("쓰기 권한 없음");
    expect(reason).toHaveClass("text-aux", "text-text-muted");
  });

  it("[NFR-12] 이유 줄이 없으면 aria-describedby도 없고, 호출부 aria-describedby는 이유 id와 합쳐진다", () => {
    const { unmount } = render(<Button variant="secondary">열기</Button>);
    expect(screen.getByRole("button", { name: "열기" })).not.toHaveAttribute("aria-describedby");
    unmount();

    render(
      <>
        <span id="outer">바깥 설명</span>
        <Button variant="secondary" aria-describedby="outer" disabledReason="팀장 없음">
          열기
        </Button>
      </>,
    );
    const ids = screen.getByRole("button", { name: "열기" }).getAttribute("aria-describedby")?.split(" ");
    expect(ids).toHaveLength(2);
    expect(ids?.[0]).toBe("outer");
  });

  it("[NFR-12] hover 클래스: primary hover:bg-action-hover, secondary hover:border-border-dashed, add hover:text-text, accent·danger는 없음", () => {
    const hover: Record<string, string[]> = {
      primary: ["hover:bg-action-hover"],
      secondary: ["hover:border-border-dashed"],
      add: ["hover:text-text"],
      accent: [],
      danger: [],
    };

    for (const [variant, classes] of Object.entries(hover)) {
      const { unmount } = render(<Button variant={variant as ButtonVariant}>실행</Button>);
      const shape = classesOf("실행");
      expect(shape.filter((cls) => cls.startsWith("hover:")).sort(), variant).toEqual(
        variant === "primary" ? [...classes, "hover:border-action-hover"].sort() : [...classes].sort(),
      );
      // 초점 링은 base.css `:focus-visible` 한 곳이 그린다 — 지우는 클래스도, 별도 focus 클래스도 없다.
      expect(shape.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);
      expect(shape.filter((cls) => cls.includes("["))).toEqual([]);
      unmount();
    }
  });

  it("[NFR-12] 색 전환은 120ms(`duration-120`)이고 위치·크기 전환은 없다", () => {
    render(<Button variant="secondary">실행</Button>);
    const shape = classesOf("실행");
    expect(shape).toContain("transition-colors");
    expect(shape).toContain("duration-120");
    expect(shape.filter((cls) => /^(transition-(all|transform)|duration-(200|300))$/.test(cls))).toEqual([]);
  });

  it("[NFR-12] 비활성(disabled·disabledReason)에는 hover 클래스가 없다", () => {
    for (const variant of ALL_VARIANTS) {
      const byDisabled = render(
        <Button variant={variant} disabled>
          실행
        </Button>,
      );
      expect(classesOf("실행").filter((cls) => cls.startsWith("hover:")), `${variant} disabled`).toEqual([]);
      byDisabled.unmount();

      const byReason = render(
        <Button variant={variant} disabledReason="작업 중에는 수정할 수 없습니다">
          실행
        </Button>,
      );
      expect(classesOf("실행").filter((cls) => cls.startsWith("hover:")), `${variant} reason`).toEqual([]);
      byReason.unmount();
    }
  });

  it("[NFR-12] size icon은 34×34(size-control)이고 aria-label을 갖는다", () => {
    render(
      <Button variant="secondary" size="icon" aria-label="확대">
        +
      </Button>,
    );
    const shape = classesOf("확대");
    expect(shape).toContain("size-control");
    expect(shape).toContain("p-0");
  });
});
