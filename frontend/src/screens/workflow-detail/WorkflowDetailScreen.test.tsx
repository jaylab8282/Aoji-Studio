import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowDetailScreen } from "./WorkflowDetailScreen";
import { routes } from "../../app/router";
import type { AgentDef, Live, Snapshot, Workflow } from "../../api/types";
import { agentEventsStore } from "../../state/agentEventsStore";
import { snapshotStore } from "../../state/snapshotStore";
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

function buildAgentDef(name: string, workflow: string): AgentDef {
  return {
    name,
    description: "",
    filePath: `.claude/agents/${name}.md`,
    workflow,
    role: name.endsWith("lead") ? "lead" : "member",
    duplicateWorkflows: [],
  };
}

const emptyLive: Live = {
  lastReceivedAt: "2026-09-22T10:00:00+09:00",
  everReceived: true,
  agents: {},
  lobby: [],
  undefinedSubagents: [],
};

function buildSnapshot(workflows: Workflow[]): Snapshot {
  const fixture = buildSnapshotFixture();
  const names = workflows.flatMap((workflow) => [
    ...(workflow.lead === null ? [] : [workflow.lead]),
    ...workflow.members,
  ]);
  return {
    ...fixture,
    registry: {
      ...fixture.registry,
      agentCount: names.length,
      agents: names.map((name) => buildAgentDef(name, workflows[0]?.name ?? "")),
      workflows,
    },
    live: emptyLive,
  };
}

function renderDetail(path = "/workflows/개발부서") {
  const router = createMemoryRouter([{ path: "/workflows/:name", element: <WorkflowDetailScreen /> }], {
    initialEntries: [path],
  });
  const result = render(<RouterProvider router={router} />);
  return { ...result, router };
}

describe("WorkflowDetailScreen", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }))),
    );
  });

  afterEach(() => {
    snapshotStore.reset();
    agentEventsStore.reset();
    vi.unstubAllGlobals();
  });

  it("[FR-007-AC4] 기본 선택은 팀장이고 선택 칸이 오피스에 표시된다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow()]));

    renderDetail();

    const selected = screen.getByRole("button", { pressed: true });
    expect(selected).toHaveAttribute("data-agent-name", "dev-lead");
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC4] 팀장이 없으면 첫 자리 에이전트가 선택된다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow({ lead: null, members: ["dev-02", "dev-01"] })]));

    renderDetail();

    const selected = screen.getByRole("button", { pressed: true });
    expect(selected).toHaveAttribute("data-agent-name", "dev-01");
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC4] ?agent=가 있으면 그 에이전트가 선택된다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow()]));

    renderDetail("/workflows/개발부서?agent=dev-02");

    const selected = screen.getByRole("button", { pressed: true });
    expect(selected).toHaveAttribute("data-agent-name", "dev-02");
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC4] 칸을 클릭하면 ?agent=가 바뀌고 패널이 갱신된다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow()]));

    const { router } = renderDetail();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());

    const cell = document.querySelector("[data-agent-name='dev-01']")?.closest("button") ?? null;
    expect(cell).not.toBeNull();
    fireEvent.click(cell as HTMLButtonElement);

    expect(router.state.location.search).toBe("?agent=dev-01");
    expect(screen.getByText(".claude/agents/dev-01.md")).toBeInTheDocument();
  });

  it("[FR-007-E2] 없는 이름 → NoticeCard error(role=alert) + '에이전트 워크플로우로' 버튼 → /workflows", () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow({ name: "마케팅부서" })]));

    const { router } = renderDetail();

    expect(screen.getByRole("alert")).toHaveAttribute("data-kind", "error");
    expect(screen.getByText("워크플로우를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("오피스")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "에이전트 워크플로우로" }));
    expect(router.state.location.pathname).toBe("/workflows");
  });

  it("[FR-017-AC4] 열린 탭에서 워크플로우가 삭제되면(registry 갱신) '워크플로우를 찾을 수 없습니다'", async () => {
    const snapshot = buildSnapshot([buildWorkflow()]);
    snapshotStore.replace(snapshot);

    renderDetail();
    expect(screen.getByText("오피스")).toBeInTheDocument();

    act(() => {
      snapshotStore.setRegistry({ ...snapshot.registry, revision: 2, workflows: [], agents: [] });
    });

    expect(screen.getByText("워크플로우를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("오피스")).not.toBeInTheDocument();
  });

  it("[FR-007-AC1] 오피스 카드·동작 매핑 범례·선택 패널 구성을 그린다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow()]));

    renderDetail();

    expect(screen.getByText("오피스")).toBeInTheDocument();
    expect(screen.getByText("에이전트 1명 = 캐릭터 1개 · 팀장 첫 자리, 나머지 이름순")).toBeInTheDocument();
    expect(screen.getByText("동작 매핑")).toBeInTheDocument();
    expect(screen.getByText("Edit·Write·NotebookEdit")).toBeInTheDocument();
    expect(screen.getByText("Read·Grep·Glob")).toBeInTheDocument();
    expect(screen.getByText("권한·입력 대기")).toBeInTheDocument();
    expect(screen.getByText("그 밖 도구 = 도구 이름")).toBeInTheDocument();
    expect(screen.getByText("작은 캐릭터 = 정의 없는 서브에이전트")).toBeInTheDocument();
    expect(screen.getByText("선택한 에이전트")).toBeInTheDocument();
    expect(screen.getByText("기본 선택 = 팀장")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[NFR-11][FR-007-AC1] data-wf 03-1~03-9·04-4-1 존재, 화면 <main> 없음(셸 하나)·h1 하나(D-125), 03 로딩 스켈레톤 후 값", async () => {
    const snapshot = buildSnapshot([buildWorkflow()]);
    // 04-4 조건(hook 설정 없음)이라 띠(04-4-1)도 나온다. 빈 칸 자리(03-6)는 열 수 6에서 5칸.
    snapshotStore.replace({ ...snapshot, registry: { ...snapshot.registry, hookConfigured: false } });
    const router = createMemoryRouter(routes, { initialEntries: ["/workflows/개발부서"] });
    const { container } = render(<RouterProvider router={router} />);

    for (const wf of ["03-1", "03-2", "03-3", "03-4", "03-6", "03-7", "03-8", "03-9", "04-4-1"]) {
      expect(container.querySelector(`[data-wf='${wf}']`), wf).not.toBeNull();
    }
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("개발부서");
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[NFR-11][FR-007-AC3] data-wf 03-5(정의 없는 서브에이전트 칸)", async () => {
    const snapshot = buildSnapshot([buildWorkflow()]);
    snapshotStore.replace({
      ...snapshot,
      live: {
        ...emptyLive,
        undefinedSubagents: [
          {
            agentId: "sub-1",
            agentType: "doc-writer",
            sessionId: "s-1",
            status: "running",
            currentTool: null,
            parentAgentName: "dev-lead",
            parentLabel: "dev-lead",
            startedAt: "2026-09-22T10:00:00+09:00",
          },
        ],
      },
    });

    const { container } = renderDetail();

    expect(container.querySelector("[data-wf='03-5']")).not.toBeNull();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-005-AC9][NFR-11] 첫 스냅샷 전(04-2) → 이름·‹·카드 머리·범례는 보이고 값은 스켈레톤, 팀장 호출·정의 수정은 비활성, 오류·빈 문구 없음", () => {
    const { container } = renderDetail();

    expect(screen.getByRole("heading", { level: 1, name: "개발부서" })).toBeInTheDocument();
    expect(screen.getByText("오피스")).toBeInTheDocument();
    expect(screen.getByText("동작 매핑")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(10);
    expect(screen.getByRole("button", { name: /팀장 호출 · 터미널 열기/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "정의 수정" })).toBeDisabled();
    expect(screen.queryByText("워크플로우를 찾을 수 없습니다")).not.toBeInTheDocument();
    expect(screen.queryByText("빈 자리")).not.toBeInTheDocument();
    expect(screen.queryByText(/hook 이벤트 수신 없음/)).not.toBeInTheDocument();
  });

  it("[FR-007-E1] 04-4 조건이 아니면 배너를 그리지 않는다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow()]));

    renderDetail();

    expect(screen.queryByText(/hook 이벤트 수신 없음/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-E1] 04-4 조건이면 상단 바 아래(오피스 카드 밖)에 띠 한 번만 그린다", async () => {
    const snapshot = buildSnapshot([buildWorkflow()]);
    snapshotStore.replace({ ...snapshot, live: { ...emptyLive, everReceived: false, lastReceivedAt: null } });

    const { container } = renderDetail();

    const banners = container.querySelectorAll("[data-wf='04-4-1']");
    expect(banners).toHaveLength(1);
    expect(banners[0]?.closest("[data-wf='03-3']")).toBeNull();
    expect(screen.getByTestId("collector-down-message")).toHaveTextContent("hook 이벤트 수신 없음 · 마지막 수신 없음");
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });
});
