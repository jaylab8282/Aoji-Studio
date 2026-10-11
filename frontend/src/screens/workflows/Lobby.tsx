/**
 * ui-spec.md SCR-02 로비 카드(`02-4`). `live.lobby[]`(FR-006-AC9): session 항목(FR-003-AC5)과 워크플로우 밖
 * 에이전트 항목(FR-004-AC7)을 같은 칩 `<label> · <상태>`로 그린다. 칩 색 = 상태(작업 중 시안, 입력 대기 주황, 대기 중립),
 * 상태 글자(`작업 중`/`입력 대기`/`대기`, ADR-26)가 항상 함께 있다. 칩은 클릭 동작이 없어 hover를 주지 않는다(ADR-69).
 * 카드 한 줄: 제목 + 설명(말줄임) + 세로 구분선 + 칩들. 세션 0개면 칩 자리에 `실행 중인 메인 세션 없음`.
 */
import type { LobbyEntry, Status } from "../../api/types";
import { Chip, type ChipTone } from "../../components/ui/Chip";
import { StatusDot } from "../../components/ui/StatusDot";
import { LOBBY_EMPTY_TEXT, LOBBY_STATUS_TEXT, LOBBY_SUBTITLE, LOBBY_TITLE } from "../../lib/text";

const CHIP_TONE: Record<Status, ChipTone> = {
  running: "live",
  waiting: "waiting",
  idle: "neutral",
};

export function Lobby({ lobby }: { lobby: LobbyEntry[] }) {
  return (
    <section
      aria-label="로비"
      data-wf="02-4"
      className="flex min-h-lobby min-w-0 flex-none items-center gap-3 rounded-card border border-border bg-card px-4 py-2"
    >
      <h2 className="flex-none text-body font-semibold whitespace-nowrap text-text">{LOBBY_TITLE}</h2>
      <span data-clamp className="min-w-0 truncate text-aux text-text-muted" title={LOBBY_SUBTITLE}>
        {LOBBY_SUBTITLE}
      </span>
      <span aria-hidden="true" className="h-5 w-px flex-none bg-border" />
      {lobby.length === 0 ? (
        <span className="text-aux whitespace-nowrap text-text-muted">{LOBBY_EMPTY_TEXT}</span>
      ) : (
        <div className="flex min-w-0 flex-wrap gap-2">
          {lobby.map((entry) => (
            <Chip key={entry.sessionId} tone={CHIP_TONE[entry.status]} data-testid="lobby-chip">
              <StatusDot status={entry.status} />
              <span>
                <span className="font-mono">{entry.label}</span>
                {` · ${LOBBY_STATUS_TEXT[entry.status]}`}
              </span>
            </Chip>
          ))}
        </div>
      )}
    </section>
  );
}
