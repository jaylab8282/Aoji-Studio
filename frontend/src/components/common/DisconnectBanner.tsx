/**
 * ui-spec.md SCR-04-3 실시간 연결 끊김 띠(`data-wf="04-3-1"`). FR-016-AC1·AC2·AC3.
 * `wifi-off` + `실시간 연결이 끊겼습니다 · N초 후 재연결`(600, N 고정폭) + `마지막 갱신 hh:mm:ss 기준 화면을 유지합니다`
 * (`text-text`, 말줄임) + 오른쪽 `danger` 버튼 `refresh-cw 지금 재연결`.
 * conventions.md §7 MUST: `AppShell`에서 한 번만 렌더링하고 모든 라우트의 상단 바 아래에 나온다.
 */
import { useConnectionStore } from "../../state/connectionStore";
import { reconnectNow } from "../../api/stream";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { formatHms } from "../../lib/format/time";
import {
  DISCONNECT_BANNER_LEAD,
  DISCONNECT_BANNER_TAIL,
  LAST_UPDATED_LEAD,
  LAST_UPDATED_TAIL,
  NO_DATA_YET_TEXT,
  RECONNECT_NOW_LABEL,
} from "../../lib/text";

export function DisconnectBanner() {
  const { state, retryInSec, lastUpdatedAt } = useConnectionStore();

  if (state !== "disconnected") return null;

  return (
    <Banner tone="danger" wf="04-3-1">
      <Icon name="wifi-off" />
      <b data-testid="disconnect-countdown" className="font-semibold">
        {DISCONNECT_BANNER_LEAD}
        <span className="font-mono">{retryInSec}</span>
        {DISCONNECT_BANNER_TAIL}
      </b>
      <span data-testid="disconnect-last-updated" className="min-w-0 truncate text-text">
        {lastUpdatedAt === null ? (
          NO_DATA_YET_TEXT
        ) : (
          <>
            {LAST_UPDATED_LEAD}
            <span className="font-mono">{formatHms(lastUpdatedAt)}</span>
            {LAST_UPDATED_TAIL}
          </>
        )}
      </span>
      <span className="flex-1" />
      <Button variant="danger" size="sm" onClick={reconnectNow}>
        <Icon name="refresh-cw" />
        {RECONNECT_NOW_LABEL}
      </Button>
    </Banner>
  );
}
