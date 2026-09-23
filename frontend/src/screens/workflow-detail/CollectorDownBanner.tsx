/**
 * ui-spec.md SCR-04-4 수집 중단 배너 (03 오피스 카드 위). FR-007-E1, ADR-17.
 * 조건 판정은 `lib/derive/collectorDown.ts`가 하고 여기서는 문구만 그린다.
 */
import { StatusDot } from "../../components/ui/StatusDot";
import { formatDateHm } from "../../lib/format/time";
import { COLLECTOR_DOWN_FOOTNOTE, collectorDownBannerMessage } from "../../lib/text";

export function CollectorDownBanner({ lastReceivedAt }: { lastReceivedAt: string | null }) {
  return (
    <div role="status" className="rounded-card border border-border bg-soft px-card py-3">
      <p className="flex items-center gap-2 text-body text-text-secondary">
        <StatusDot status="idle" />
        {collectorDownBannerMessage(lastReceivedAt === null ? null : formatDateHm(lastReceivedAt))}
      </p>
      <p className="mt-1 text-aux text-text-faint">{COLLECTOR_DOWN_FOOTNOTE}</p>
    </div>
  );
}
