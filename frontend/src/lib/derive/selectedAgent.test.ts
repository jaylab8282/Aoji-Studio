import { describe, expect, it } from "vitest";
import { selectedAgentName } from "./selectedAgent";

describe("selectedAgentName", () => {
  it("[FR-007-AC4] 기본 선택 lead, lead 없으면 첫 자리, ?agent= 우선", () => {
    const seatAgentNames = ["dev-lead", "dev-01", "dev-02"];

    expect(selectedAgentName({ agentParam: null, lead: "dev-lead", seatAgentNames })).toBe("dev-lead");
    expect(selectedAgentName({ agentParam: null, lead: null, seatAgentNames: ["dev-01", "dev-02"] })).toBe("dev-01");
    expect(selectedAgentName({ agentParam: "dev-02", lead: "dev-lead", seatAgentNames })).toBe("dev-02");
  });

  it("[FR-007-AC4] 칸에 없는 ?agent=는 무시하고 팀장을 고른다", () => {
    expect(
      selectedAgentName({ agentParam: "mkt-lead", lead: "dev-lead", seatAgentNames: ["dev-lead", "dev-01"] }),
    ).toBe("dev-lead");
  });

  it("[FR-007-AC4] 인원 0 → null", () => {
    expect(selectedAgentName({ agentParam: null, lead: null, seatAgentNames: [] })).toBeNull();
  });
});
