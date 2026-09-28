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

  it("[ADR-46 A] secondary·add → hover:bg-selected, primary·terminal·danger → hover:brightness-110, 다섯 variant 모두 focus-visible에 같은 표현", () => {
    // ui-spec.md §공통 "마우스 hover·키보드 `:focus-visible` 표현" 표 ①·③.
    const expression: Record<ButtonVariant, string> = {
      primary: "brightness-110",
      terminal: "brightness-110",
      secondary: "bg-selected",
      add: "bg-selected",
      danger: "brightness-110",
    };

    for (const variant of ALL_VARIANTS) {
      const { unmount } = render(<Button variant={variant}>실행</Button>);
      const shape = classesOf("실행");
      const mine = expression[variant];
      const other = mine === "bg-selected" ? "brightness-110" : "bg-selected";

      expect(shape, `${variant} hover`).toContain(`hover:${mine}`);
      // `:focus-visible`은 hover와 같은 표현이다(키보드 사용자도 같은 피드백을 받는다).
      expect(shape, `${variant} focus-visible`).toContain(`focus-visible:${mine}`);
      // 다른 부류의 표현이 섞이지 않는다(값 규칙 고정: 새 색·임의값 없음).
      expect(shape).not.toContain(`hover:${other}`);
      expect(shape).not.toContain(`focus-visible:${other}`);
      expect(shape.filter((cls) => cls.includes("["))).toEqual([]);
      // 브라우저 기본 포커스 표시를 지우지 않는다.
      expect(shape.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);
      // 색 전환은 `transition-colors duration-200`만 쓴다.
      expect(shape).toContain("transition-colors");
      expect(shape).toContain("duration-200");
      unmount();
    }
  });

  it("[ADR-46 A] disabled·disabledReason → hover·focus 클래스 없음", () => {
    // 눌리지 않는 컨트롤의 피드백은 거짓 정보다(ui-rules.md 2).
    for (const variant of ALL_VARIANTS) {
      const byDisabled = render(
        <Button variant={variant} disabled>
          실행
        </Button>,
      );
      expect(screen.getByRole("button", { name: "실행" })).toBeDisabled();
      expect(
        classesOf("실행").filter((cls) => cls.startsWith("hover:") || cls.startsWith("focus-visible:")),
        `${variant} disabled`,
      ).toEqual([]);
      byDisabled.unmount();

      const byReason = render(
        <Button variant={variant} disabledReason="작업 중에는 수정할 수 없습니다">
          실행
        </Button>,
      );
      expect(screen.getByRole("button", { name: "실행" })).toBeDisabled();
      expect(
        classesOf("실행").filter((cls) => cls.startsWith("hover:") || cls.startsWith("focus-visible:")),
        `${variant} disabledReason`,
      ).toEqual([]);
      byReason.unmount();
    }
  });
});
