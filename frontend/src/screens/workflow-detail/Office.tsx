/**
 * ui-spec.md SCR-03 오피스 카드: 제목 → 3열 그리드(캐릭터·작은 캐릭터·빈 자리) → 동작 매핑 범례.
 * 04-4 배너(FR-007-E1)는 카드 위에 나온다.
 *
 * 칸 배치는 `lib/derive/officeSeats.ts`, 말풍선 문구는 `lib/derive/actionLabel.ts`,
 * 04-4 표시 고정은 `lib/derive/collectorDown.ts`가 맡는다(conventions.md §3 MUST: 컴포넌트에서 집계·라벨 금지).
 */
import type { AgentLive, Live, Status, Workflow } from "../../api/types";
import { OfficeSprite } from "../../components/pixel/OfficeSprite";
import { actionLabel } from "../../lib/derive/actionLabel";
import { displayStatus } from "../../lib/derive/collectorDown";
import { officeSeats, type Seat } from "../../lib/derive/officeSeats";
import {
  EMPTY_SEAT_TEXT,
  OFFICE_LEGEND_IDLE,
  OFFICE_LEGEND_READING,
  OFFICE_LEGEND_SUBAGENT,
  OFFICE_LEGEND_TITLE,
  OFFICE_LEGEND_TYPING,
  OFFICE_LEGEND_WAITING,
  OFFICE_SUBTITLE,
  OFFICE_TITLE,
  agentStatusWithParent,
} from "../../lib/text";
import { CollectorDownBanner } from "./CollectorDownBanner";

const IDLE_STATUS: Status = "idle";

function liveOf(agents: Record<string, AgentLive>, name: string): Pick<AgentLive, "status" | "currentTool" | "parentLabel"> {
  const agent = agents[name];
  if (agent === undefined) return { status: IDLE_STATUS, currentTool: null, parentLabel: null };
  return { status: agent.status, currentTool: agent.currentTool, parentLabel: agent.parentLabel };
}

interface OfficeProps {
  workflow: Workflow;
  live: Live;
  /** 04-4 표시 중이면 캐릭터·말풍선·상태 글자를 모두 대기로 고정한다(ADR-17). */
  collectorDown: boolean;
  selectedName: string | null;
  onSelect: (name: string) => void;
}

export function Office({ workflow, live, collectorDown, selectedName, onSelect }: OfficeProps) {
  const seats = officeSeats({
    lead: workflow.lead,
    members: workflow.members,
    undefinedSubagents: live.undefinedSubagents,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {collectorDown ? <CollectorDownBanner lastReceivedAt={live.lastReceivedAt} /> : null}

      <section className="flex min-h-0 flex-1 flex-col rounded-card border border-border bg-card">
        <div className="flex items-baseline gap-3 border-b border-border px-card py-3">
          <h2 className="text-section font-semibold text-text">{OFFICE_TITLE}</h2>
          <p className="text-aux text-text-muted">{OFFICE_SUBTITLE}</p>
        </div>

        <div className="office-grid min-h-0 flex-1 overflow-auto bg-inset p-5">
          <div className="grid grid-cols-3 gap-4">
            {seats.map((seat) => (
              <SeatCell
                key={seat.key}
                seat={seat}
                live={live}
                collectorDown={collectorDown}
                selectedName={selectedName}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border px-card py-3">
          <span className="text-body font-semibold text-text">{OFFICE_LEGEND_TITLE}</span>
          <span className="text-aux text-text-muted">{OFFICE_LEGEND_TYPING}</span>
          <span className="text-aux text-text-muted">{OFFICE_LEGEND_READING}</span>
          <span className="text-aux font-semibold text-waiting">{OFFICE_LEGEND_WAITING}</span>
          <span className="text-aux text-text-muted">{OFFICE_LEGEND_IDLE}</span>
          <span className="text-aux text-text-muted">{OFFICE_LEGEND_SUBAGENT}</span>
        </div>
      </section>
    </div>
  );
}

const CELL_CLASSES = "flex min-h-48 flex-col items-center justify-center rounded-card border p-4";

interface SeatCellProps {
  seat: Seat;
  live: Live;
  collectorDown: boolean;
  selectedName: string | null;
  onSelect: (name: string) => void;
}

function SeatCell({ seat, live, collectorDown, selectedName, onSelect }: SeatCellProps) {
  if (seat.kind === "empty") {
    return (
      <div className={`${CELL_CLASSES} border-dashed border-border-dashed bg-inset`}>
        <span className="text-body text-text-faint">{EMPTY_SEAT_TEXT}</span>
      </div>
    );
  }

  if (seat.kind === "subagent") {
    const { subagent } = seat;
    const status = displayStatus(subagent.status, collectorDown);
    return (
      <div className={`${CELL_CLASSES} border-border bg-card-alt`}>
        <OfficeSprite
          small
          name={subagent.agentType}
          status={status}
          action={actionLabel(status, collectorDown ? null : subagent.currentTool)}
          statusText={agentStatusWithParent(status, collectorDown ? null : subagent.parentLabel)}
        />
      </div>
    );
  }

  const agent = liveOf(live.agents, seat.name);
  const status = displayStatus(agent.status, collectorDown);
  const selected = selectedName === seat.name;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(seat.name)}
      // 비선택 칸의 hover·`:focus-visible`은 `bg-selected`, 선택된 칸에는 hover 표현이 없다(ADR-46 A ①).
      className={`${CELL_CLASSES} ${selected ? "border-running bg-running-soft" : "border-border bg-card-alt hover:bg-selected focus-visible:bg-selected"}`}
    >
      <OfficeSprite
        name={seat.name}
        isLead={seat.isLead}
        status={status}
        action={actionLabel(status, collectorDown ? null : agent.currentTool)}
        statusText={agentStatusWithParent(status, collectorDown ? null : agent.parentLabel)}
      />
    </button>
  );
}
