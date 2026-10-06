/**
 * ui-spec.md §공통 StatusLabel = 상태 사각형 + 글자(`_base.css:72-76`). 글자색: 작업 중 `text-live`,
 * 권한 대기 `text-waiting`, 대기 `text-muted`(`state/idle`은 글자색 금지), 장애 `text-danger`.
 * 색만 있는 상태 표시는 금지(conventions.md §3). 장애(`danger`)는 서버 상태 글자가 없어 호출부가 `label`을 넘긴다.
 */
import type { Status } from "../../api/types";
import { StatusDot, type DotStatus } from "./StatusDot";
import { STATUS_LABEL_TEXT, STATUS_LABEL_TEXT_SHORT } from "../../lib/text";

const TEXT_CLASSES: Record<DotStatus, string> = {
  running: "text-live",
  waiting: "text-waiting",
  idle: "text-text-muted",
  danger: "text-danger",
};

type StatusLabelProps =
  | {
      status: Status;
      /** 캐릭터 아래처럼 좁은 자리에서 쓰는 축약 표기("권한 대기"). 기본은 전체 표기("권한·입력 대기"). */
      short?: boolean;
      label?: string;
    }
  | { status: "danger"; label: string; short?: never };

export function StatusLabel(props: StatusLabelProps) {
  const { status } = props;
  const text =
    props.label ?? (status === "danger" ? "" : props.short ? STATUS_LABEL_TEXT_SHORT[status] : STATUS_LABEL_TEXT[status]);
  return (
    <span className={`inline-flex items-center gap-1.5 text-body whitespace-nowrap ${TEXT_CLASSES[status]}`}>
      <StatusDot status={status} />
      {text}
    </span>
  );
}
