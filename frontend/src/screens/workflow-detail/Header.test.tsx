import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";
import type { AgentDef, AgentLive, Status, Workflow } from "../../api/types";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

const HOST_PATH = "/Users/jaybee/Desktop/JayStudio";
const HELPER_URL = "http://127.0.0.1:4181";
const HELPER_TOKEN = "b".repeat(64);
const LEAD_COMMAND = 'cd "/Users/jaybee/Desktop/JayStudio" && claude --agent dev-lead';
const writeText = vi.fn<(text: string) => Promise<void>>();

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

interface Handlers {
  /** 도우미 `POST /open` 응답(기본: 204). */
  open?: (signal: AbortSignal | null | undefined) => Response | Promise<Response>;
  /** `GET /api/helper/token` 응답(기본: 토큰 있음). */
  token?: () => Response | Promise<Response>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(handlers: Handlers = {}): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/browser-token")) {
        return jsonResponse({ token: "a".repeat(64) });
      }
      calls.push({
        url,
        method: init?.method ?? "GET",
        headers: { ...((init?.headers ?? {}) as Record<string, string>) },
        body: typeof init?.body === "string" ? init.body : null,
      });
      if (url.includes("/api/helper/token")) {
        return handlers.token === undefined ? jsonResponse({ token: HELPER_TOKEN }) : handlers.token();
      }
      if (url.endsWith("/open")) {
        return handlers.open === undefined
          ? new Response(null, { status: 204 })
          : handlers.open(init?.signal);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  return calls;
}

/** 2초 타임아웃의 `abort`에만 반응하는 응답(고정 대기 없이 경계를 만든다). */
function neverResolving(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise<Response>((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

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

function buildLive(statuses: Record<string, Status>): Record<string, AgentLive> {
  return Object.fromEntries(
    Object.entries(statuses).map(([name, status]) => [
      name,
      {
        name,
        status,
        currentTool: null,
        sessionStartedAt: null,
        childCount: 0,
        cwd: null,
        parentLabel: null,
        lastEventAt: null,
        lastEvent: null,
      } satisfies AgentLive,
    ]),
  );
}

/** 정의 목록은 FR-013-E4(누른 시점 판정)용이다. 기본값은 팀장·팀원이 모두 있는 상태. */
function buildAgents(names: string[]): AgentDef[] {
  return names.map((name) => ({
    name,
    description: "",
    filePath: `.claude/agents/${name}.md`,
    workflow: "개발부서",
    role: name.endsWith("lead") ? "lead" : "member",
    duplicateWorkflows: [],
  }));
}

function renderHeader(
  workflow: Workflow,
  liveAgents: Record<string, AgentLive> = {},
  registryAgents: AgentDef[] = buildAgents(["dev-lead", "dev-01", "dev-02"]),
) {
  return render(
    <MemoryRouter>
      <Header
        workflow={workflow}
        skillCount={4}
        liveAgents={liveAgents}
        registryAgents={registryAgents}
        hostPath={HOST_PATH}
      />
    </MemoryRouter>,
  );
}

describe("Header", () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    snapshotStore.replace(buildSnapshotFixture());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    snapshotStore.reset();
  });

  it("[FR-007-AC9] 칩 렌더", () => {
    renderHeader(buildWorkflow(), buildLive({ "dev-lead": "running", "dev-01": "running", "dev-02": "idle" }));

    expect(screen.getByText("실행 중 2명")).toBeInTheDocument();
  });

  it("[FR-007-AC9] 권한 대기가 있으면 권한 대기 칩이 우선한다", () => {
    renderHeader(buildWorkflow(), buildLive({ "dev-lead": "running", "dev-01": "waiting", "dev-02": "idle" }));

    expect(screen.getByText("권한 대기 1명")).toBeInTheDocument();
    expect(screen.queryByText("실행 중 1명")).not.toBeInTheDocument();
  });

  it("[FR-007-AC9] 모두 대기면 모두 대기 칩", () => {
    renderHeader(buildWorkflow(), buildLive({ "dev-lead": "idle" }));

    expect(screen.getByText("모두 대기")).toBeInTheDocument();
  });

  it("[FR-007-AC8][FR-013-AC4] lead null → 팀장 호출 비활성 + '팀장 없음'", () => {
    renderHeader(buildWorkflow({ lead: null, members: ["dev-01"], rawMemberCount: 1 }));

    const button = screen.getByRole("button", { name: /팀장 호출 · 터미널 열기/ });
    expect(button).toBeDisabled();
    expect(screen.getAllByText("팀장 없음").length).toBeGreaterThan(0);
  });

  it("[FR-007-AC8] lead가 있으면 팀장 호출 버튼이 활성이고 팀장 name을 보여준다", () => {
    renderHeader(buildWorkflow());

    expect(screen.getByRole("button", { name: /팀장 호출 · 터미널 열기/ })).toBeEnabled();
    expect(screen.getByText("dev-lead")).toBeInTheDocument();
    expect(screen.queryByText("팀장 없음")).not.toBeInTheDocument();
  });

  it("[FR-007-AC9] 이름·에이전트 수·스킬 수·되돌아가기 버튼 렌더", () => {
    renderHeader(buildWorkflow());

    expect(screen.getByRole("heading", { name: "개발부서" })).toBeInTheDocument();
    expect(screen.getByText("에이전트 3 · 스킬 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "에이전트 워크플로우로" })).toBeInTheDocument();
  });

  it("[FR-013-AC2][FR-013-AC6] 팀장 호출 → 요청 URL = helperUrl + '/open', 본문 키는 target·leadName뿐, 헤더 X-JayStudio-Helper-Token", async () => {
    const calls = stubFetch();
    renderHeader(buildWorkflow());

    fireEvent.click(screen.getByRole("button", { name: /팀장 호출 · 터미널 열기/ }));

    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/open"))).toBe(true));
    const openCall = calls.find((call) => call.url.endsWith("/open"));
    expect(openCall?.url).toBe(`${HELPER_URL}/open`);
    expect(openCall?.method).toBe("POST");
    expect(Object.keys(JSON.parse(openCall?.body ?? "{}"))).toEqual(["target", "leadName"]);
    expect(JSON.parse(openCall?.body ?? "{}")).toEqual({ target: "lead", leadName: "dev-lead" });
    expect(openCall?.headers["X-JayStudio-Helper-Token"]).toBe(HELPER_TOKEN);
    // 경로·명령은 도우미에 보내지 않는다(hostPath는 프론트가 보여주고 복사할 뿐이다).
    expect(openCall?.body).not.toContain("claude");
    expect(openCall?.body).not.toContain(HOST_PATH);
    // 204는 화면에 아무 것도 남기지 않는다(팝업·인라인 오류 없음).
    expect(screen.queryByTestId("helper-missing-dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[FR-014-AC5] 무응답 → 03 HelperMissingDialog에 팀장 명령(cd \"<hostPath>\" && claude --agent <lead>)이 실리고 그 명령을 복사한다", async () => {
    vi.useFakeTimers();
    stubFetch({ open: (signal) => neverResolving(signal) });
    renderHeader(buildWorkflow());

    fireEvent.click(screen.getByRole("button", { name: /팀장 호출 · 터미널 열기/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByTestId("helper-missing-dialog")).toBeInTheDocument();
    expect(screen.getByText(LEAD_COMMAND)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "명령 복사" }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith(LEAD_COMMAND);
  });

  it("[FR-013-E3] 도우미가 400으로 거부하면 도우미 message를 그대로 보여준다", async () => {
    stubFetch({
      open: () =>
        jsonResponse({ code: "INVALID_NAME", message: "팀장 name 형식이 올바르지 않습니다" }, 400),
    });
    renderHeader(buildWorkflow());

    fireEvent.click(screen.getByRole("button", { name: /팀장 호출 · 터미널 열기/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "팀장 name 형식이 올바르지 않습니다",
    );
    expect(screen.queryByTestId("helper-missing-dialog")).not.toBeInTheDocument();
  });

  it("[FR-013-E4] 누른 시점 registry.agents에 팀장이 없으면 도우미를 호출하지 않고 '팀장이 없습니다'만 보여준다", async () => {
    const calls = stubFetch();
    // registryAgents에는 dev-lead가 없다(팀원만 있는 최신 정의) — 화면(workflow.lead)은 아직 갱신 전일 수 있다.
    renderHeader(buildWorkflow(), {}, buildAgents(["dev-01", "dev-02"]));

    fireEvent.click(screen.getByRole("button", { name: /팀장 호출 · 터미널 열기/ }));

    expect(await screen.findByText("팀장이 없습니다")).toBeInTheDocument();
    await act(async () => {});
    expect(calls.filter((call) => call.url.endsWith("/open"))).toEqual([]);
    expect(screen.queryByTestId("helper-missing-dialog")).not.toBeInTheDocument();
  });
});
