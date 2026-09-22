/**
 * ui-spec.md §공통 StatusDot / ui-rules.md 1: 9~10px 사각, 실행 중만 발광.
 * 색만으로 상태를 구분하지 않으므로 항상 `StatusLabel`과 함께 쓴다(단독 사용 금지는 이용부에서 지킨다).
 * 모서리 3px 전용 토큰은 없어 정의된 토큰 중 가장 작은 `radius-badge`(6px)를 쓴다.
 */
import type { Status } from "../../api/types";

const DOT_CLASSES: Record<Status, string> = {
  running: "bg-running shadow-glow",
  waiting: "bg-waiting",
  idle: "bg-idle",
};

export function StatusDot({ status }: { status: Status }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block w-2.5 h-2.5 rounded-badge ${DOT_CLASSES[status]}`}
    />
  );
}
