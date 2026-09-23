/**
 * ui-spec.md SCR-02 로비 카드. `live.lobby[]`(FR-006-AC9). session 항목(FR-003-AC5)과
 * 워크플로우 밖 에이전트 항목(FR-004-AC7)을 같은 방식("label · 상태")으로 그린다.
 * 아이콘은 `DeskSprite`가 아니라 12×16 축소 정면 아이콘(pixel-sprites.md B 좌표 그대로: 얼굴·머리카락·
 * 몸통·다리. 책상·모니터는 로비 아이콘에 없다). 제목·부제·항목은 기준 이미지대로 한 줄에 둔다.
 */
import type { LobbyEntry, Status } from "../../api/types";
import { hair, legs, shirt, skin } from "../../components/pixel/palette";
import { LOBBY_EMPTY_TEXT, LOBBY_STATUS_TEXT, LOBBY_SUBTITLE, LOBBY_TITLE } from "../../lib/text";

function LobbyIcon({ status }: { status: Status }) {
  return (
    <svg
      viewBox="0 0 16 20"
      width={12}
      height={16}
      aria-hidden="true"
      style={{ shapeRendering: "crispEdges", imageRendering: "pixelated" }}
    >
      <rect x={5} y={2} width={6} height={6} fill={skin} />
      <rect x={5} y={2} width={6} height={2} fill={hair} />
      <rect x={4} y={8} width={8} height={6} fill={shirt[status]} />
      <rect x={5} y={16} width={2} height={4} fill={legs} />
      <rect x={9} y={16} width={2} height={4} fill={legs} />
    </svg>
  );
}

function lobbyEntryLabel(entry: LobbyEntry): string {
  return `${entry.label} · ${LOBBY_STATUS_TEXT[entry.status]}`;
}

export function Lobby({ lobby }: { lobby: LobbyEntry[] }) {
  return (
    <section className="rounded-card border border-border bg-card p-card flex flex-wrap items-center gap-x-4 gap-y-2">
      <h2 className="text-section font-semibold text-text">{LOBBY_TITLE}</h2>
      <span className="text-aux text-text-faint">{LOBBY_SUBTITLE}</span>
      {lobby.length === 0 ? (
        <span className="text-body text-text-secondary">{LOBBY_EMPTY_TEXT}</span>
      ) : (
        lobby.map((entry) => (
          <span key={entry.sessionId} className="inline-flex items-center gap-1.5 text-body text-text-secondary">
            <LobbyIcon status={entry.status} />
            {lobbyEntryLabel(entry)}
          </span>
        ))
      )}
    </section>
  );
}
