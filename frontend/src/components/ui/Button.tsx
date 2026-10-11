/**
 * ui-spec.md §공통 Button, ADR-69, ADR-71, conventions.md §7 MUST.
 * variant = `primary`·`accent`·`secondary`·`add`·`danger`, size = `default`(높이 34)·`icon`(34×34).
 * 비활성은 variant 표현을 대체한다: 어느 variant든 점선 `border/dashed` + `bg/card` + `text/muted` 400 +
 * `cursor-not-allowed`. 이유 줄(`disabledReason`)이 있으면 버튼 옆에 그리고 `aria-describedby`로 잇는다.
 * hover는 `_base.css`와 같다 — secondary 테두리 `border/dashed`, primary `action/primary-hover`, add 글자 `text/primary`.
 * 키보드 초점 링은 `styles/base.css`의 `:focus-visible` 한 곳이 그린다. 색 전환은 `motion/fast` 120ms.
 * 눌러도 아무 일도 없는 활성 버튼을 만들지 않는다.
 */
import { useId } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "accent" | "secondary" | "add" | "danger";
export type ButtonSize = "default" | "icon";

type ButtonBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant: ButtonVariant;
  disabledReason?: string;
  /** 버튼을 가로로 늘린다(ui-spec.md SCR-03 패널 `정의 수정` "primary, 넓게"). */
  fullWidth?: boolean;
  children: ReactNode;
};

type ButtonProps =
  | (ButtonBaseProps & { size?: "default" })
  | (ButtonBaseProps & { size: "icon"; "aria-label": string });

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-action text-on-action border border-action hover:bg-action-hover hover:border-action-hover",
  accent: "bg-action-soft text-link border border-action-border",
  secondary: "bg-soft text-text border border-border-strong hover:border-border-dashed",
  add: "bg-card text-text-muted border border-border-dashed border-dashed hover:text-text",
  danger: "bg-danger-soft text-danger border border-danger-border",
};

const DISABLED_CLASSES =
  "bg-card text-text-muted font-normal border border-border-dashed border-dashed cursor-not-allowed";

function sizeClasses(size: ButtonSize, variant: ButtonVariant): string {
  if (size === "icon") return "size-control p-0";
  return variant === "primary" ? "min-h-control-primary px-4" : "min-h-control px-3";
}

export function Button(props: ButtonProps) {
  const {
    variant,
    size = "default",
    disabledReason,
    fullWidth = false,
    disabled,
    children,
    "aria-describedby": ariaDescribedBy,
    ...rest
  } = props;
  const reasonId = useId();
  const isDisabled = Boolean(disabled) || Boolean(disabledReason);
  const describedBy = [ariaDescribedBy, disabledReason ? reasonId : undefined].filter(Boolean).join(" ");

  return (
    <span className={`items-center gap-2 ${fullWidth ? "flex w-full" : "inline-flex"}`}>
      <button
        type="button"
        {...rest}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control text-body transition-colors duration-120 ease-standard ${fullWidth ? "flex-1" : ""} ${isDisabled ? DISABLED_CLASSES : `font-semibold ${VARIANT_CLASSES[variant]}`} ${sizeClasses(size, variant)}`}
      >
        {children}
      </button>
      {disabledReason ? (
        <span id={reasonId} className="text-aux text-text-muted whitespace-nowrap">
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
