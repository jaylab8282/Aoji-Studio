/**
 * 03 오피스 그리드의 칸 배치 (FR-007-AC1·AC3, ui-spec.md SCR-03). 순수 함수(ADR-15).
 *
 * - 팀장이 첫 자리, 나머지는 name 오름차순(`agentOrder`)
 * - 정의 없는 서브에이전트는 **부모 칸 바로 다음 칸**에 작은 캐릭터로 넣는다. 부모가 이 워크플로우
 *   소속이 아니면(로비 세션 부모 포함) 03에 표시하지 않는다(ADR-10, D-005)
 * - 그리드는 3열이라 마지막 줄의 남는 칸은 `빈 자리`로 채운다: (3 - n % 3) % 3
 */
import type { UndefinedSubagent } from "../../api/types";
import { agentOrder } from "./agentOrder";

export const OFFICE_COLUMNS = 3;

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

export function officeSeats({ lead, members, undefinedSubagents }: OfficeSeatsInput): Seat[] {
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

  // 인원 0이면 한 줄(3칸) 모두 `빈 자리`다(ui-spec.md SCR-03 오피스 그리드 행의 빈 열).
  const emptyCount =
    seats.length === 0 ? OFFICE_COLUMNS : (OFFICE_COLUMNS - (seats.length % OFFICE_COLUMNS)) % OFFICE_COLUMNS;
  for (let index = 0; index < emptyCount; index += 1) {
    seats.push({ kind: "empty", key: `empty:${index}` });
  }
  return seats;
}

/** 오피스 칸에서 선택할 수 있는 에이전트 name 목록(작은 캐릭터·빈 자리는 선택 대상이 아니다). */
export function seatAgentNames(seats: Seat[]): string[] {
  return seats.filter((seat): seat is AgentSeat => seat.kind === "agent").map((seat) => seat.name);
}
