/**
 * ui-spec.md SCR-04-4 수집 중단 띠 (03 상단 바 아래, `04-4-1`). FR-007-E1, ADR-17·ADR-68·ADR-72.
 * `circle-alert` + `hook 이벤트 수신 없음 · 마지막 수신 <시각|없음>`(600, 시각 고정폭) + 이유 한 줄(`text-text`, 말줄임). 버튼 없음.
 * 시각은 오늘이면 `hh:mm:ss`, 아니면 `yyyy-mm-dd hh:mm`(`formatTimestamp`). 조건 판정은 `lib/derive/collectorDown.ts`가 하고 여기서는 그리기만 한다.
 */
import { Banner } from "../../components/ui/Banner";
import { Icon } from "../../components/ui/Icon";
import { MonoText } from "../../components/ui/MonoText";
import { formatTimestamp } from "../../lib/format/time";
import { COLLECTOR_DOWN_LEAD, COLLECTOR_DOWN_WHY } from "../../lib/text";

export function CollectorDown({ lastReceivedAt }: { lastReceivedAt: string | null }) {
  return (
    <Banner tone="danger" wf="04-4-1">
      <Icon name="circle-alert" />
      <b data-testid="collector-down-message" className="font-semibold">
        {COLLECTOR_DOWN_LEAD}
        <MonoText>{formatTimestamp(lastReceivedAt)}</MonoText>
      </b>
      <span data-clamp className="min-w-0 truncate text-text">{COLLECTOR_DOWN_WHY}</span>
    </Banner>
  );
}
