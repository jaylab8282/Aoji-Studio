import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { HomeScreen } from "./HomeScreen";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import type { AgentDef, AgentLive, EventRow, Workflow } from "../../api/types";

function buildAgentDef(name: string, workflow: string | null): AgentDef {
  return { name, description: "", filePath: `.claude/agents/${name}.md`, workflow, role: null, duplicateWorkflows: [] };
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

function buildWorkflow(name: string, lead: string, members: string[] = []): Workflow {
  return {
    name,
    description: `${name} 설명`,
    filePath: `.jaystudio/teams/${name}.json`,
    lead,
    members,
    brokenRefs: [],
    rawMemberCount: members.length + 1,
  };
}

function buildEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 1,
    at: "2026-09-22T10:20:30+09:00",
    hookEventName: "PreToolUse",
    kind: "tool",
    title: "도구 실행 · Bash",
    summary: "export TOKEN=••••••••",
    sessionId: "session-1",
    agentId: "agent-1",
    agentType: "dev-lead",
    agentLabel: "dev-lead",
    toolName: "Bash",
    workflow: null,
    ...overrides,
  };
}

function renderHome(initialPath = "/") {
  const router = createMemoryRouter(
    [
      { path: "/", element: <HomeScreen /> },
      { path: "/workflows", element: <p>워크플로우 화면</p> },
      { path: "/settings", element: <p>설정 화면</p> },
    ],
    { initialEntries: [initialPath] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("HomeScreen", () => {
  afterEach(() => {
    snapshotStore.reset();
  });

  it("[FR-005-AC1] fixture 스냅샷 → '3 / 10', 권한 대기 1", () => {
    const fixture = buildSnapshotFixture();
    const agents: AgentDef[] = Array.from({ length: 10 }, (_, i) => buildAgentDef(`agent-${i}`, null));
    const live: Record<string, AgentLive> = {
      "agent-0": buildAgentLive("agent-0", "running"),
      "agent-1": buildAgentLive("agent-1", "running"),
      "agent-2": buildAgentLive("agent-2", "running"),
      "agent-3": buildAgentLive("agent-3", "waiting"),
    };
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, agentCount: 10, agents },
      live: { ...fixture.live, everReceived: true, agents: live },
    });

    renderHome();

    expect(screen.getByText("3 / 10")).toBeInTheDocument();
    expect(screen.getByText("hook 이벤트 기준 · 권한·입력 대기 1")).toBeInTheDocument();
  });

  it("[FR-005-AC2] 상태 막대 범례 수 합 = agentCount", () => {
    const fixture = buildSnapshotFixture();
    const agents: AgentDef[] = Array.from({ length: 5 }, (_, i) => buildAgentDef(`agent-${i}`, null));
    const live: Record<string, AgentLive> = {
      "agent-0": buildAgentLive("agent-0", "running"),
      "agent-1": buildAgentLive("agent-1", "waiting"),
    };
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, agentCount: 5, agents },
      live: { ...fixture.live, everReceived: true, agents: live },
    });

    renderHome();

    // running=1, waiting=1, idle=3 → 합 5 = agentCount
    expect(screen.getByText("작업 중 1")).toBeInTheDocument();
    expect(screen.getByText("입력·권한 대기 1")).toBeInTheDocument();
    expect(screen.getByText("대기 3")).toBeInTheDocument();
  });

  it("[FR-005-AC5] workflows 0 → EmptyWorkflowCard 1장, 클릭 → ?dialog=workflow-add", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [] } });

    const router = renderHome();

    expect(screen.getByText("아직 워크플로우가 없습니다")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "워크플로우 추가" }));

    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toBe("?dialog=workflow-add");
  });

  it("[FR-005-AC7] 로비·워크플로우 밖 행 워크플로우 열 '-'", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      live: { ...fixture.live, everReceived: true },
      recentEvents: [buildEvent({ workflow: null })],
    });

    renderHome();

    const cells = screen.getAllByRole("cell");
    // 열 순서: 시각, 워크플로우, 에이전트, 이벤트, 요약
    expect(cells[1]?.textContent).toBe("-");
  });

  it("[FR-005-AC8] 실시간 이벤트 표에 '••••••••' 있고 원문 없음", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      live: { ...fixture.live, everReceived: true },
      recentEvents: [buildEvent({ summary: "export TOKEN=••••••••" })],
    });

    renderHome();

    expect(screen.getByText("export TOKEN=••••••••")).toBeInTheDocument();
  });

  it("[FR-005-AC10] '에이전트 워크플로우 열기 →' 버튼 → /workflows", () => {
    snapshotStore.replace(buildSnapshotFixture());

    const router = renderHome();
    fireEvent.click(screen.getByRole("button", { name: "에이전트 워크플로우 열기 →" }));

    expect(router.state.location.pathname).toBe("/workflows");
  });

  it("[FR-005-AC10] '전체 보기 →' 링크 → /workflows", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, workflows: [buildWorkflow("dev", "lead-1")] },
    });

    const router = renderHome();
    fireEvent.click(screen.getByRole("link", { name: "전체 보기 →" }));

    expect(router.state.location.pathname).toBe("/workflows");
  });

  it("[FR-005-E1] everReceived false → NoEventsYet, KPI 2·3 숫자 정상", () => {
    const fixture = buildSnapshotFixture();
    const agents: AgentDef[] = Array.from({ length: 4 }, (_, i) => buildAgentDef(`agent-${i}`, null));
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, agentCount: 4, skillCount: 2, agents },
      live: { ...fixture.live, everReceived: false },
    });

    renderHome();

    expect(screen.getByText("아직 수집된 활동이 없습니다")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("[FR-001-E1] agentsDirMissing → KPI 1·2 자리 AgentsDirMissing, 숫자 없음", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, agentsDirMissing: true, agentCount: null, agents: [] },
    });

    renderHome();

    expect(screen.getByText("에이전트 폴더를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("실행 중 에이전트")).not.toBeInTheDocument();
    expect(screen.queryByText("에이전트 수")).not.toBeInTheDocument();
  });
});
