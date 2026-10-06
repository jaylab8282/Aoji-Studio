/**
 * ui-spec.md §공통 Radio (05-R·06, `_base.css:112-113,114`): 16×16 원. 켬 = `action` 테두리 + 채움(안쪽 4px `bg-card`),
 * 끔 = 점선 `border-dashed bg-soft`, 비활성 = 점선 `bg-card` + 라벨 `text-muted`. 실제 입력은 시각적으로만 숨긴 네이티브
 * `input[type=radio]`다. 초점 링은 원에 그린다.
 */
import type { InputHTMLAttributes } from "react";

interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "checked" | "children"> {
  checked: boolean;
  label: string;
}

export function Radio({ checked, label, disabled, ...rest }: RadioProps) {
  const circle = disabled
    ? "border-dashed border-border-dashed bg-card"
    : checked
      ? "border-action bg-action radio-on"
      : "border-border-dashed bg-soft";
  return (
    <label
      className={`inline-flex min-h-control items-center gap-2 whitespace-nowrap ${
        disabled ? "cursor-not-allowed text-text-muted" : "cursor-pointer"
      }`}
    >
      <input {...rest} type="radio" checked={checked} disabled={disabled} className="sr-only" />
      <span
        aria-hidden="true"
        className={`inline-block size-4 shrink-0 rounded-full border ring-after-input ${circle}`}
      />
      {label}
    </label>
  );
}
