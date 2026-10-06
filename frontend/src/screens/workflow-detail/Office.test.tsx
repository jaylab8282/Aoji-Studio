import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Office } from "./Office";
import { WorkflowDetailScreen } from "./WorkflowDetailScreen";
import { WorkflowsScreen } from "../workflows/WorkflowsScreen";
import type { AgentDef, AgentLive, Live, Snapshot, ToolRef, UndefinedSubagent, Workflow } from "../../api/types";
import { snapshotStore } from "../../state/snapshotStore";
import { agentEventsStore } from "../../state/agentEventsStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

function buildWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "개발부서",
    description: "",
    filePath: ".aojistudio/teams/dev.json",
    lead: "dev-lead",
    members: ["dev-01", "dev-02"],
    brokenRefs: [],
    rawMemberCount: 3,
    ...overrides,
  };
}

function buildAgentLive(name: string, overrides: Partial<AgentLive> = {}): AgentLive {
  return {
    name,
    status: "idle",
    currentTool: null,
    sessionStartedAt: null,
    childCount: 0,
    cwd: null,
    parentLabel: null,
    lastEventAt: null,
    lastEvent: null,
    ...overrides,
  };
}

function buildSubagent(overrides: Partial<UndefinedSubagent> = {}): UndefinedSubagent {
  return {
    agentId: "sub-1",
    agentType: "doc-writer",
    sessionId: "s-1",
    status: "running",
    currentTool: { name: "Grep", target: "docs" },
    parentAgentName: "dev-lead",
    parentLabel: "dev-lead",
    startedAt: "2026-09-22T10:00:00+09:00",
    ...overrides,
  };
}

function buildLive(overrides: Partial<Live> = {}): Live {
  return {
    lastReceivedAt: "2026-09-22T10:00:00+09:00",
    everReceived: true,
    agents: {},
    lobby: [],
    undefinedSubagents: [],
    ...overrides,
  };
}

function renderOffice(options: { workflow?: Workflow; live?: Live; collectorDown?: boolean; selectedName?: string | null }) {
  return render(
    <Office
      workflow={options.workflow ?? buildWorkflow()}
      live={options.live ?? buildLive()}
      collectorDown={options.collectorDown ?? false}
      selectedName={options.selectedName ?? "dev-lead"}
      onSelect={() => {}}
    />,
  );
}

/** 캐릭터 칸(`data-agent-name`)과 그 안 `PixelChar`의 상태(`data-state`)·크기(`data-size`). */
function chars(container: HTMLElement): { name: string; state: string; size: string }[] {
  return Array.from(container.querySelectorAll("[data-agent-name]")).map((cell) => {
    const svg = cell.querySelector("svg[data-testid='pixel-char']");
    return {
      name: cell.getAttribute("data-agent-name") ?? "",
      state: svg?.getAttribute("data-state") ?? "",
      size: svg?.getAttribute("data-size") ?? "",
    };
  });
}

function buildDetailSnapshot(options: {
  workflow?: Workflow;
  live?: Live;
  hookConfigured?: boolean;
  agents?: AgentDef[];
}): Snapshot {
  const fixture = buildSnapshotFixture();
  const workflow = options.workflow ?? buildWorkflow();
  const names = workflow.lead ? [workflow.lead, ...workflow.members] : workflow.members;
  return {
    ...fixture,
    registry: {
      ...fixture.registry,
      hookConfigured: options.hookConfigured ?? true,
      agentCount: names.length,
      agents:
        options.agents ??
        names.map((name) => ({
          name,
          description: "",
          filePath: `.claude/agents/${name}.md`,
          workflow: workflow.name,
          role: name === workflow.lead ? ("lead" as const) : ("member" as const),
          duplicateWorkflows: [],
        })),
      workflows: [workflow],
    },
    live: options.live ?? buildLive(),
  };
}

function renderDetailScreen(path = "/workflows/개발부서") {
  const router = createMemoryRouter([{ path: "/workflows/:name", element: <WorkflowDetailScreen /> }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

const editTool: ToolRef = { name: "Edit", target: "backend/AgentController.java" };

describe("Office", () => {
  afterEach(() => {
    snapshotStore.reset();
    agentEventsStore.reset();
    vi.unstubAllGlobals();
  });

  it("[FR-007-AC1] 캐릭터 수 = 인원, 팀장 첫 자리, 빈 자리 칸 수 = (3 - n%3)%3", () => {
    const { container } = renderOffice({
      workflow: buildWorkflow({ lead: "dev-lead", members: ["dev-03", "dev-01", "dev-02"], rawMemberCount: 4 }),
    });

    expect(container.querySelectorAll("svg[data-testid='pixel-char'][aria-hidden='true']")).toHaveLength(4);
    expect(chars(container).map((c) => c.name)).toEqual([
      "dev-lead",
      "dev-01",
      "dev-02",
      "dev-03",
    ]);
    expect(screen.getAllByText("빈 자리")).toHaveLength(2);
  });

  it("[FR-007-AC1] 인원 0 → 3칸 모두 '빈 자리'", () => {
    const { container } = renderOffice({
      workflow: buildWorkflow({ lead: null, members: [], rawMemberCount: 0 }),
      selectedName: null,
    });

    expect(container.querySelectorAll("svg[data-testid='pixel-char']")).toHaveLength(0);
    expect(screen.getAllByText("빈 자리")).toHaveLength(3);
  });

  it("[FR-007-AC1] 선택 칸은 running 테두리 + running-soft 배경", () => {
    renderOffice({ selectedName: "dev-01" });

    const selected = screen.getByRole("button", { pressed: true });
    expect(selected.querySelector("[data-agent-name='dev-01']")).not.toBeNull();
    expect(selected.className).toContain("border-running");
    expect(selected.className).toContain("bg-running-soft");
  });

  it("[FR-007-AC2] 말풍선·셔츠·모니터가 상태를 따른다", () => {
    const { container } = renderOffice({
      live: buildLive({
        agents: {
          "dev-lead": buildAgentLive("dev-lead", { status: "running", currentTool: editTool }),
          "dev-01": buildAgentLive("dev-01", { status: "waiting" }),
          "dev-02": buildAgentLive("dev-02"),
        },
      }),
    });

    expect(screen.getByText("타이핑 · Edit")).toBeInTheDocument();
    expect(screen.getByText("권한 요청")).toBeInTheDocument();
    expect(chars(container).map((c) => c.state)).toEqual(["running", "waiting", "idle"]);
    expect(screen.getByText("타이핑 · Edit")).toHaveAttribute("data-tone", "running");
    expect(screen.getByText("권한 요청")).toHaveAttribute("data-tone", "waiting");
  });

  it("[FR-007-AC3] undefinedSubagents(부모 소속) → 부모 다음 칸 small, '작업 중 · 부모 <name>'", () => {
    const { container } = renderOffice({
      live: buildLive({
        agents: { "dev-lead": buildAgentLive("dev-lead", { status: "running" }) },
        undefinedSubagents: [buildSubagent()],
      }),
    });

    expect(chars(container)).toEqual([
      { name: "dev-lead", state: "running", size: "office" },
      { name: "doc-writer", state: "running", size: "sub" },
      { name: "dev-01", state: "idle", size: "office" },
      { name: "dev-02", state: "idle", size: "office" },
    ]);
    expect(screen.getByText("작업 중 · 부모 dev-lead")).toBeInTheDocument();
    expect(screen.getByText("읽기 · Grep")).toBeInTheDocument();
  });

  it("[FR-007-AC3] parentLabel → 상태 글자 뒤 '· 부모 [세션 1]'", () => {
    renderOffice({
      live: buildLive({
        agents: {
          "dev-01": buildAgentLive("dev-01", { status: "running", parentLabel: "[세션 1]" }),
        },
      }),
    });

    expect(screen.getByText("작업 중 · 부모 [세션 1]")).toBeInTheDocument();
  });

  it("[FR-007-AC3] 부모가 다른 워크플로우면 표시 안 함", () => {
    const { container } = renderOffice({
      live: buildLive({
        undefinedSubagents: [
          buildSubagent({ agentId: "sub-2", agentType: "outside-sub", parentAgentName: "mkt-lead" }),
          buildSubagent({ agentId: "sub-3", agentType: "lobby-sub", parentAgentName: null, parentLabel: "[세션 1]" }),
        ],
      }),
    });

    expect(screen.queryByText("outside-sub")).not.toBeInTheDocument();
    expect(screen.queryByText("lobby-sub")).not.toBeInTheDocument();
    expect(container.querySelectorAll("svg[data-testid='pixel-char']")).toHaveLength(3);
  });

  it("[FR-007-E1] everReceived false → 04-4 배너 '마지막 수신 없음', 모든 캐릭터 대기색·'대기' 글자", () => {
    const { container } = renderOffice({
      live: buildLive({ everReceived: false, lastReceivedAt: null }),
      collectorDown: true,
    });

    expect(screen.getByText("hook 이벤트 수신 없음 · 마지막 수신 없음")).toBeInTheDocument();
    expect(screen.getByText("Claude Code 미실행 또는 컨테이너 재시작 · 캐릭터는 모두 회색 대기")).toBeInTheDocument();
    expect(chars(container).map((c) => c.state)).toEqual(["idle", "idle", "idle"]);
    // 캐릭터마다 말풍선 `대기` + 상태 글자 `대기`
    expect(screen.getAllByText("대기")).toHaveLength(6);
  });

  it("[FR-007-E1] hookConfigured false + live에 running/waiting 에이전트 → 배너 + 시각, 캐릭터·상태 글자·말풍선 모두 '대기', 패널 상태 '대기'·현재 도구 '-'", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }))),
    );
    snapshotStore.replace(
      buildDetailSnapshot({
        hookConfigured: false,
        live: buildLive({
          lastReceivedAt: "2026-09-22T10:30:00+09:00",
          everReceived: true,
          agents: {
            "dev-lead": buildAgentLive("dev-lead", { status: "running", currentTool: editTool }),
            "dev-01": buildAgentLive("dev-01", { status: "waiting" }),
          },
        }),
      }),
    );

    const { container } = renderDetailScreen();

    expect(screen.getByText("hook 이벤트 수신 없음 · 마지막 수신 2026-09-22 10:30")).toBeInTheDocument();
    expect(chars(container).every((c) => c.state === "idle")).toBe(true);
    expect(screen.queryByText("작업 중")).not.toBeInTheDocument();
    expect(screen.queryByText("타이핑 · Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("권한 요청")).not.toBeInTheDocument();
    // 패널: 상태 `대기`, 현재 도구 `-`
    expect(screen.getByText("상태").nextElementSibling).toHaveTextContent("대기");
    expect(screen.getByText("현재 도구").nextElementSibling).toHaveTextContent("-");
  });

  it("[FR-007-E1][FR-004-AC1] 같은 스냅샷으로 02 렌더 시 실제 상태(running) 유지 — 03 표시만 고정됨을 확인", () => {
    const snapshot = buildDetailSnapshot({
      hookConfigured: false,
      live: buildLive({
        lastReceivedAt: "2026-09-22T10:30:00+09:00",
        agents: { "dev-lead": buildAgentLive("dev-lead", { status: "running", currentTool: editTool }) },
      }),
    });
    snapshotStore.replace(snapshot);

    const workflowsRouter = createMemoryRouter([{ path: "/workflows", element: <WorkflowsScreen /> }], {
      initialEntries: ["/workflows"],
    });
    const { container } = render(<RouterProvider router={workflowsRouter} />);

    // 02 층 책상: live 값 그대로 `작업 중` + running 셔츠색
    expect(screen.getAllByText("작업 중").length).toBeGreaterThan(0);
    const leadDesk = container.querySelector("[data-agent-name='dev-lead'] svg[data-testid='pixel-char']");
    expect(leadDesk).toHaveAttribute("data-state", "running");
    expect(leadDesk).toHaveAttribute("data-size", "desk");
    // 스토어 값(=API 값)도 running 그대로다
    expect(snapshotStore.getSnapshot().live?.agents["dev-lead"]?.status).toBe("running");
  });
});
