import { describe, expect, it } from "vitest";
import { featuredWorkflows } from "./featuredWorkflows";
import type { AgentLive, EventRow, Live, Registry, Status, Workflow } from "../../api/types";

function buildWorkflow(name: string, lead: string, members: string[] = []): Workflow {
  return {
    name,
    description: `${name} 설명`,
    filePath: `.aojistudio/teams/${name}.json`,
    lead,
    members,
    brokenRefs: [],
    rawMemberCount: members.length + 1,
  };
}

function buildEvent(id: number, at: string): EventRow {
  return {
    id,
    at,
    hookEventName: "PreToolUse",
    kind: "tool",
    title: "도구 실행 · Edit",
    summary: "path/to/file",
    sessionId: `session-${id}`,
    agentId: `agent-${id}`,
    agentType: "lead",
    agentLabel: "lead",
    toolName: "Edit",
    workflow: null,
  };
}

function buildAgentLive(name: string, status: Status, lastEvent: EventRow | null = null): AgentLive {
  return {
    name,
    status,
    currentTool: null,
    sessionStartedAt: null,
    childCount: 0,
    cwd: null,
    parentLabel: null,
    lastEventAt: lastEvent?.at ?? null,
    lastEvent,
  };
}

function buildRegistry(workflows: Workflow[], skillCount = 4): Registry {
  return {
    revision: 1,
    scannedAt: "2026-09-22T10:00:00+09:00",
    agentsDirMissing: false,
    writable: true,
    agentCount: workflows.length,
    skillCount,
    agents: [],
    workflows,
    formatErrors: [],
    hookConfigured: true,
  };
}

function buildLive(agents: Record<string, AgentLive>): Live {
  return {
    lastReceivedAt: null,
    everReceived: true,
    agents,
    lobby: [],
    undefinedSubagents: [],
  };
}

describe("featuredWorkflows", () => {
  it("[FR-005-AC3] 활성 워크플로우가 최근 이벤트만 있는 비활성 워크플로우보다 먼저 온다", () => {
    const activeOlder = buildWorkflow("active-older", "lead-a");
    const activeRecent = buildWorkflow("active-recent", "lead-b");
    const inactiveRecent = buildWorkflow("inactive-recent", "lead-c");
    const noEventB = buildWorkflow("no-event-b", "lead-d");
    const noEventA = buildWorkflow("no-event-a", "lead-e");

    const registry = buildRegistry([activeOlder, activeRecent, inactiveRecent, noEventB, noEventA]);
    const live = buildLive({
      "lead-a": buildAgentLive("lead-a", "running", buildEvent(1, "2026-09-22T10:01:00+09:00")),
      "lead-b": buildAgentLive("lead-b", "waiting", buildEvent(2, "2026-09-22T10:05:00+09:00")),
      "lead-c": buildAgentLive("lead-c", "idle", buildEvent(3, "2026-09-22T10:10:00+09:00")),
      "lead-d": buildAgentLive("lead-d", "idle", null),
      "lead-e": buildAgentLive("lead-e", "idle", null),
    });

    const result = featuredWorkflows(registry, live);

    expect(result.map((w) => w.name)).toEqual(["active-recent", "active-older", "inactive-recent"]);
  });

  it("[FR-005-AC3] 이벤트 없는 워크플로우끼리는 이름 오름차순", () => {
    const noEventB = buildWorkflow("b-workflow", "lead-b");
    const noEventA = buildWorkflow("a-workflow", "lead-a");

    const registry = buildRegistry([noEventB, noEventA]);
    const live = buildLive({
      "lead-a": buildAgentLive("lead-a", "idle", null),
      "lead-b": buildAgentLive("lead-b", "idle", null),
    });

    const result = featuredWorkflows(registry, live);

    expect(result.map((w) => w.name)).toEqual(["a-workflow", "b-workflow"]);
  });

  it("[FR-005-AC3] 최대 3개까지만 반환한다", () => {
    const workflows = ["w1", "w2", "w3", "w4", "w5"].map((name) => buildWorkflow(name, `lead-${name}`));
    const registry = buildRegistry(workflows);
    const live = buildLive({});

    const result = featuredWorkflows(registry, live);

    expect(result).toHaveLength(3);
  });

  it("[FR-005-AC4] 카드 스킬 수 = registry.skillCount", () => {
    const workflow = buildWorkflow("dev", "lead-1");
    const registry = buildRegistry([workflow], 7);
    const live = buildLive({ "lead-1": buildAgentLive("lead-1", "running", buildEvent(1, "2026-09-22T10:00:00+09:00")) });

    const result = featuredWorkflows(registry, live);

    expect(result[0]?.skillCount).toBe(7);
  });

  it("활성 워크플로우의 최근 활동은 소속 에이전트 중 최신 이벤트의 title·summary", () => {
    const workflow = buildWorkflow("dev", "lead-1", ["member-1"]);
    const registry = buildRegistry([workflow]);
    const olderEvent = buildEvent(1, "2026-09-22T09:00:00+09:00");
    const newerEvent = buildEvent(2, "2026-09-22T09:30:00+09:00");
    const live = buildLive({
      "lead-1": buildAgentLive("lead-1", "running", olderEvent),
      "member-1": buildAgentLive("member-1", "idle", newerEvent),
    });

    const result = featuredWorkflows(registry, live);

    expect(result[0]?.activity).toEqual({ kind: "recent", title: newerEvent.title, summary: newerEvent.summary });
  });

  it("모두 대기이고 이벤트가 있으면 마지막 활동 시각을 담는다", () => {
    const workflow = buildWorkflow("dev", "lead-1");
    const registry = buildRegistry([workflow]);
    const event = buildEvent(1, "2026-09-22T09:00:00+09:00");
    const live = buildLive({ "lead-1": buildAgentLive("lead-1", "idle", event) });

    const result = featuredWorkflows(registry, live);

    expect(result[0]?.activity).toEqual({ kind: "last", at: event.at });
  });

  it("이벤트가 전혀 없으면 activity kind가 none", () => {
    const workflow = buildWorkflow("dev", "lead-1");
    const registry = buildRegistry([workflow]);
    const live = buildLive({ "lead-1": buildAgentLive("lead-1", "idle", null) });

    const result = featuredWorkflows(registry, live);

    expect(result[0]?.activity).toEqual({ kind: "none" });
  });
});
