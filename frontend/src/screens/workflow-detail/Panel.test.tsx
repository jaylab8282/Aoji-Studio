import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Panel } from "./Panel";
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
            hostPath={HOST_PATH}
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
    expect(screen.getByText("작업 폴더").nextElementSibling).toHaveTextContent("Aoji_Studio");
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
    expect(screen.getByText("제거 = 휴지통(.aojistudio/trash/)으로 이동 · 원문 로그 보기 없음")).toBeInTheDocument();
  });

  it("[FR-011-AC5] status running → 정의 수정 비활성 '작업 중에는 수정할 수 없습니다'", async () => {
    stubEventsResponse([]);
    renderPanel({ live: buildLive({ "dev-lead": buildAgentLive("dev-lead", { status: "running" }) }) });

    expect(screen.getByRole("button", { name: "정의 수정" })).toBeDisabled();
    expect(screen.getByText("작업 중에는 수정할 수 없습니다")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-012-AC6] status waiting → 제거 비활성 '작업 중에는 제거할 수 없습니다'", async () => {
    stubEventsResponse([]);
    renderPanel({ live: buildLive({ "dev-lead": buildAgentLive("dev-lead", { status: "waiting" }) }) });

    expect(screen.getByRole("button", { name: "제거" })).toBeDisabled();
    expect(screen.getByText("작업 중에는 제거할 수 없습니다")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-001-E2] writable false → 정의 수정·제거 비활성 '쓰기 권한 없음'", async () => {
    stubEventsResponse([]);
    renderPanel({ registry: buildRegistry({ writable: false }) });

    expect(screen.getByRole("button", { name: "정의 수정" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "제거" })).toBeDisabled();
    expect(screen.getAllByText("쓰기 권한 없음")).toHaveLength(2);
    await waitFor(() => expect(screen.getByText("최근 이벤트 없음")).toBeInTheDocument());
  });

  it("[FR-007-AC4] 선택할 에이전트가 없으면 안내 문구만 보여준다", () => {
    stubEventsResponse([]);
    renderPanel({ selectedName: null, lead: null });

    expect(screen.getByText("선택할 에이전트가 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "정의 수정" })).not.toBeInTheDocument();
    expect(screen.getByText("제거 = 휴지통(.aojistudio/trash/)으로 이동 · 원문 로그 보기 없음")).toBeInTheDocument();
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
});
