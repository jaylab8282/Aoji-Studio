import { describe, expect, it } from "vitest";
import { searchWorkflows } from "./search";
import type { Workflow } from "../../api/types";

function buildWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "워크플로우A",
    description: "",
    filePath: ".jaystudio/teams/a.json",
    lead: "dev-lead",
    members: ["dev-02"],
    brokenRefs: [],
    rawMemberCount: 2,
    ...overrides,
  };
}

describe("searchWorkflows", () => {
  it("[FR-006-AC8] 워크플로우 이름 일치(대소문자 무시) → 층 전체", () => {
    const workflows = [buildWorkflow({ name: "Dev Team" })];
    const results = searchWorkflows(workflows, "dev team");
    expect(results).toHaveLength(1);
    expect(results[0]?.matchedAgentNames).toBeNull();
  });

  it("[FR-006-AC8] 에이전트 일치(대소문자 무시) → 그 층에 일치 에이전트만", () => {
    const workflows = [buildWorkflow({ name: "워크플로우A", lead: "dev-lead", members: ["dev-02", "mkt-01"] })];
    const results = searchWorkflows(workflows, "DEV");
    expect(results).toHaveLength(1);
    expect(results[0]?.matchedAgentNames).toEqual(["dev-lead", "dev-02"]);
  });

  it("[FR-006-AC8] 워크플로우 이름·에이전트 모두 불일치 → 제외", () => {
    const workflows = [buildWorkflow({ name: "워크플로우A", lead: "dev-lead", members: [] })];
    expect(searchWorkflows(workflows, "zzz")).toHaveLength(0);
  });

  it("[FR-006-AC8] 빈 검색어 → 전체 포함, 층 전체 표시", () => {
    const workflows = [buildWorkflow(), buildWorkflow({ name: "워크플로우B" })];
    const results = searchWorkflows(workflows, "");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.matchedAgentNames === null)).toBe(true);
  });
});
