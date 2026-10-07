/**
 * ui-spec.md SCR-02 범례(`02-3` 왼쪽): `작업 중 N`·`권한·입력 대기 N`·`대기 N` — 상태 사각형 + 상태색 글자, 수는 고정폭.
 * 집계는 `counts.ts`(정상 정의 파일 전체 기준, FR-005-AC1·AC2와 같은 규칙). 색만으로 구분하지 않는다(글자가 항상 함께).
 */
import type { Live, Registry, Status } from "../../api/types";
import { StatusDot } from "../../components/ui/StatusDot";
import { countAllStatuses } from "../../lib/derive/counts";
import { STATUS_LABEL_TEXT } from "../../lib/text";

const ORDER: ReadonlyArray<Status> = ["running", "waiting", "idle"];

const TEXT_CLASS: Record<Status, string> = {
  running: "text-live",
  waiting: "text-waiting",
  idle: "text-text-muted",
};

export function Legend({ registry, live }: { registry: Registry; live: Live }) {
  const counts = countAllStatuses(registry, live.agents);

  return (
    <div aria-label="상태 범례" role="group" className="flex flex-none items-center gap-4 text-aux font-semibold">
      {ORDER.map((status) => (
        <span key={status} data-status={status} className={`inline-flex items-center gap-1.5 whitespace-nowrap ${TEXT_CLASS[status]}`}>
          <StatusDot status={status} />
          {STATUS_LABEL_TEXT[status]} <b className="font-mono text-body font-medium">{counts[status]}</b>
        </span>
      ))}
    </div>
  );
}
