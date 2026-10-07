import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Panel, PanelSkeleton } from "./Panel";
import type { AgentDef, AgentLive, EventRow, Live, Registry } from "../../api/types";
import { agentEventsStore } from "../../state/agentEventsStore";
import { connectionStore } from "../../state/connectionStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

const HOST_PATH = "/Users/jaybee/Desktop/AojiStudio";

function buildAgentDef(name: string): AgentDef {
  return {
    name,
    description: "",
    filePath: `.claude/agents/${name}.md`,
    workflow: "개발부서",
    role: name === "dev-lead" ? "lead" : "member",
    duplicateWorkflows: [],
  };
}

function buildRegistry(overrides: Partial<Registry> = {}): Registry {
  const fixture = buildSnapshotFixture();
  return {
    ...fixture.registry,
    agents: [buildAgentDef("dev-lead"), buildAgentDef("dev-01")],
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

function buildLive(agents: Record<string, AgentLive> = {}): Live {
  return { lastReceivedAt: null, everReceived: true, agents, lobby: [], undefinedSubagents: [] };
}

function buildEvent(id: number, overrides: Partial<EventRow> = {}): EventRow {
  return {
    id,
    at: "2026-09-22T10:2%d:00+09:00".replace("%d", String(id % 10)),
    hookEventName: "PreToolUse",
    kind: "tool",
    title: `도구 실행 · Edit ${id}`,
    summary: "backend/AgentController.java",
    sessionId: "s-1",
    agentId: null,
    agentType: "dev-lead",
    agentLabel: "dev-lead",
    toolName: "Edit",
    ...overrides,
  };
}

function stubEventsResponse(items: EventRow[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ items }), { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

interface RenderOptions {
  selectedName?: string | null;
  registry?: Registry;
  live?: Live;
  lead?: string | null;
  collectorDown?: boolean;
}

function renderPanel(options: RenderOptions = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/workflows/:name",
        element: (
          <Panel
            selectedName={options.selectedName === undefined ? "dev-lead" : options.selectedName}
            registry={options.registry ?? buildRegistry()}
            live={options.live ?? buildLive()}
            lead={options.lead === undefined ? "dev-lead" : options.lead}
            collectorDown={options.collectorDown ?? false}
          />
        ),
      },
    ],
    { initialEntries: ["/workflows/개발부서"] },
  );
  const result = render(<RouterProvider router={router} />);
  return { ...result, router };
}

describe("Panel", () => {
  afterEach(() => {
    agentEventsStore.reset();
    connectionStore.reset();
    vi.unstubAllGlobals();
  });

  it("[FR-007-AC5] 현재 도구 'Edit · <target>', idle → '-', 세션 시작·서브에이전트·작업 폴더 표시", async () => {
    stubEventsResponse([]);
    renderPanel({
      live: buildLive({
        "dev-lead": buildAgentLive("dev-lead", {
          status: "running",
          currentTool: { name: "Edit", target: "backend/AgentController.java" },
          sessionStartedAt: "2026-09-22T09:12:34+09:00",
          childCount: 2,
          cwd: `${HOST_PATH}/Aoji_Studio`,
        }),
      }),
    });

    expect(screen.getByText("현재 도구").nextElementSibling).toHaveTextContent("Edit · backend/AgentController.java");
    expect(screen.getByText("세션 시작").nextElementSibling).toHaveTextContent("09:12:34");
    expect(screen.getByText("서브에이전트").nextElementSibling).toHaveTextContent("2");
    // 작업 폴더는 전체 경로 그대로(줄바꿈 허용).
    expect(screen.getByText("작업 폴더").nextElementSibling).toHaveTextContent(`${HOST_PATH}/Aoji_Studio`);
    expect(screen.getByText("상태").nextElementSibling).toHaveTextContent("작업 중");
    expect(screen.getByText(".claude/agents/dev-lead.md")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC5] idle이면 현재 도구는 '-'", async () => {
    stubEventsResponse([]);
    renderPanel({ live: buildLive({ "dev-lead": buildAgentLive("dev-lead") }) });

    expect(screen.getByText("현재 도구").nextElementSibling).toHaveTextContent("-");
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC6] GET /api/agents/{name}/events 호출, SSE event prepend 10개 상한", async () => {
    const items = Array.from({ length: 10 }, (_, index) => buildEvent(index + 1));
    const fetchMock = stubEventsResponse(items);
    renderPanel();

    await waitFor(() => expect(screen.getByText("도구 실행 · Edit 1")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/agents/dev-lead/events?limit=10", expect.anything());
    // 행 = `hh:mm:ss` + title + summary(고정폭), 머리 `최근 이벤트` + `최신 10개`.
    expect(screen.getByText("최신 10개")).toBeInTheDocument();
    const firstRow = screen.getAllByRole("listitem")[0];
    expect(firstRow).toHaveTextContent(/^10:21:00\s*도구 실행 · Edit 1\s*backend\/AgentController\.java$/);

    act(() => {
      agentEventsStore.prependIfMatches(buildEvent(11, { title: "도구 실행 · Read 11" }));
    });

    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(10);
    expect(listItems[0]).toHaveTextContent("도구 실행 · Read 11");
    expect(screen.queryByText("도구 실행 · Edit 10")).not.toBeInTheDocument();
  });

  it("[FR-007-AC6] 다른 에이전트의 SSE event는 목록에 넣지 않는다", async () => {
    stubEventsResponse([buildEvent(1)]);
    renderPanel();

    await waitFor(() => expect(screen.getByText("도구 실행 · Edit 1")).toBeInTheDocument());
    act(() => {
      agentEventsStore.prependIfMatches(buildEvent(2, { agentType: "dev-01", title: "남의 이벤트" }));
    });

    expect(screen.queryByText("남의 이벤트")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("[FR-007-AC6] API 실패 → '최근 이벤트를 불러오지 못했습니다' + 다시 시도", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 500 })));
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();

    await waitFor(() => expect(screen.getByText("최근 이벤트를 불러오지 못했습니다")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("[FR-007-AC7] 정의 수정 → ?dialog=agent-edit, 제거 → ?dialog=agent-remove, 원문 로그 요소 없음", async () => {
    stubEventsResponse([]);
    const { router } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "정의 수정" }));
    expect(router.state.location.search).toBe("?dialog=agent-edit&agent=dev-lead");

    fireEvent.click(screen.getByRole("button", { name: "제거" }));
    expect(router.state.location.search).toBe("?dialog=agent-remove&agent=dev-lead");

    expect(screen.queryByText(/원문 로그 보기$/)).not.toBeInTheDocument();
    expect(screen.getByTestId("panel-footnote")).toHaveTextContent(
      "제거하면 정의 파일이 .aojistudio/trash/로 이동합니다 · 작업 지시는 터미널에서 팀장에게 직접 합니다",
    );
    // 활성이면 사유 줄이 없다.
    expect(screen.queryByText(/작업 중에는 수정할 수 없습니다/)).not.toBeInTheDocument();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
  });

  it("[FR-011-AC5] status running → 정의 수정·제거 둘 다 비활성 + 사유 한 줄 '작업 중에는 수정할 수 없습니다 · 작업 중에는 제거할 수 없습니다'", async () => {
    stubEventsResponse([]);
    renderPanel({ live: buildLive({ "dev-lead": buildAgentLive("dev-lead", { status: "running" }) }) });

    const edit = screen.getByRole("button", { name: "정의 수정" });
    expect(edit).toBeDisabled();
    expect(screen.getByRole("button", { name: "제거" })).toBeDisabled();
    const reasons = screen.getAllByText("작업 중에는 수정할 수 없습니다 · 작업 중에는 제거할 수 없습니다");
    expect(reasons).toHaveLength(1);
    expect(edit).toHaveAttribute("aria-describedby", reasons[0]?.id);
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-012-AC6] status waiting → 제거 비활성 + 같은 사유 한 줄", async () => {
    stubEventsResponse([]);
    renderPanel({ live: buildLive({ "dev-lead": buildAgentLive("dev-lead", { status: "waiting" }) }) });

    const remove = screen.getByRole("button", { name: "제거" });
    expect(remove).toBeDisabled();
    expect(screen.getByText("작업 중에는 수정할 수 없습니다 · 작업 중에는 제거할 수 없습니다")).toHaveAttribute(
      "id",
      remove.getAttribute("aria-describedby"),
    );
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-E1][FR-011-AC5] 04-4 + 실제 idle 선택 → 상태 대기·현재 도구 -, 두 버튼 활성·사유 줄 없음(ADR-68)", async () => {
    stubEventsResponse([]);
    renderPanel({
      collectorDown: true,
      live: buildLive({ "dev-lead": buildAgentLive("dev-lead", { status: "idle", sessionStartedAt: "2026-09-22T09:12:34+09:00" }) }),
    });

    expect(screen.getByText("상태").nextElementSibling).toHaveTextContent("대기");
    expect(screen.getByText("현재 도구").nextElementSibling).toHaveTextContent("-");
    // 비대상은 실제 값 그대로.
    expect(screen.getByText("세션 시작").nextElementSibling).toHaveTextContent("09:12:34");
    expect(screen.getByRole("button", { name: "정의 수정" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "제거" })).toBeEnabled();
    expect(screen.queryByText(/작업 중에는 수정할 수 없습니다/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-E1][FR-011-AC5][FR-012-AC6] 04-4 + 실제 작업 중 선택 → 상태는 대기로 보이지만 두 버튼은 비활성 + 사유(ADR-68)", async () => {
    stubEventsResponse([]);
    renderPanel({
      collectorDown: true,
      live: buildLive({
        "dev-lead": buildAgentLive("dev-lead", { status: "running", currentTool: { name: "Edit", target: "a.java" } }),
      }),
    });

    expect(screen.getByText("상태").nextElementSibling).toHaveTextContent("대기");
    expect(screen.getByText("현재 도구").nextElementSibling).toHaveTextContent("-");
    expect(screen.getByRole("button", { name: "정의 수정" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "제거" })).toBeDisabled();
    expect(screen.getByText("작업 중에는 수정할 수 없습니다 · 작업 중에는 제거할 수 없습니다")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-001-E2] writable false → 정의 수정·제거 비활성 + 사유 한 줄 '쓰기 권한 없음'", async () => {
    stubEventsResponse([]);
    renderPanel({ registry: buildRegistry({ writable: false }) });

    expect(screen.getByRole("button", { name: "정의 수정" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "제거" })).toBeDisabled();
    expect(screen.getAllByText("쓰기 권한 없음")).toHaveLength(1);
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC4] 선택할 에이전트가 없으면 안내 문구만 보여준다", () => {
    stubEventsResponse([]);
    renderPanel({ selectedName: null, lead: null });

    expect(screen.getByText("선택할 에이전트가 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "정의 수정" })).not.toBeInTheDocument();
    expect(screen.getByTestId("panel-footnote")).toHaveTextContent(
      "제거하면 정의 파일이 .aojistudio/trash/로 이동합니다 · 작업 지시는 터미널에서 팀장에게 직접 합니다",
    );
  });

  it("[FR-007-AC6] 재연결되면 최근 이벤트를 다시 불러온다", async () => {
    const fetchMock = stubEventsResponse([]);
    renderPanel();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      connectionStore.setDisconnected(5);
    });
    act(() => {
      connectionStore.setConnected();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("[FR-007-AC4] 패널 영역 data-wf 03-8·03-9, 팀장 선택이면 팀장 배지, 값 표 라벨 5개", async () => {
    stubEventsResponse([]);
    const { container } = renderPanel();

    expect(container.querySelector("[data-wf='03-8']")).not.toBeNull();
    expect(container.querySelector("[data-wf='03-9']")).not.toBeNull();
    expect(screen.getByText("선택한 에이전트")).toBeInTheDocument();
    expect(screen.getByText("기본 선택 = 팀장")).toBeInTheDocument();
    expect(screen.getByText("팀장")).toBeInTheDocument();
    for (const label of ["상태", "현재 도구", "세션 시작", "서브에이전트", "작업 폴더"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC5] 03 로딩(04-2): 값·이벤트는 스켈레톤, 정의 수정·제거는 비활성(이유 줄 없음), 머리·각주는 보인다", () => {
    const { container } = render(<PanelSkeleton />);

    expect(screen.getByText("선택한 에이전트")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "정의 수정" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "제거" })).toBeDisabled();
    expect(screen.queryByText(/작업 중에는 수정할 수 없습니다/)).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(5);
    expect(screen.getByTestId("panel-footnote")).toBeInTheDocument();
  });
});
