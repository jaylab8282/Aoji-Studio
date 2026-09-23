import { describe, expect, it } from "vitest";
import { officeSeats, seatAgentNames, type SubagentSeat } from "./officeSeats";
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
  it("[FR-007-AC1] 팀장 첫 자리, 나머지 name 오름차순, 빈 자리 칸 수 = (3 - n%3)%3", () => {
    const seats = officeSeats({ lead: "dev-lead", members: ["dev-03", "dev-01"], undefinedSubagents: [] });

    expect(seats.map((seat) => seat.kind)).toEqual(["agent", "agent", "agent"]);
    expect(seatAgentNames(seats)).toEqual(["dev-lead", "dev-01", "dev-03"]);
    expect(seats.filter((seat) => seat.kind === "empty")).toHaveLength(0);
  });

  it("[FR-007-AC1] 인원 1·2·4명 → 빈 자리 2·1·2칸", () => {
    const counts = [1, 2, 4].map((count) => {
      const members = Array.from({ length: count - 1 }, (_, index) => `dev-0${index + 1}`);
      const seats = officeSeats({ lead: "dev-lead", members, undefinedSubagents: [] });
      return seats.filter((seat) => seat.kind === "empty").length;
    });
    expect(counts).toEqual([2, 1, 2]);
  });

  it("[FR-007-AC1] 인원 0 → 빈 자리 3칸", () => {
    const seats = officeSeats({ lead: null, members: [], undefinedSubagents: [] });
    expect(seats).toHaveLength(3);
    expect(seats.every((seat) => seat.kind === "empty")).toBe(true);
  });

  it("[FR-007-AC3] 정의 없는 서브에이전트는 부모 칸 바로 다음 칸, 빈 자리 수도 서브에이전트를 포함해 계산", () => {
    const seats = officeSeats({
      lead: "dev-lead",
      members: ["dev-01"],
      undefinedSubagents: [buildSubagent({ parentAgentName: "dev-lead" })],
    });

    expect(seats.map((seat) => seat.kind)).toEqual(["agent", "subagent", "agent"]);
    expect(seats.filter((seat) => seat.kind === "empty")).toHaveLength(0);
  });

  it("[FR-007-AC3] 부모가 이 워크플로우 소속이 아니면(로비·다른 층) 칸을 만들지 않는다", () => {
    const seats = officeSeats({
      lead: "dev-lead",
      members: [],
      undefinedSubagents: [
        buildSubagent({ agentId: "sub-2", parentAgentName: "mkt-lead" }),
        buildSubagent({ agentId: "sub-3", parentAgentName: null }),
      ],
    });

    expect(seats.filter((seat) => seat.kind === "subagent")).toHaveLength(0);
    expect(seats).toHaveLength(3);
  });

  it("[FR-007-AC3] 같은 부모의 서브에이전트가 여럿이면 startedAt 오름차순", () => {
    const seats = officeSeats({
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
