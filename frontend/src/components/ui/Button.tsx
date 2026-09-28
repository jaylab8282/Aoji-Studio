/**
 * ui-spec.md §공통 Button, ui-rules.md 2, conventions.md §3 Frontend MUST.
 * variant는 이 다섯 가지만 쓴다. `disabledReason`이 있으면 비활성 + 옆에 이유를 보여준다.
 * 비활성은 variant 표현을 대체한다(ADR-29): 채움 배경·강조 테두리 색을 지우고 점선 + faint 글자만 남겨
 * variant와 무관하게 모두 같은 모양이 된다. 활성 variant 모양은 그대로다.
 * 라벨과 이유는 한 줄로 고정한다(`whitespace-nowrap`): 좁은 칸에서도 글자가 쪼개지지 않고
 * 클릭 영역 높이(`h-btn`/`h-btn-sm`)가 유지된다(ui-rules.md 2, NFR-12 최소 34px).
 * 눌러도 아무 일도 없는 활성 버튼을 만들지 않는다.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "terminal" | "secondary" | "add" | "danger";
export type ButtonSize = "md" | "sm";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant: ButtonVariant;
  size?: ButtonSize;
  disabledReason?: string;
  /** 버튼을 가로로 늘린다(ui-spec.md SCR-03 패널 `정의 수정` "primary, 넓게"). */
  fullWidth?: boolean;
  children: ReactNode;
}

// ui-rules.md 2 표: 주 동작 / 터미널 열기 / 보조 / 추가 / 위험
// 여섯 번째 행 `비활성`은 variant 위에 덧칠하는 상태가 아니라 variant 표현을 대체한다(ADR-29).
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-running text-on-accent border border-running",
  terminal: "bg-running-soft text-running border border-running",
  secondary: "bg-soft text-text border border-border-strong",
  add: "bg-transparent text-text border border-border-dashed border-dashed",
  danger: "bg-danger-soft text-danger border border-danger-border",
};

// ADR-29 / conventions.md §7 MUST: 비활성은 variant와 무관하게 한 가지 모양이다.
// 채움 배경과 강조 테두리 색을 지우고 점선(`border/dashed`) + `text/faint` 글자만 남긴다.
// 새 색·새 토큰을 만들지 않는다.
const DISABLED_CLASSES =
  "bg-transparent text-text-faint border border-border-dashed border-dashed opacity-100";

// ADR-46 A / conventions.md §7 MUST: hover·`:focus-visible` 표현은 variant별로 두 가지뿐이다.
// 어두운 표면(`secondary`·`add`)은 배경 토큰을 `bg/selected`로 바꾸고, 상태 색 채움
// (`primary`·`terminal`·`danger`)은 색 토큰을 교체하지 않고 `brightness-110` 한 단계만 준다.
// `:focus-visible`에는 hover와 같은 표현을 쓰고 브라우저 기본 포커스 표시를 지우지 않는다.
// 비활성에는 이 클래스를 붙이지 않는다 — 눌리지 않는 컨트롤의 피드백은 거짓 정보다(ui-rules.md 2).
const VARIANT_HOVER_CLASSES: Record<ButtonVariant, string> = {
  primary: "hover:brightness-110 focus-visible:brightness-110",
  terminal: "hover:brightness-110 focus-visible:brightness-110",
  secondary: "hover:bg-selected focus-visible:bg-selected",
  add: "hover:bg-selected focus-visible:bg-selected",
  danger: "hover:brightness-110 focus-visible:brightness-110",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "h-btn px-4",
  sm: "h-btn-sm px-3",
};

export function Button({
  variant,
  size = "md",
  disabledReason,
  fullWidth = false,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled) || Boolean(disabledReason);

  return (
    <span className={`items-center gap-2 ${fullWidth ? "flex w-full" : "inline-flex"}`}>
      <button
        type="button"
        disabled={isDisabled}
        aria-disabled={isDisabled}
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-control text-body font-medium transition-colors duration-200 ${fullWidth ? "flex-1" : ""} ${isDisabled ? DISABLED_CLASSES : `${VARIANT_CLASSES[variant]} ${VARIANT_HOVER_CLASSES[variant]}`} ${SIZE_CLASSES[size]}`}
        {...rest}
      >
        {children}
      </button>
      {disabledReason ? (
        <span className="whitespace-nowrap text-aux text-text-faint">{disabledReason}</span>
      ) : null}
    </span>
  );
}
