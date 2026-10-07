/**
 * 03 오피스 그리드의 칸 배치 (FR-007-AC1·AC3, ui-spec.md SCR-03). 순수 함수(ADR-15).
 *
 * - 팀장이 첫 자리, 나머지는 name 오름차순(`agentOrder`)
 * - 정의 없는 서브에이전트는 **부모 칸 바로 다음 칸**에 작은 캐릭터로 넣는다. 부모가 이 워크플로우
 *   소속이 아니면(로비 세션 부모 포함) 03에 표시하지 않는다(ADR-10, D-005)
 * - 마지막 줄의 남는 칸은 모두 `빈 자리`로 채운다: (columns - n % columns) % columns, 인원 0이면 한 줄 전체.
 *   열 수는 CSS(`office-grid`)가 정하므로 화면이 그리드에서 읽어 `columns`로 넘긴다(ADR-66)
 */
import type { UndefinedSubagent } from "../../api/types";
import { agentOrder } from "./agentOrder";

export interface AgentSeat {
  kind: "agent";
  key: string;
  name: string;
  isLead: boolean;
}
export interface SubagentSeat {
  kind: "subagent";
  key: string;
  subagent: UndefinedSubagent;
}
export interface EmptySeat {
  kind: "empty";
  key: string;
}
export type Seat = AgentSeat | SubagentSeat | EmptySeat;

export interface OfficeSeatsInput {
  lead: string | null;
  members: string[];
  undefinedSubagents: UndefinedSubagent[];
}

function compareSubagents(a: UndefinedSubagent, b: UndefinedSubagent): number {
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? -1 : 1;
  return a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0;
}

export interface OfficeSeatsFillInput extends OfficeSeatsInput {
  /** 오피스 그리드의 현재 열 수(1~6). */
  columns: number;
}

/** 에이전트·정의 없는 서브에이전트 칸만(빈 자리 없음). 선택 대상 판정에 쓴다. */
export function agentSeats({ lead, members, undefinedSubagents }: OfficeSeatsInput): Seat[] {
  const names = agentOrder({ lead, members });
  const seats: Seat[] = [];

  for (const name of names) {
    seats.push({ kind: "agent", key: `agent:${name}`, name, isLead: name === lead });
    const children = undefinedSubagents
      .filter((subagent) => subagent.parentAgentName === name)
      .sort(compareSubagents);
    for (const subagent of children) {
      seats.push({ kind: "subagent", key: `subagent:${subagent.agentId}`, subagent });
    }
  }

  return seats;
}

/** 칸 배치 전부: `agentSeats` + 마지막 줄 `빈 자리`(인원 0이면 한 줄 전체, ui-spec SCR-03 빈 자리 칸 행). */
export function officeSeats({ columns, ...input }: OfficeSeatsFillInput): Seat[] {
  const seats = agentSeats(input);
  const perRow = Math.max(1, columns);
  const emptyCount = seats.length === 0 ? perRow : (perRow - (seats.length % perRow)) % perRow;
  for (let index = 0; index < emptyCount; index += 1) {
    seats.push({ kind: "empty", key: `empty:${index}` });
  }
  return seats;
}

/** 오피스 칸에서 선택할 수 있는 에이전트 name 목록(작은 캐릭터·빈 자리는 선택 대상이 아니다). */
export function seatAgentNames(seats: Seat[]): string[] {
  return seats.filter((seat): seat is AgentSeat => seat.kind === "agent").map((seat) => seat.name);
}
