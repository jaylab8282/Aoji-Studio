/**
 * ui-spec.md §공통 Button, ui-rules.md 2, conventions.md §3 Frontend MUST.
 * variant는 이 다섯 가지만 쓴다. `disabledReason`이 있으면 비활성 + 옆에 이유를 보여준다.
 * 눌러도 아무 일도 없는 활성 버튼을 만들지 않는다.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "terminal" | "secondary" | "add" | "danger";
export type ButtonSize = "md" | "sm";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant: ButtonVariant;
  size?: ButtonSize;
  disabledReason?: string;
  children: ReactNode;
}

// ui-rules.md 2 표: 주 동작 / 터미널 열기 / 보조 / 추가 / 위험
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-running text-on-accent border border-running",
  terminal: "bg-running-soft text-running border border-running",
  secondary: "bg-soft text-text border border-border-strong",
  add: "bg-transparent text-text border border-border-dashed border-dashed",
  danger: "bg-danger-soft text-danger border border-danger-border",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "h-btn px-4",
  sm: "h-btn-sm px-3",
};

export function Button({
  variant,
  size = "md",
  disabledReason,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled) || Boolean(disabledReason);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={isDisabled}
        aria-disabled={isDisabled}
        className={`inline-flex items-center justify-center rounded-control text-body font-medium transition-colors duration-200 disabled:border-dashed disabled:text-text-faint disabled:opacity-100 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`}
        {...rest}
      >
        {children}
      </button>
      {disabledReason ? <span className="text-aux text-text-faint">{disabledReason}</span> : null}
    </span>
  );
}
