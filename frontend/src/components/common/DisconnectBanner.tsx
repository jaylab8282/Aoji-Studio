/**
 * ui-spec.md SCR-04-3 실시간 연결 끊김 배너. FR-016-AC1·AC2·AC3.
 * conventions.md §7 MUST: `App` 레이아웃에서 한 번만 렌더링하고 모든 라우트 위에 나온다.
 */
import { useConnectionStore } from "../../state/connectionStore";
import { reconnectNow } from "../../api/stream";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { formatHms } from "../../lib/format/time";
import { disconnectBannerMessage, lastUpdatedLabel, NO_DATA_YET_TEXT, RECONNECT_NOW_LABEL } from "../../lib/text";

export function DisconnectBanner() {
  const { state, retryInSec, lastUpdatedAt } = useConnectionStore();

  if (state !== "disconnected") return null;

  return (
    <Banner tone="danger">
      <div className="flex items-center justify-between gap-4">
        <p className="text-body">{disconnectBannerMessage(retryInSec)}</p>
        <Button variant="secondary" size="sm" onClick={reconnectNow}>
          {RECONNECT_NOW_LABEL}
        </Button>
      </div>
      <p className="mt-1 text-aux text-text-faint">
        {lastUpdatedAt ? lastUpdatedLabel(formatHms(lastUpdatedAt)) : NO_DATA_YET_TEXT}
      </p>
    </Banner>
  );
}
