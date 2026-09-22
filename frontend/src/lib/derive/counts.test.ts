import { describe, expect, it } from "vitest";
import { countAllStatuses, countWorkflowStatuses } from "./counts";
import type { AgentDef, AgentLive, Registry, Workflow } from "../../api/types";

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

function buildAgentDef(name: string, workflow: string | null): AgentDef {
  return {
    name,
    description: "",
    filePath: `.claude/agents/${name}.md`,
    workflow,
    role: null,
    duplicateWorkflows: [],
  };
}

describe("counts", () => {
  it("[FR-005-AC1][FR-005-AC2] running/waiting/idle 합 = registry.agentCount", () => {
    const registry: Registry = {
      revision: 1,
      scannedAt: "2026-09-22T10:00:00+09:00",
      agentsDirMissing: false,
      writable: true,
      agentCount: 3,
      skillCount: 0,
      agents: [buildAgentDef("architect", "개발부서"), buildAgentDef("qa", "개발부서"), buildAgentDef("idle-agent", null)],
      workflows: [],
      formatErrors: [],
      hookConfigured: true,
    };
    const liveAgents: Record<string, AgentLive> = {
      architect: buildAgentLive("architect", "running"),
      qa: buildAgentLive("qa", "waiting"),
      "idle-agent": buildAgentLive("idle-agent", "idle"),
    };

    const counts = countAllStatuses(registry, liveAgents);

    expect(counts).toEqual({ running: 1, waiting: 1, idle: 1 });
    expect(counts.running + counts.waiting + counts.idle).toBe(registry.agentCount);
  });

  it("[FR-005-AC1] live.agents에 없는 에이전트는 idle로 센다", () => {
    const registry: Registry = {
      revision: 1,
      scannedAt: "2026-09-22T10:00:00+09:00",
      agentsDirMissing: false,
      writable: true,
      agentCount: 1,
      skillCount: 0,
      agents: [buildAgentDef("no-events", "개발부서")],
      workflows: [],
      formatErrors: [],
      hookConfigured: true,
    };

    const counts = countAllStatuses(registry, {});

    expect(counts).toEqual({ running: 0, waiting: 0, idle: 1 });
  });

  it("[FR-006-AC5] 워크플로우별 집계: 팀장+팀원 기준", () => {
    const workflow: Workflow = {
      name: "개발부서",
      description: "",
      filePath: ".jaystudio/teams/개발부서.json",
      lead: "architect",
      members: ["qa", "backend-dev"],
      brokenRefs: [],
      rawMemberCount: 3,
    };
    const liveAgents: Record<string, AgentLive> = {
      architect: buildAgentLive("architect", "running"),
      qa: buildAgentLive("qa", "waiting"),
      "backend-dev": buildAgentLive("backend-dev", "idle"),
      "other-workflow-agent": buildAgentLive("other-workflow-agent", "running"),
    };

    const counts = countWorkflowStatuses(workflow, liveAgents);

    expect(counts).toEqual({ running: 1, waiting: 1, idle: 1 });
    expect(counts.running + counts.waiting + counts.idle).toBe(3);
  });

  it("[FR-006-AC5] 팀장 없는 워크플로우는 팀원 수만 센다", () => {
    const workflow: Workflow = {
      name: "무팀장부서",
      description: "",
      filePath: ".jaystudio/teams/무팀장부서.json",
      lead: null,
      members: ["only-member"],
      brokenRefs: [],
      rawMemberCount: 1,
    };
    const liveAgents: Record<string, AgentLive> = {
      "only-member": buildAgentLive("only-member", "running"),
    };

    const counts = countWorkflowStatuses(workflow, liveAgents);

    expect(counts).toEqual({ running: 1, waiting: 0, idle: 0 });
  });
});
