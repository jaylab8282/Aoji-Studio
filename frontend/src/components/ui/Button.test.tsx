import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, type ButtonVariant } from "./Button";

// ui-spec.md §공통 `Button`, conventions.md §7 MUST, ADR-29.
// 비활성은 variant 표현을 대체하는 여섯 번째 표현이라 variant와 무관하게 모두 같은 모양이다.

const ALL_VARIANTS: ButtonVariant[] = ["primary", "terminal", "secondary", "add", "danger"];

// variant 채움 배경·강조 테두리 색 클래스(비활성일 때 하나도 남으면 안 된다).
const VARIANT_FILL_CLASSES = [
  "bg-running",
  "bg-running-soft",
  "bg-soft",
  "bg-danger-soft",
  "border-running",
  "border-border-strong",
  "border-danger-border",
];

function classesOf(name: string): string[] {
  return screen.getByRole("button", { name }).className.split(/\s+/).filter(Boolean);
}

describe("Button", () => {
  it("[ADR-29] primary·danger·terminal·secondary 비활성이 모두 같은 모양(배경 없음·점선·faint)", () => {
    const { unmount } = render(
      <>
        <Button variant="primary" disabledReason="작업 중에는 수정할 수 없습니다">
          정의 수정
        </Button>
        <Button variant="danger" disabledReason="작업 중에는 제거할 수 없습니다">
          제거
        </Button>
        <Button variant="terminal" disabledReason="팀장이 없습니다">
          팀장 호출
        </Button>
        <Button variant="secondary" disabled>
          가져오기
        </Button>
      </>,
    );

    const shapes = ["정의 수정", "제거", "팀장 호출", "가져오기"].map((name) =>
      [...classesOf(name)].sort().join(" "),
    );

    // 네 variant의 비활성 모양이 완전히 같다.
    expect(new Set(shapes).size).toBe(1);

    // 그 한 가지 모양은 배경 없음 + 점선 `border/dashed` + `text/faint`다.
    const shape = classesOf("정의 수정");
    expect(shape).toContain("bg-transparent");
    expect(shape).toContain("border-dashed");
    expect(shape).toContain("border-border-dashed");
    expect(shape).toContain("text-text-faint");
    for (const fill of VARIANT_FILL_CLASSES) {
      expect(shape).not.toContain(fill);
    }

    unmount();
  });

  it("[ADR-29] 비활성 `add` variant도 같은 모양이고, 모든 variant 비활성에 disabled 속성이 붙는다", () => {
    render(
      <Button variant="add" disabledReason="쓰기 권한이 없습니다">
        워크플로우 추가
      </Button>,
    );

    const button = screen.getByRole("button", { name: "워크플로우 추가" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    const shape = button.className.split(/\s+/);
    expect(shape).toContain("bg-transparent");
    expect(shape).toContain("border-dashed");
    expect(shape).toContain("border-border-dashed");
    expect(shape).toContain("text-text-faint");
    expect(screen.getByText("쓰기 권한이 없습니다")).toBeInTheDocument();
  });

  it("[ADR-29] 활성 variant 모양은 그대로다(variant별 채움 배경·테두리 유지)", () => {
    const expected: Record<ButtonVariant, string[]> = {
      primary: ["bg-running", "text-on-accent", "border", "border-running"],
      terminal: ["bg-running-soft", "text-running", "border", "border-running"],
      secondary: ["bg-soft", "text-text", "border", "border-border-strong"],
      add: ["bg-transparent", "text-text", "border", "border-border-dashed", "border-dashed"],
      danger: ["bg-danger-soft", "text-danger", "border", "border-danger-border"],
    };

    for (const variant of ALL_VARIANTS) {
      const { unmount } = render(<Button variant={variant}>실행</Button>);
      const button = screen.getByRole("button", { name: "실행" });
      expect(button).toBeEnabled();
      const shape = button.className.split(/\s+/);
      for (const cls of expected[variant]) {
        expect(shape, `${variant} 활성 모양에 ${cls}`).toContain(cls);
      }
      // 활성에는 비활성 표현(faint 글자)이 섞이지 않는다.
      if (variant !== "add") {
        expect(shape).not.toContain("border-dashed");
      }
      expect(shape).not.toContain("text-text-faint");
      unmount();
    }
  });
});
