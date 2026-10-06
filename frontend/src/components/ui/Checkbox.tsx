/**
 * ui-spec.md §공통 Checkbox (05-R·06, `_base.css:110-111,114`): 16×16 `rounded-dot`. 켬 = `bg-action` + `check` 12px 흰색,
 * 끔 = 점선 `border-dashed bg-soft`, 비활성 = 점선 `bg-card` + 라벨 `text-muted`. 실제 입력은 시각적으로만 숨긴 네이티브
 * `input[type=checkbox]`라 키보드·스크린 리더 동작이 그대로이고, 초점 링은 상자에 그린다.
 */
import type { InputHTMLAttributes } from "react";
import { Icon } from "./Icon";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "checked" | "children"> {
  checked: boolean;
  /** 라벨 글자. 라벨 없이 표 칸 안에서 쓸 때는 `aria-label`을 넘긴다. */
  label?: string;
}

export function Checkbox({ checked, label, disabled, ...rest }: CheckboxProps) {
  const box = disabled
    ? "border-dashed border-border-dashed bg-card"
    : checked
      ? "border-action bg-action"
      : "border-border-dashed bg-soft";
  return (
    <label
      className={`inline-flex min-h-control items-center gap-2 whitespace-nowrap ${
        disabled ? "cursor-not-allowed text-text-muted" : "cursor-pointer"
      }`}
    >
      <input {...rest} type="checkbox" checked={checked} disabled={disabled} className="sr-only" />
      <span
        aria-hidden="true"
        className={`grid size-4 shrink-0 place-items-center rounded-dot border text-on-action ring-after-input ${box}`}
      >
        {checked && !disabled ? <Icon name="check" className="size-3" /> : null}
      </span>
      {label === undefined ? null : label}
    </label>
  );
}
