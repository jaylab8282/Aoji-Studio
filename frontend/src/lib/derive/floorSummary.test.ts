import { describe, expect, it } from "vitest";
import { floorSummary } from "./floorSummary";
import { floorSummaryLabel } from "../text";
import type { AgentLive, Workflow } from "../../api/types";

function buildWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "워크플로우A",
    description: "",
    filePath: ".jaystudio/teams/a.json",
    lead: "dev-lead",
    members: ["dev-02", "dev-03"],
    brokenRefs: [],
    rawMemberCount: 3,
    ...overrides,
  };
}

function buildAgentLive(name: string, status: AgentLive["status"]): AgentLive {
  return {
    name,
    status,
    currentTool: null,
    sessionStartedAt: null,
    childCount: 0,
    cwd: null,
    parentLabel: null,
    lastEventAt: null,
    lastEvent: null,
  };
}

describe("floorSummary", () => {
  it("[FR-006-AC5] 층 소속 에이전트 상태 집계 → running·waiting 수", () => {
    const summary = floorSummary(buildWorkflow(), {
      "dev-lead": buildAgentLive("dev-lead", "running"),
      "dev-02": buildAgentLive("dev-02", "waiting"),
      "dev-03": buildAgentLive("dev-03", "idle"),
    });

    expect(summary).toEqual({ running: 1, waiting: 1, allIdle: false });
  });

  it("[FR-006-AC5] live에 없는 에이전트는 대기, 모두 대기면 allIdle", () => {
    expect(floorSummary(buildWorkflow(), {})).toEqual({ running: 0, waiting: 0, allIdle: true });
  });

  it("[FR-006-AC5] 팀장이 없어도 팀원만 집계한다", () => {
    const summary = floorSummary(buildWorkflow({ lead: null, members: ["ops-01"], rawMemberCount: 1 }), {
      "ops-01": buildAgentLive("ops-01", "running"),
    });

    expect(summary).toEqual({ running: 1, waiting: 0, allIdle: false });
  });
});

describe("floorSummaryLabel", () => {
  it("[FR-006-AC5] '실행 중 N명 · 권한 대기 N명'", () => {
    expect(floorSummaryLabel({ running: 2, waiting: 1, allIdle: false })).toBe("실행 중 2명 · 권한 대기 1명");
  });

  it("[FR-006-AC5] 한쪽이 0이면 그 조각을 빼고, 둘 다 0이면 '모두 대기'", () => {
    expect(floorSummaryLabel({ running: 3, waiting: 0, allIdle: false })).toBe("실행 중 3명");
    expect(floorSummaryLabel({ running: 0, waiting: 2, allIdle: false })).toBe("권한 대기 2명");
    expect(floorSummaryLabel({ running: 0, waiting: 0, allIdle: true })).toBe("모두 대기");
  });
});
