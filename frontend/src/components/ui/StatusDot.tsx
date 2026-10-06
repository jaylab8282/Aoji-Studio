/**
 * ui-spec.md §공통 StatusDot (`_base.css:67-71`): 8×8 사각형 `rounded-dot`. 작업 중(`running`)만 발광,
 * 권한 대기 주황, 대기 `idle`, 장애 `danger`. 색만으로 구분하지 않으므로 글자와 함께 쓴다(`StatusLabel`·칩).
 * `data-*` 같은 속성은 그대로 넘긴다.
 */
import type { HTMLAttributes } from "react";
import type { Status } from "../../api/types";

export type DotStatus = Status | "danger";

const DOT_CLASSES: Record<DotStatus, string> = {
  running: "bg-live shadow-glow",
  waiting: "bg-waiting",
  idle: "bg-idle",
  danger: "bg-danger",
};

interface StatusDotProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  status: DotStatus;
}

export function StatusDot({ status, ...rest }: StatusDotProps) {
  return <span aria-hidden="true" {...rest} className={`inline-block size-dot shrink-0 rounded-dot ${DOT_CLASSES[status]}`} />;
}
