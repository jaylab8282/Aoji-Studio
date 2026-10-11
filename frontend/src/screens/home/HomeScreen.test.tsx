import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { routes } from "../../app/router";
import { connectionStore } from "../../state/connectionStore";
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
    filePath: `.aojistudio/teams/${name}.json`,
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
  const view = render(<RouterProvider router={router} />);
  return Object.assign(router, { container: view.container });
}

/** 실제 라우트 구성(handle·AppShell 포함)으로 `/`를 그린다. */
function renderApp(initialPath = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return render(<RouterProvider router={router} />);
}

function agentDefs(count: number): AgentDef[] {
  return Array.from({ length: count }, (_, i) => buildAgentDef(`agent-${i}`, null));
}

function seed(options: {
  agentCount?: number;
  statuses?: Record<string, AgentLive["status"]>;
  everReceived?: boolean;
  hookConfigured?: boolean;
  lastReceivedAt?: string | null;
  workflows?: Workflow[];
  skillCount?: number;
  recentEvents?: EventRow[];
}) {
  const fixture = buildSnapshotFixture();
  const count = options.agentCount ?? 0;
  const live: Record<string, AgentLive> = {};
  for (const [name, status] of Object.entries(options.statuses ?? {})) live[name] = buildAgentLive(name, status);
  snapshotStore.replace({
    ...fixture,
    registry: {
      ...fixture.registry,
      agentCount: count,
      agents: agentDefs(count),
      skillCount: options.skillCount ?? 0,
      workflows: options.workflows ?? [],
      hookConfigured: options.hookConfigured ?? true,
    },
    live: {
      ...fixture.live,
      everReceived: options.everReceived ?? true,
      lastReceivedAt: options.lastReceivedAt ?? null,
      agents: live,
    },
    recentEvents: options.recentEvents ?? [],
  });
}

function wf(container: HTMLElement, name: string): HTMLElement | null {
  return container.querySelector(`[data-wf="${name}"]`);
}

describe("HomeScreen", () => {
  afterEach(() => {
    snapshotStore.reset();
    connectionStore.reset();
  });

  it("[FR-005-AC1] KPI 1: 수치 `3`과 `/ 10`이 두 요소, 보조 `권한·입력 대기 1 · hook 이벤트 기준`", () => {
    seed({ agentCount: 10, statuses: { "agent-0": "running", "agent-1": "running", "agent-2": "running", "agent-3": "waiting" } });

    renderHome();

    expect(screen.getByTestId("kpi-running-value")).toHaveTextContent(/^3$/);
    expect(screen.getByTestId("kpi-running-total")).toHaveTextContent(/^\/ 10$/);
    expect(screen.getByTestId("kpi-running-sub")).toHaveTextContent("권한·입력 대기 1 · hook 이벤트 기준");
    expect(screen.getByTestId("kpi-agent-count")).toHaveTextContent("10");
  });

  it("[FR-005-AC1] 실행 중 > 0이면 KPI 1 카드 테두리 live-border·수치 text-live, 대기 수 > 0이면 그 수만 text-waiting", () => {
    seed({ agentCount: 4, statuses: { "agent-0": "running", "agent-1": "waiting" } });

    renderHome();

    const card = screen.getByTestId("kpi-running-value").closest("div");
    expect(card).toHaveClass("border-live-border");
    expect(screen.getByTestId("kpi-running-value").parentElement).toHaveClass("text-live");
    const waitingCount = within(screen.getByTestId("kpi-running-sub")).getByText("1");
    expect(waitingCount).toHaveClass("text-waiting");
  });

  it("[FR-005-AC1] 실행 중 0·대기 0이면 테두리 중립, 수치 text-text, 대기 수 주황 아님", () => {
    seed({ agentCount: 4, statuses: {} });

    renderHome();

    const card = screen.getByTestId("kpi-running-value").closest("div");
    expect(card).toHaveClass("border-border");
    expect(card).not.toHaveClass("border-live-border");
    expect(screen.getByTestId("kpi-running-value").parentElement).not.toHaveClass("text-live");
    expect(within(screen.getByTestId("kpi-running-sub")).getByText("0")).not.toHaveClass("text-waiting");
  });

  it("[FR-005-AC1] KPI 보조 문구: `.claude/agents 정의 파일`·`.claude/skills 스킬 폴더`, 스킬 0도 `0`으로 보인다", () => {
    seed({ agentCount: 2, skillCount: 0 });

    renderHome();

    expect(screen.getByText(".claude/agents").parentElement).toHaveTextContent(".claude/agents 정의 파일");
    expect(screen.getByText(".claude/skills").parentElement).toHaveTextContent(".claude/skills 스킬 폴더");
    expect(screen.getByTestId("kpi-skill-count")).toHaveTextContent(/^0$/);
  });

  it("[FR-005-AC1] KPI 4 수집 상태: 수신 이력 있음 → 시안 `hook 설정됨` + `마지막 수신 <시각>`", () => {
    seed({ agentCount: 1, everReceived: true, lastReceivedAt: "2026-09-22T10:20:30+09:00" });

    renderHome();

    expect(screen.getByTestId("kpi-collector-status")).toHaveAttribute("data-stage", "live");
    expect(screen.getByTestId("kpi-collector-status")).toHaveTextContent("hook 설정됨");
    expect(screen.getByTestId("kpi-collector-status")).toHaveClass("text-live");
    expect(screen.getByTestId("kpi-collector-last")).toHaveTextContent(/^마지막 수신 \S+/);
  });

  it("[FR-005-AC1] KPI 4 수집 상태: 설정됨 + 수신 이력 없음 → 중립 `hook 설정됨` + `마지막 수신 없음`", () => {
    seed({ agentCount: 1, everReceived: false });

    renderHome();

    expect(screen.getByTestId("kpi-collector-status")).toHaveAttribute("data-stage", "neutral");
    expect(screen.getByTestId("kpi-collector-status")).toHaveTextContent("hook 설정됨");
    expect(screen.getByTestId("kpi-collector-last")).toHaveTextContent("마지막 수신 없음");
  });

  it("[FR-005-AC1] hook 설정 안 됨 → 빨강 `hook 설정 안 됨`", () => {
    seed({ agentCount: 1, hookConfigured: false, everReceived: false });

    renderHome();

    expect(screen.getByTestId("kpi-collector-status")).toHaveAttribute("data-stage", "unset");
    expect(screen.getByTestId("kpi-collector-status")).toHaveTextContent("hook 설정 안 됨");
    expect(screen.getByTestId("kpi-collector-status")).toHaveClass("text-danger");
  });

  it("[FR-005-AC2] 상태 막대 범례 수 합 = agentCount, 막대 aria-hidden·칸 폭 = 각 수 / agentCount", () => {
    seed({ agentCount: 5, statuses: { "agent-0": "running", "agent-1": "waiting" } });

    renderHome();

    // running=1, waiting=1, idle=3 → 합 5 = agentCount
    const legend = wf(document.body, "01-4");
    expect(legend).toHaveTextContent("작업 중 1");
    expect(legend).toHaveTextContent("권한·입력 대기 1");
    expect(legend).toHaveTextContent("대기 3");
    const bar = screen.getByTestId("status-bar");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    const widths = [...bar.querySelectorAll<HTMLElement>("i")].map((el) => [el.dataset.segment, el.style.getPropertyValue("--segment-width")]);
    expect(widths).toEqual([
      ["running", "20%"],
      ["waiting", "20%"],
      ["idle", "60%"],
    ]);
  });

  it("[FR-005-AC3] 대표 카드는 활성 워크플로우 먼저·최대 3장, 카드 제목은 `01-5` 안에 있다", () => {
    const workflows = ["a", "b", "c", "d"].map((name) => buildWorkflow(name, `${name}-lead`));
    seed({ agentCount: 4, workflows, statuses: { "d-lead": "running" } });

    const router = renderHome();

    const section = wf(router.container, "01-5")!;
    const titles = within(section)
      .getAllByRole("heading", { level: 3 })
      .map((el) => el.textContent);
    expect(titles).toEqual(["d", "a", "b"]);
  });

  it("[FR-005-AC5] workflows 0 → 04-7 카드 1장(`04-7-1`), 클릭 → ?dialog=workflow-add", () => {
    seed({ workflows: [] });

    const router = renderHome();

    expect(screen.getByText("아직 워크플로우가 없습니다")).toBeInTheDocument();
    expect(screen.getByText(/워크플로우를 만들면 팀장과 팀원이 층으로 보입니다/)).toBeInTheDocument();
    expect(wf(router.container, "04-7-1")).not.toBeNull();
    expect(wf(router.container, "01-5")?.querySelectorAll('[data-wf="04-7-1"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "워크플로우 추가" }));

    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toBe("?dialog=workflow-add");
  });

  it("[FR-005-AC9] ready false → KPI 4칸·막대·카드 3장·표 8줄 스켈레톤, `0` 없음, 상태 색 숨김, 정적 글자·주 동작 보임", () => {
    snapshotStore.reset();

    const router = renderHome();
    const root = router.container;

    // 값 자리는 스켈레톤이다(수치 4·보조 4 + 카드 3×4 + 막대 1 + 표 8×5).
    expect(wf(root, "01-3")!.querySelectorAll("[data-skeleton]")).toHaveLength(8);
    expect(wf(root, "01-4")!.querySelectorAll("[data-skeleton]")).toHaveLength(1);
    expect(wf(root, "01-5")!.querySelectorAll("[data-skeleton]")).toHaveLength(12);
    expect(wf(root, "01-6")!.querySelectorAll("tbody tr")).toHaveLength(8);
    expect(wf(root, "01-6")!.querySelectorAll("tbody [data-skeleton]")).toHaveLength(40);
    // 숫자 0·빈 문구를 먼저 보이지 않는다.
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText(/아직 수집된 활동이 없습니다|아직 워크플로우가 없습니다/)).not.toBeInTheDocument();
    // 상태 색(시안 테두리·범례)은 숨긴다.
    expect(root.querySelector(".border-live-border")).toBeNull();
    expect(wf(root, "01-4")).not.toHaveTextContent("작업 중");
    expect(screen.queryByTestId("connection-indicator")).not.toBeInTheDocument();
    // 정적 글자는 보인다.
    for (const text of ["에이전트 관제", "실행 중 에이전트", "에이전트 수", "스킬 수", "수집 상태", "에이전트 상태", "hook 이벤트 기준", "실시간 이벤트"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("columnheader", { name: "시각" })).toBeInTheDocument();
    expect(screen.getByText("token·key·password 같은 민감 값은 ••••••••로 가립니다")).toBeInTheDocument();
    // 값을 쓰지 않는 주 동작은 로딩 중에도 활성이다.
    expect(screen.getByRole("button", { name: "에이전트 워크플로우 열기" })).toBeEnabled();
  });

  it("[FR-005-AC9] 스냅샷이 오면 `home-skeleton`이 `home`으로 바뀌고 스켈레톤이 사라진다", () => {
    snapshotStore.reset();
    const router = renderHome();
    expect(screen.getByTestId("home-skeleton")).toBeInTheDocument();

    act(() => snapshotStore.replace(buildSnapshotFixture()));

    expect(screen.queryByTestId("home-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(router.container.querySelectorAll("[data-skeleton]")).toHaveLength(0);
  });

  it("[FR-005-AC9] ready false에서 주 동작은 /workflows로 간다", () => {
    snapshotStore.reset();

    const router = renderHome();
    fireEvent.click(screen.getByRole("button", { name: "에이전트 워크플로우 열기" }));

    expect(router.state.location.pathname).toBe("/workflows");
  });

  it("[FR-005-AC10] `에이전트 워크플로우 열기` 버튼 → /workflows", () => {
    seed({});

    const router = renderHome();
    fireEvent.click(screen.getByRole("button", { name: "에이전트 워크플로우 열기" }));

    expect(router.state.location.pathname).toBe("/workflows");
  });

  it("[FR-005-AC10] 대표 카드 전체(링크) → /workflows, `전체 보기` 링크는 없다", () => {
    seed({ agentCount: 1, workflows: [buildWorkflow("dev", "lead-1")] });

    const router = renderHome();
    expect(screen.queryByRole("link", { name: /전체 보기/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "dev · 모두 대기 · 워크플로우 보기" }));

    expect(router.state.location.pathname).toBe("/workflows");
  });

  it("[FR-005-AC7] 로비·워크플로우 밖 행 워크플로우 열 '-'", () => {
    seed({ recentEvents: [buildEvent({ workflow: null })] });

    renderHome();

    const cells = screen.getAllByRole("cell");
    // 열 순서: 시각, 워크플로우, 에이전트, 이벤트, 요약
    expect(cells[1]?.textContent).toBe("-");
  });

  it("[FR-005-AC8] 실시간 이벤트 표에 '••••••••' 있고 원문 없음", () => {
    seed({ recentEvents: [buildEvent({ summary: "export TOKEN=••••••••" })] });

    renderHome();

    expect(screen.getByText("export TOKEN=••••••••")).toHaveAttribute("title", "export TOKEN=••••••••");
  });

  it("[FR-005-E1] everReceived false → 04-1: 이벤트 카드 자리 안내 카드(`04-1-1`), 상태 막대 이유 줄(`04-1-2`), KPI 2·3 숫자 정상", () => {
    seed({ agentCount: 4, skillCount: 2, everReceived: false, hookConfigured: false });

    const router = renderHome();
    const root = router.container;

    expect(screen.getByText("아직 수집된 활동이 없습니다")).toBeInTheDocument();
    expect(wf(root, "04-1-1")).not.toBeNull();
    expect(wf(root, "01-6")).toBeNull();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(wf(root, "04-1-2")).toHaveTextContent("hook 이벤트를 받기 전이라 모든 에이전트를 대기로 표시합니다");
    expect(wf(root, "01-4")).toBeNull();
    const bar = screen.getByTestId("status-bar");
    expect([...bar.querySelectorAll<HTMLElement>("i")].map((el) => el.dataset.segment)).toEqual(["idle"]);
    expect(screen.getByTestId("kpi-agent-count")).toHaveTextContent("4");
    expect(screen.getByTestId("kpi-skill-count")).toHaveTextContent("2");
    expect(screen.getByTestId("kpi-collector-status")).toHaveTextContent("hook 설정 안 됨");
  });

  it("[FR-001-E1] agentsDirMissing → KPI 1·2 자리 04-5 2칸(`04-5-1`), `설정 열기` 있음, 상태 막대 숨김, 수치 없음", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, agentsDirMissing: true, agentCount: null, agents: [] },
    });

    const router = renderHome();
    const root = router.container;

    expect(screen.getByText("에이전트 폴더를 찾을 수 없습니다")).toBeInTheDocument();
    const card = wf(root, "04-5-1")!;
    expect(card).toHaveAttribute("role", "alert");
    expect(card.parentElement).toHaveClass("col-span-2");
    expect(wf(root, "01-3")).toContainElement(card);
    expect(within(card).getByText(`${fixture.config.hostPath}/.claude/agents`)).toBeInTheDocument();
    expect(within(card).getByText(/\.claude\/agents가 없습니다\. 폴더를 만든 뒤 다시 읽기를 누르세요/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "다시 읽기" })).toBeInTheDocument();
    // ADR-42 호출처 배선: 01은 `설정 열기`를 그린다(07만 숨긴다).
    fireEvent.click(within(card).getByRole("button", { name: "설정 열기" }));
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("[FR-001-E1] agentsDirMissing → KPI 1·2·상태 막대 없음, KPI 3·4는 남는다", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, agentsDirMissing: true, agentCount: null, agents: [] },
    });

    const router = renderHome();

    expect(screen.queryByText("실행 중 에이전트")).not.toBeInTheDocument();
    expect(screen.queryByText("에이전트 수")).not.toBeInTheDocument();
    expect(wf(router.container, "01-4")).toBeNull();
    expect(wf(router.container, "04-1-2")).toBeNull();
    expect(screen.getByText("스킬 수")).toBeInTheDocument();
    expect(screen.getByText("수집 상태")).toBeInTheDocument();
  });

  it("[FR-005-AC6] 연결 표시: connected → `실시간 연결됨`(시안), 그 외 → `연결 끊김`(빨강)", () => {
    seed({ recentEvents: [buildEvent()] });
    connectionStore.setConnected();

    renderHome();
    expect(screen.getByTestId("connection-indicator")).toHaveTextContent("실시간 연결됨");
    expect(screen.getByTestId("connection-indicator")).toHaveClass("text-live");

    act(() => connectionStore.setDisconnected(5));
    expect(screen.getByTestId("connection-indicator")).toHaveTextContent("연결 끊김");
    expect(screen.getByTestId("connection-indicator")).toHaveClass("text-danger");
  });

  it("[NFR-11] data-wf 영역 `01-1`~`01-6`이 전부 있다(상단 바 `01-1` 포함)", () => {
    seed({ agentCount: 2, workflows: [buildWorkflow("dev", "lead-1")], recentEvents: [buildEvent()] });

    const { container } = renderApp();

    for (const name of ["01-1", "01-2", "01-3", "01-4", "01-5", "01-6"]) {
      expect(wf(container, name), `data-wf=${name}`).not.toBeNull();
    }
    expect(wf(container, "01-1")?.tagName).toBe("HEADER");
  });

  it("[NFR-11] 04-1 상태에서 data-wf `04-1-1`·`04-1-2`가 있다", () => {
    seed({ agentCount: 2, everReceived: false });

    const { container } = renderApp();

    expect(wf(container, "04-1-1")).not.toBeNull();
    expect(wf(container, "04-1-2")).not.toBeNull();
  });

  it("[D-125] 셸 안의 01: `main` 1개·h1 1개(상단 바 `홈`), 화면 제목 `에이전트 관제`는 h1이 아니다", () => {
    seed({ agentCount: 2, workflows: [buildWorkflow("dev", "lead-1")], recentEvents: [buildEvent()] });

    const { container } = renderApp();

    expect(container.querySelectorAll("main")).toHaveLength(1);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("홈");
    expect(wf(container, "01-1")).toContainElement(h1s[0]!);
    expect(screen.getByRole("heading", { name: "에이전트 관제", level: 2 })).toBeInTheDocument();
  });

  it("[FR-005-AC9][D-125] 셸 안의 01도 ready 전에는 01 자체 스켈레톤(셸 공통 스켈레톤 아님), main 1개", () => {
    snapshotStore.reset();

    const { container } = renderApp();

    expect(screen.queryByTestId("app-shell-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("home-skeleton")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(wf(container, "01-3")!.querySelectorAll("[data-skeleton]")).toHaveLength(8);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
