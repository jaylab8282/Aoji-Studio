import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowDetailScreen } from "./WorkflowDetailScreen";
import type { AgentDef, Live, Snapshot, Workflow } from "../../api/types";
import { agentEventsStore } from "../../state/agentEventsStore";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

function buildWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "개발부서",
    description: "",
    filePath: ".jaystudio/teams/dev.json",
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
    expect(within(selected).getByRole("img", { name: "dev-lead" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC4] 팀장이 없으면 첫 자리 에이전트가 선택된다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow({ lead: null, members: ["dev-02", "dev-01"] })]));

    renderDetail();

    const selected = screen.getByRole("button", { pressed: true });
    expect(within(selected).getByRole("img", { name: "dev-01" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC4] ?agent=가 있으면 그 에이전트가 선택된다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow()]));

    renderDetail("/workflows/개발부서?agent=dev-02");

    const selected = screen.getByRole("button", { pressed: true });
    expect(within(selected).getByRole("img", { name: "dev-02" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC4] 칸을 클릭하면 ?agent=가 바뀌고 패널이 갱신된다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow()]));

    const { router } = renderDetail();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());

    const cell = screen.getByRole("img", { name: "dev-01" }).closest("button");
    expect(cell).not.toBeNull();
    fireEvent.click(cell as HTMLButtonElement);

    expect(router.state.location.search).toBe("?agent=dev-01");
    expect(screen.getByText(".claude/agents/dev-01.md")).toBeInTheDocument();
  });

  it("[FR-007-E2] 없는 이름 → 안내 + '에이전트 워크플로우로' 버튼 → /workflows", () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow({ name: "마케팅부서" })]));

    const { router } = renderDetail();

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

  it("[FR-007-AC1] 오피스 왼쪽·선택 패널 오른쪽 구성과 동작 매핑 범례를 그린다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow()]));

    renderDetail();

    expect(screen.getByText("오피스")).toBeInTheDocument();
    expect(screen.getByText("에이전트 1명 = 캐릭터 1개 · 팀장 첫 자리, 나머지 이름순")).toBeInTheDocument();
    expect(screen.getByText("동작 매핑")).toBeInTheDocument();
    expect(screen.getByText("타이핑 = Edit·Write")).toBeInTheDocument();
    expect(screen.getByText("읽기 = Read·Grep·Glob")).toBeInTheDocument();
    expect(screen.getByText("주황 말풍선 = 권한 요청")).toBeInTheDocument();
    expect(screen.getByText("회색 = 대기")).toBeInTheDocument();
    expect(screen.getByText("작은 캐릭터 = 서브에이전트")).toBeInTheDocument();
    expect(screen.getByText("선택한 에이전트")).toBeInTheDocument();
    expect(screen.getByText("기본 선택 = 팀장")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-E1] 04-4 조건이 아니면 배너를 그리지 않는다", async () => {
    snapshotStore.replace(buildSnapshot([buildWorkflow()]));

    renderDetail();

    expect(screen.queryByText(/hook 이벤트 수신 없음/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });
});
