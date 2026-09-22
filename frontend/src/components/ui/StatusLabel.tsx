/**
 * ui-spec.md §공통 StatusDot/StatusLabel = 점 + 글자. 색만 있는 상태 표시는 금지(conventions.md §3).
 */
import type { Status } from "../../api/types";
import { StatusDot } from "./StatusDot";
import { STATUS_LABEL_TEXT, STATUS_LABEL_TEXT_SHORT } from "../../lib/text";

interface StatusLabelProps {
  status: Status;
  /** 캐릭터 아래처럼 좁은 자리에서 쓰는 축약 표기("권한 대기"). 기본은 전체 표기("권한·입력 대기"). */
  short?: boolean;
}

export function StatusLabel({ status, short = false }: StatusLabelProps) {
  const text = short ? STATUS_LABEL_TEXT_SHORT[status] : STATUS_LABEL_TEXT[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-body text-text-secondary">
      <StatusDot status={status} />
      {text}
    </span>
  );
}
