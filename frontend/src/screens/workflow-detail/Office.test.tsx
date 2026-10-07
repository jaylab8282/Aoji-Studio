import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Office, OfficeSkeleton } from "./Office";
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

/** 오피스 그리드(칸 영역)만. 범례의 말풍선 견본과 글자가 섞이지 않게 한다. */
function grid(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>(".office-grid");
  if (element === null) throw new Error("office-grid 없음");
  return element;
}

describe("Office", () => {
  afterEach(() => {
    snapshotStore.reset();
    agentEventsStore.reset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("[FR-007-AC1] 캐릭터 수 = 인원, 팀장 첫 자리, 나머지 이름순, 마지막 줄 남는 칸은 빈 자리(측정 전 열 수 6 → 2칸)", () => {
    const { container } = renderOffice({
      workflow: buildWorkflow({ lead: "dev-lead", members: ["dev-03", "dev-01", "dev-02"], rawMemberCount: 4 }),
    });

    expect(container.querySelectorAll("svg[data-testid='pixel-char'][aria-hidden='true']")).toHaveLength(4);
    expect(chars(container).map((c) => c.name)).toEqual(["dev-lead", "dev-01", "dev-02", "dev-03"]);
    expect(within(grid(container)).getAllByText("빈 자리")).toHaveLength(2);
  });

  it("[FR-007-AC1] 그리드 열 수가 4면 마지막 줄이 꽉 차 빈 자리 0칸, 5명이면 3칸", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      gridTemplateColumns: "200px 200px 200px 200px",
    } as unknown as CSSStyleDeclaration);

    const full = renderOffice({
      workflow: buildWorkflow({ lead: "dev-lead", members: ["dev-01", "dev-02", "dev-03"], rawMemberCount: 4 }),
    });
    expect(within(grid(full.container)).queryAllByText("빈 자리")).toHaveLength(0);
    full.unmount();

    const partial = renderOffice({
      workflow: buildWorkflow({ lead: "dev-lead", members: ["dev-01", "dev-02", "dev-03", "dev-04"], rawMemberCount: 5 }),
    });
    expect(within(grid(partial.container)).getAllByText("빈 자리")).toHaveLength(3);
  });

  it("[FR-007-AC1] 인원 0 → 한 줄 전체(열 수만큼) '빈 자리'", () => {
    const { container } = renderOffice({
      workflow: buildWorkflow({ lead: null, members: [], rawMemberCount: 0 }),
      selectedName: null,
    });

    expect(container.querySelectorAll("svg[data-testid='pixel-char']")).toHaveLength(0);
    expect(within(grid(container)).getAllByText("빈 자리")).toHaveLength(6);
  });

  it("[FR-007-AC1] 오피스 카드 머리·그리드 클래스(office-grid)·범례 동작 매핑 견본 5개 + 작은 캐릭터 설명", () => {
    const { container } = renderOffice({});

    expect(container.querySelector("[data-wf='03-3']")).not.toBeNull();
    expect(screen.getByText("오피스")).toBeInTheDocument();
    expect(screen.getByText("에이전트 1명 = 캐릭터 1개 · 팀장 첫 자리, 나머지 이름순")).toBeInTheDocument();
    const legend = container.querySelector<HTMLElement>("[data-wf='03-7']");
    expect(legend).not.toBeNull();
    expect(legend).toHaveTextContent("동작 매핑");
    const samples = Array.from(legend?.querySelectorAll("[data-testid='bubble']") ?? []).map((el) => [
      el.textContent,
      el.getAttribute("data-tone"),
    ]);
    expect(samples).toEqual([
      ["타이핑 · Edit", "running"],
      ["읽기 · Read", "running"],
      ["권한 요청", "waiting"],
      ["대기", "idle"],
      ["Bash", "running"],
    ]);
    for (const meaning of ["Edit·Write·NotebookEdit", "Read·Grep·Glob", "권한·입력 대기", "그 밖 도구 = 도구 이름"]) {
      expect(within(legend as HTMLElement).getByText(meaning)).toBeInTheDocument();
    }
    expect(within(legend as HTMLElement).getByText("작은 캐릭터 = 정의 없는 서브에이전트")).toBeInTheDocument();
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

    const cells = within(grid(container));
    expect(cells.getByText("타이핑 · Edit")).toHaveAttribute("data-tone", "running");
    expect(cells.getByText("권한 요청")).toHaveAttribute("data-tone", "waiting");
    expect(chars(container).map((c) => c.state)).toEqual(["running", "waiting", "idle"]);
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
    const cells = within(grid(container));
    expect(cells.getByText("작업 중 · 부모 dev-lead")).toBeInTheDocument();
    expect(cells.getByText("읽기 · Grep")).toBeInTheDocument();
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

  it("[FR-007-E1] 수집 중단(collectorDown) → 모든 캐릭터 대기색·말풍선 '대기'·상태 글자 '대기'(부모 접미 없음)", () => {
    const { container } = renderOffice({
      live: buildLive({
        agents: {
          "dev-lead": buildAgentLive("dev-lead", { status: "running", currentTool: editTool, parentLabel: "[세션 1]" }),
          "dev-01": buildAgentLive("dev-01", { status: "waiting" }),
        },
        undefinedSubagents: [buildSubagent()],
      }),
      collectorDown: true,
    });

    expect(chars(container).map((c) => c.state)).toEqual(["idle", "idle", "idle", "idle"]);
    const cells = within(grid(container));
    // 캐릭터 4개마다 말풍선 `대기` + 상태 글자 `대기`
    expect(cells.getAllByText("대기")).toHaveLength(8);
    expect(cells.queryByText(/부모/)).not.toBeInTheDocument();
    expect(cells.queryByText("타이핑 · Edit")).not.toBeInTheDocument();
    expect(cells.queryByText("권한 요청")).not.toBeInTheDocument();
  });

  it("[FR-007-E1] hookConfigured false + live에 running/waiting 에이전트 → 띠 + 시각, 캐릭터·상태 글자·말풍선 모두 '대기', 패널 상태 '대기'·현재 도구 '-'", () => {
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

    expect(screen.getByTestId("collector-down-message")).toHaveTextContent(
      "hook 이벤트 수신 없음 · 마지막 수신 2026-09-22 10:30",
    );
    expect(chars(container).every((c) => c.state === "idle")).toBe(true);
    // 범례 견본(`타이핑 · Edit` 등)은 고정이라 칸 영역만 본다.
    const cells = within(grid(container));
    expect(cells.queryByText("작업 중")).not.toBeInTheDocument();
    expect(cells.queryByText("타이핑 · Edit")).not.toBeInTheDocument();
    expect(cells.queryByText("권한 요청")).not.toBeInTheDocument();
    // 패널: 상태 `대기`, 현재 도구 `-`
    expect(screen.getByText("상태").nextElementSibling).toHaveTextContent("대기");
    expect(screen.getByText("현재 도구").nextElementSibling).toHaveTextContent("-");
    // 헤더 칩은 중립 `모두 대기`(실제 값 권한 대기 1명이 아니다, ADR-68)
    expect(screen.getByText("모두 대기")).toBeInTheDocument();
    expect(screen.queryByText("권한 대기 1명")).not.toBeInTheDocument();
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

  it("[FR-007-AC1] OfficeSkeleton: 카드 머리·범례는 보이고 칸 자리만 스켈레톤(열 수만큼), 캐릭터 없음", () => {
    const { container } = render(<OfficeSkeleton />);

    expect(screen.getByText("오피스")).toBeInTheDocument();
    expect(container.querySelector("[data-wf='03-7']")).not.toBeNull();
    expect(grid(container).querySelectorAll("[data-skeleton]")).toHaveLength(6);
    expect(container.querySelectorAll("svg[data-testid='pixel-char']")).toHaveLength(0);
  });
});
