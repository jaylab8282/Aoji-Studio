/**
 * ui-spec.md §공통 `Meter`(`meter`, 08·10, ADR-88 결정 2·5): `bg-inset` + `border-border` + 채움 `text-muted`(`--meter-ratio`),
 * 높이 8(10 한도 `limit`는 10), 08은 `role="img"`, 10은 `role="meter"` + `aria-label`. 색은 값과 무관하게 같다(시안·주황·빨강 금지).
 * 채움 폭은 데이터에서 계산한 비율 하나를 CSS 변수로만 넘긴다(conventions §7 예외, `layout.css` `meter-fill`).
 */
import type { CSSProperties } from "react";
import { clampRatio } from "../../lib/derive/ratio";

interface MeterProps {
  /** 채움 비율 0~1. 범위 밖은 잘라서 쓴다. */
  ratio: number;
  /** 접근 이름(`활용도 19.6%` 등). */
  label: string;
  /** `img`(08 활용도) / `meter`(10 한도, `aria-valuenow`는 비율 × 100). */
  role?: "img" | "meter";
  /** 10 한도 막대(높이 10, 줄 전체 폭). */
  limit?: boolean;
}

export function Meter({ ratio, label, role = "img", limit = false }: MeterProps) {
  const clamped = clampRatio(ratio);
  const size = limit ? "h-meter-limit w-full flex-none" : "h-meter min-w-meter-min flex-1";
  return (
    <span
      role={role}
      aria-label={label}
      {...(role === "meter" ? { "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(clamped * 100) } : {})}
      className={`block overflow-hidden rounded-dot border border-border bg-inset ${size}`}
    >
      <span aria-hidden="true" className="meter-fill" style={{ "--meter-ratio": clamped } as CSSProperties} />
    </span>
  );
}
