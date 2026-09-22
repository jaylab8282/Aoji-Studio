/**
 * ui-spec.md §공통 CollectorStatus (사이드 탭 하단 카드, 전 화면). FR-003-AC6.
 */
import { useSnapshotStore } from "../../state/snapshotStore";
import { Skeleton } from "../ui/Skeleton";
import { StatusDot } from "../ui/StatusDot";
import { formatHms } from "../../lib/format/time";
import { COLLECTOR_STATUS_TITLE, HOOK_CONFIGURED_TEXT, HOOK_NOT_CONFIGURED_TEXT, lastReceivedLabel } from "../../lib/text";

export function CollectorStatus() {
  const { ready, registry, live } = useSnapshotStore();
  const loading = !ready || registry === null || live === null;

  return (
    <div className="border-t border-border px-4 py-3 flex flex-col gap-1.5">
      <p className="text-aux text-text-muted">{COLLECTOR_STATUS_TITLE}</p>
      {loading ? (
        <>
          <Skeleton className="h-4 w-32" aria-label="수집 상태 로딩 중" />
          <Skeleton className="h-4 w-40" aria-label="마지막 수신 로딩 중" />
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 text-body text-text-secondary">
            <StatusDot status={registry.hookConfigured ? "running" : "idle"} />
            {registry.hookConfigured ? HOOK_CONFIGURED_TEXT : HOOK_NOT_CONFIGURED_TEXT}
          </span>
          <span className="text-aux text-text-faint">
            {lastReceivedLabel(live.lastReceivedAt === null ? null : formatHms(live.lastReceivedAt))}
          </span>
        </>
      )}
    </div>
  );
}
