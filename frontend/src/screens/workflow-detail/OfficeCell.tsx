/**
 * ui-spec.md SCR-03 오피스 칸 (`03-4` 캐릭터 칸 · `03-5` 정의 없는 서브에이전트 칸 · `03-6` 빈 자리), ADR-67·ADR-68·ADR-69.
 * FR-007-AC1·AC2·AC3. 칸 높이 180은 `office-grid`가 정한다.
 *
 * - 캐릭터 칸: 왼쪽 위 `팀장` 배지, 말풍선(`Bubble`) → `PixelChar office`(88) → name(고정폭, 말줄임 + `title`) → 상태 줄.
 *   누르면 선택(`aria-pressed`). 선택 칸 = `brand-blue` 2px(테두리 + inset 1px) + `action-soft`, hover = 테두리 `border-dashed`.
 * - 정의 없는 서브에이전트 칸: 같은 크기, `PixelChar sub`(66). 정의 파일이 없어 선택·hover 없음.
 * - 빈 자리: 점선 칸, 바탕·클릭·hover 없음.
 * 04-4 동안은 호출부가 표시 상태를 `idle`로 고정해 넘긴다(`displayStatus`, ADR-68). 말풍선 문구는 `actionLabel.ts`가 정한다.
 */
import type { ReactNode } from "react";
import type { AgentLive, Live, Status } from "../../api/types";
import { Bubble } from "../../components/pixel/Bubble";
import { PixelChar } from "../../components/pixel/PixelChar";
import { Badge } from "../../components/ui/Badge";
import { StatusDot } from "../../components/ui/StatusDot";
import { actionLabel } from "../../lib/derive/actionLabel";
import { displayStatus } from "../../lib/derive/collectorDown";
import type { Seat } from "../../lib/derive/officeSeats";
import { EMPTY_SEAT_TEXT, LEAD_BADGE_TEXT, agentStatusWithParent, seatLabel } from "../../lib/text";

const IDLE_STATUS: Status = "idle";

const STATUS_TEXT_CLASSES: Record<Status, string> = {
  running: "text-live",
  waiting: "text-waiting",
  idle: "text-text-muted",
};

const CELL_BASE = "relative grid min-w-0 content-center justify-items-center gap-1 rounded-card border p-2";

function liveOf(
  agents: Record<string, AgentLive>,
  name: string,
): Pick<AgentLive, "status" | "currentTool" | "parentLabel"> {
  const agent = agents[name];
  if (agent === undefined) return { status: IDLE_STATUS, currentTool: null, parentLabel: null };
  return { status: agent.status, currentTool: agent.currentTool, parentLabel: agent.parentLabel };
}

interface FigureProps {
  name: string;
  status: Status;
  tool: AgentLive["currentTool"];
  statusText: string;
  small?: boolean;
}

/** 말풍선 → 캐릭터 → name → 상태 줄(상태 사각형 + 글자). */
function Figure({ name, status, tool, statusText, small = false }: FigureProps): ReactNode {
  const action = actionLabel(status, tool);
  return (
    <>
      <Bubble tone={action.tone}>{action.label}</Bubble>
      <PixelChar status={status} size={small ? "sub" : "office"} />
      <span title={name} data-clamp="" className="block max-w-full truncate font-mono text-aux text-text-mono">
        {name}
      </span>
      <span
        title={statusText}
        data-clamp=""
        className={`block max-w-full truncate text-center text-min font-semibold ${STATUS_TEXT_CLASSES[status]}`}
      >
        <span className="mr-1 inline-block align-middle">
          <StatusDot status={status} />
        </span>
        {statusText}
      </span>
    </>
  );
}

interface OfficeCellProps {
  seat: Seat;
  live: Live;
  /** 04-4 표시 중이면 캐릭터·말풍선·상태 글자를 모두 대기로 고정한다(ADR-68). */
  collectorDown: boolean;
  selectedName: string | null;
  onSelect: (name: string) => void;
}

export function OfficeCell({ seat, live, collectorDown, selectedName, onSelect }: OfficeCellProps) {
  if (seat.kind === "empty") {
    return (
      <div
        data-wf="03-6"
        className="grid min-w-0 place-content-center rounded-card border border-dashed border-border-dashed text-aux text-text-muted"
      >
        {EMPTY_SEAT_TEXT}
      </div>
    );
  }

  if (seat.kind === "subagent") {
    const { subagent } = seat;
    const status = displayStatus(subagent.status, collectorDown);
    const statusText = agentStatusWithParent(status, collectorDown ? null : subagent.parentLabel);
    const label = seatLabel(subagent.agentType, statusText);
    return (
      <div
        role="group"
        title={label}
        aria-label={label}
        data-wf="03-5"
        data-agent-name={subagent.agentType}
        className={`${CELL_BASE} cursor-default border-border bg-card`}
      >
        <Figure
          small
          name={subagent.agentType}
          status={status}
          tool={collectorDown ? null : subagent.currentTool}
          statusText={statusText}
        />
      </div>
    );
  }

  const agent = liveOf(live.agents, seat.name);
  const status = displayStatus(agent.status, collectorDown);
  const statusText = agentStatusWithParent(status, collectorDown ? null : agent.parentLabel);
  const label = seatLabel(seat.name, statusText);
  const selected = selectedName === seat.name;

  return (
    <button
      type="button"
      aria-pressed={selected}
      title={label}
      aria-label={label}
      data-wf="03-4"
      data-agent-name={seat.name}
      onClick={() => onSelect(seat.name)}
      className={`${CELL_BASE} cursor-pointer transition-colors duration-120 ease-standard ${
        selected
          ? "border-brand-blue bg-action-soft office-cell-selected"
          : "border-border bg-card hover:border-border-dashed"
      }`}
    >
      {seat.isLead ? (
        <span className="absolute top-2 left-2">
          <Badge>{LEAD_BADGE_TEXT}</Badge>
        </span>
      ) : null}
      <Figure name={seat.name} status={status} tool={collectorDown ? null : agent.currentTool} statusText={statusText} />
    </button>
  );
}
