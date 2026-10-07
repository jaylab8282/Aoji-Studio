import { describe, expect, it } from "vitest";
import { agentSeats, officeSeats, seatAgentNames, type SubagentSeat } from "./officeSeats";
import type { UndefinedSubagent } from "../../api/types";

function buildSubagent(overrides: Partial<UndefinedSubagent> = {}): UndefinedSubagent {
  return {
    agentId: "sub-1",
    agentType: "doc-writer",
    sessionId: "s-1",
    status: "running",
    currentTool: null,
    parentAgentName: "dev-lead",
    parentLabel: "dev-lead",
    startedAt: "2026-09-22T10:00:00+09:00",
    ...overrides,
  };
}

describe("officeSeats", () => {
  it("[FR-007-AC1][FR-007-AC3] 팀장 첫 자리, 나머지 name 오름차순", () => {
    const seats = agentSeats({ lead: "dev-lead", members: ["dev-03", "dev-01"], undefinedSubagents: [] });

    expect(seats.map((seat) => seat.kind)).toEqual(["agent", "agent", "agent"]);
    expect(seatAgentNames(seats)).toEqual(["dev-lead", "dev-01", "dev-03"]);
  });

  it("[FR-007-AC1] 마지막 줄의 남는 칸 모두 빈 자리: 열 수 6·4·3에서 인원 1·5·6명", () => {
    const empties = (people: number, columns: number) => {
      const members = Array.from({ length: people - 1 }, (_, index) => `dev-0${index + 1}`);
      const seats = officeSeats({ lead: "dev-lead", members, undefinedSubagents: [], columns });
      expect(seats.slice(0, people).every((seat) => seat.kind === "agent")).toBe(true);
      return seats.filter((seat) => seat.kind === "empty").length;
    };
    expect(empties(1, 6)).toBe(5);
    expect(empties(5, 4)).toBe(3);
    expect(empties(6, 3)).toBe(0);
    expect(empties(6, 6)).toBe(0);
    expect(empties(7, 6)).toBe(5);
  });

  it("[FR-007-AC1] 마지막 줄이 꽉 차면 빈 자리 없음, 인원 0 → 한 줄 전체(열 수만큼) 빈 자리", () => {
    const full = officeSeats({ lead: "dev-lead", members: ["dev-01", "dev-02"], undefinedSubagents: [], columns: 3 });
    expect(full.filter((seat) => seat.kind === "empty")).toHaveLength(0);

    for (const columns of [3, 4, 6]) {
      const seats = officeSeats({ lead: null, members: [], undefinedSubagents: [], columns });
      expect(seats).toHaveLength(columns);
      expect(seats.every((seat) => seat.kind === "empty")).toBe(true);
    }
  });

  it("[FR-007-AC3] 정의 없는 서브에이전트는 부모 칸 바로 다음 칸, 빈 자리 수도 서브에이전트를 포함해 계산", () => {
    const input = {
      lead: "dev-lead",
      members: ["dev-01"],
      undefinedSubagents: [buildSubagent({ parentAgentName: "dev-lead" })],
    };
    const seats = officeSeats({ ...input, columns: 4 });

    expect(seats.map((seat) => seat.kind)).toEqual(["agent", "subagent", "agent", "empty"]);
    expect(agentSeats(input).map((seat) => seat.kind)).toEqual(["agent", "subagent", "agent"]);
  });

  it("[FR-007-AC3] 부모가 이 워크플로우 소속이 아니면(로비·다른 층) 칸을 만들지 않는다", () => {
    const seats = officeSeats({
      lead: "dev-lead",
      members: [],
      undefinedSubagents: [
        buildSubagent({ agentId: "sub-2", parentAgentName: "mkt-lead" }),
        buildSubagent({ agentId: "sub-3", parentAgentName: null }),
      ],
      columns: 3,
    });

    expect(seats.filter((seat) => seat.kind === "subagent")).toHaveLength(0);
    expect(seats).toHaveLength(3);
  });

  it("[FR-007-AC3] 같은 부모의 서브에이전트가 여럿이면 startedAt 오름차순", () => {
    const seats = agentSeats({
      lead: "dev-lead",
      members: [],
      undefinedSubagents: [
        buildSubagent({ agentId: "sub-b", agentType: "later", startedAt: "2026-09-22T10:05:00+09:00" }),
        buildSubagent({ agentId: "sub-a", agentType: "earlier", startedAt: "2026-09-22T10:01:00+09:00" }),
      ],
    });

    const subagentTypes = seats
      .filter((seat): seat is SubagentSeat => seat.kind === "subagent")
      .map((seat) => seat.subagent.agentType);
    expect(subagentTypes).toEqual(["earlier", "later"]);
  });
});
