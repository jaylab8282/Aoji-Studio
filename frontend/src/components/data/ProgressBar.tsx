/**
 * ui-spec.md §공통 `ProgressBar`(10 첫 읽기): 폭 160, 높이 8, `role="progressbar"`(`aria-valuenow` = 읽은 파일, `aria-valuemax` = 전체),
 * 채움 `text-muted`(`--progress-ratio`). 비율은 데이터에서 계산해 CSS 변수로만 넘긴다(conventions §7 예외).
 */
import type { CSSProperties } from "react";

interface ProgressBarProps {
  value: number;
  max: number;
  /** 접근 이름(`읽은 파일`). */
  label: string;
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuenow={value}
      aria-valuemax={max}
      className="block h-meter w-progress flex-none overflow-hidden rounded-dot border border-border bg-inset"
    >
      <span aria-hidden="true" className="progress-fill" style={{ "--progress-ratio": ratio } as CSSProperties} />
    </span>
  );
}
