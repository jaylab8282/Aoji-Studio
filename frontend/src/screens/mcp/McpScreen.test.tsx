import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpScreen } from "./McpScreen";
import { MCP_REFETCH_INTERVAL_MS } from "./useMcpReport";
import type { McpReport } from "../../api/types";
import { snapshotStore } from "../../state/snapshotStore";
import { usageSignalStore } from "../../state/usageSignalStore";
import { buildMcpReport, buildMcpServer } from "../../test/fixtures/mcp";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubMcp(respond: (url: string) => Response | Promise<Response>): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.startsWith("/api/mcp")) throw new Error(`unexpected fetch: ${url}`);
      urls.push(url);
      return respond(url);
    }),
  );
  return urls;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/mcp"]}>
      <McpScreen />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function rowOf(name: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${name} (펼치기|접기)$`) }).closest("li") as HTMLElement;
}

async function waitForRows() {
  await screen.findByRole("region", { name: "MCP 서버 목록" });
  await waitFor(() => expect(screen.queryByTestId("expandable-skeleton-row")).toBeNull());
}

const SAMPLE: McpReport = buildMcpReport([
  buildMcpServer("claude_ai_Gmail", {
    locations: [{ kind: "called-only", detail: null }],
    transport: null,
    command: null,
    actualAgents: [{ agent: null, count: 2 }],
    usedAgentCount: 0,
  }),
  buildMcpServer("context7", {
    locations: [{ kind: "plugin", detail: "context7" }],
    active: true,
    usedAgentCount: 1,
    definedAgents: ["web-reviewer"],
    actualAgents: [],
  }),
  buildMcpServer("github", {
    locations: [
      { kind: "project", detail: null },
      { kind: "global", detail: null },
      { kind: "agent", detail: "web-reviewer" },
    ],
    active: false,
    transport: "http",
    command: null,
    url: "https://example.test/mcp?token=••••••••",
    maskedSettings: [
      { group: "env", key: "GITHUB_TOKEN", value: "••••••••" },
      { group: "headers", key: "Authorization", value: "••••••••" },
    ],
    definedAgents: ["web-develop-tech-lead", "web-reviewer"],
    inheritAllCount: 9,
    actualAgents: [
      { agent: "web-reviewer", count: 4 },
      { agent: null, count: 11 },
    ],
    usedAgentCount: 2,
  }),
]);

describe("McpScreen", () => {
  beforeEach(() => {
    const base = buildSnapshotFixture();
    snapshotStore.replace({ ...base, registry: { ...base.registry, revision: 1 } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    snapshotStore.reset();
    usageSignalStore.reset();
  });

  it("[FR-023-AC1] 제목 줄 `서버 N개 · 이름순`, 행 이름순, 정의 위치 칩(합쳐진 모든 위치)·활성 칩, 기간 7일 기본", async () => {
    const urls = stubMcp(() => jsonResponse(SAMPLE));
    const { container } = renderScreen();
    await waitForRows();

    expect(container.querySelector('[data-wf="09-2"]')).toHaveTextContent(
      "읽기 전용 · 서버 3개 · 이름순 · 추가·수정·삭제는 설정 파일에서 합니다",
    );
    expect(urls[0]).toContain("period=7d");
    const names = screen.getAllByRole("button", { name: /(펼치기|접기)$/ }).map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["claude_ai_Gmail 펼치기", "context7 펼치기", "github 펼치기"]);

    const github = rowOf("github");
    for (const chip of ["프로젝트", "전역", "에이전트 web-reviewer", "비활성"]) {
      expect(within(github).getByText(chip, { exact: true })).toBeInTheDocument();
    }
    expect(within(rowOf("context7")).getByText("플러그인 context7")).toBeInTheDocument();
    expect(within(rowOf("context7")).getByText("활성", { exact: true })).toBeInTheDocument();
    expect(within(rowOf("claude_ai_Gmail")).queryByText("활성", { exact: true })).toBeNull();
  });

  it("[FR-023-AC1] 첫 응답 전에는 행 8개 스켈레톤이고 서버 수 자리도 스켈레톤이다(0을 먼저 보이지 않는다)", () => {
    stubMcp(() => new Promise<Response>(() => undefined));
    const { container } = renderScreen();
    expect(screen.getAllByTestId("expandable-skeleton-row")).toHaveLength(8);
    expect(container.querySelector('[data-wf="09-2"]')).not.toHaveTextContent(/서버 0개/);
  });

  it("[FR-023-AC3] `호출 기록만` 점선 칩(09-9 행), 펼치면 `정의 없음 · 연결 방식 알 수 없음`·정의상 `-`", async () => {
    stubMcp(() => jsonResponse(SAMPLE));
    const { container } = renderScreen();
    await waitForRows();

    const row = rowOf("claude_ai_Gmail");
    expect(row).toHaveAttribute("data-wf", "09-9");
    expect(within(row).getByText("호출 기록만")).toHaveClass("border-dashed");
    expect(container.querySelectorAll('[data-wf="09-9"]')).toHaveLength(1);

    fireEvent.click(within(row).getByRole("button", { name: "claude_ai_Gmail 펼치기" }));
    expect(row).toHaveTextContent("정의 없음 · 연결 방식 알 수 없음");
    expect(row.querySelector('[data-wf="09-8"]')).toHaveTextContent("-");
    expect(row).not.toHaveTextContent("전체 상속");
  });

  it("[FR-023-AC2] 펼치면 연결 방식·URL·가린 값(env/headers)을 서버 응답 그대로 보인다", async () => {
    stubMcp(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();

    const row = rowOf("github");
    fireEvent.click(within(row).getByRole("button", { name: "github 펼치기" }));
    const connection = row.querySelector('[data-wf="09-7"]') as HTMLElement;
    expect(within(connection).getByText("http", { exact: true })).toBeInTheDocument();
    expect(connection).toHaveTextContent("https://example.test/mcp?token=••••••••");
    expect(connection).toHaveTextContent("env GITHUB_TOKEN=••••••••");
    expect(connection).toHaveTextContent("headers Authorization: ••••••••");
  });

  it("[FR-023-AC4] 커넥터 안내는 서버가 없어도, 로딩 중에도 항상 보인다", async () => {
    stubMcp(() => new Promise<Response>(() => undefined));
    const { container, unmount } = renderScreen();
    expect(container.querySelector('[data-wf="09-4"]')).toHaveTextContent(
      "claude.ai 커넥터(Gmail·Drive 등)는 로컬 설정에 없어 호출 기록이 있을 때만 보입니다",
    );
    unmount();

    stubMcp(() => jsonResponse(buildMcpReport([])));
    const second = renderScreen();
    await screen.findByText("설치된 MCP가 없습니다");
    expect(second.container.querySelector('[data-wf="09-4"]')).toHaveTextContent("claude.ai 커넥터");
  });

  it("[FR-023-AC5] 읽은 곳 카드: 네 칸 상태·서버 수와 `전역 설정 읽은 시각 hh:mm:ss`, null이면 `-`", async () => {
    stubMcp(() => jsonResponse(SAMPLE));
    const { container, unmount } = renderScreen();
    await waitForRows();

    const sources = container.querySelector('[data-wf="09-3"]') as HTMLElement;
    expect(sources).toHaveTextContent(/전역 설정 읽은 시각\s*\d{2}:\d{2}:\d{2}/);
    expect(sources).toHaveTextContent("읽음 · 서버 2");
    expect(sources).toHaveTextContent("~/.claude.json");
    expect(sources).toHaveTextContent("연결됨 · 읽기 전용 · 서버 1");
    expect(sources).toHaveTextContent("서버 1 · 호출 기록만 1");
    expect(container.querySelector('[data-wf="09-10"]')).toBeNull();
    unmount();

    stubMcp(() => jsonResponse({ ...SAMPLE, globalReadAt: null }));
    const second = renderScreen();
    await waitForRows();
    expect(second.container.querySelector('[data-wf="09-3"]')).toHaveTextContent("전역 설정 읽은 시각 -");
  });

  it("[FR-023-AC6] 입력·쓰기 버튼이 없다: 텍스트 입력·콤보·체크박스 0, 추가·수정·삭제·활성화·점검 버튼 0", async () => {
    stubMcp(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();

    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /추가|수정|삭제|저장|만들기|활성화|비활성화|점검/ })).toHaveLength(0);
  });

  it("[FR-023-E1] 파싱 실패: 출처 오류 줄 `JSON 파싱 실패 (N행)` + `이 출처만 빼고 표시합니다`, 설정 열기 없음, 나머지 행은 그대로", async () => {
    const report = buildMcpReport(SAMPLE.servers, {
      sources: SAMPLE.sources.map((s) => (s.key === "project" ? { ...s, state: "error" as const, serverCount: 0 } : s)),
      sourceErrors: [{ source: "project", file: ".mcp.json", kind: "parse", line: 3 }],
    });
    stubMcp(() => jsonResponse(report));
    const { container } = renderScreen();
    await waitForRows();

    const line = container.querySelector('[data-wf="09-10"]') as HTMLElement;
    expect(line).toHaveTextContent(/\.mcp\.json\s*·\s*JSON 파싱 실패 \(3행\)/);
    expect(line).toHaveTextContent("이 출처만 빼고 표시합니다");
    expect(within(line).queryByText("설정 열기")).toBeNull();
    expect(screen.getAllByRole("button", { name: /(펼치기|접기)$/ })).toHaveLength(3);
  });

  it("[FR-023-E2] 연결 안 됨: 전역 칸 `연결 안 됨` + 출처 오류 줄 `설정 열기`(한 번) → /settings", async () => {
    const report = buildMcpReport(SAMPLE.servers, {
      sources: SAMPLE.sources.map((s) =>
        s.key === "global" || s.key === "plugin" ? { ...s, state: "not-connected" as const, serverCount: 0 } : s,
      ),
      globalReadAt: null,
      sourceErrors: [
        { source: "global", file: "~/.claude.json", kind: "not-connected", line: null },
        { source: "plugin", file: "~/.claude/settings.json", kind: "not-connected", line: null },
      ],
    });
    stubMcp(() => jsonResponse(report));
    const { container } = renderScreen();
    await waitForRows();

    const sources = container.querySelector('[data-wf="09-3"]') as HTMLElement;
    expect(within(sources).getAllByText("연결 안 됨").length).toBeGreaterThan(0);
    expect(sources).not.toHaveTextContent("연결됨");
    const line = container.querySelector('[data-wf="09-10"]') as HTMLElement;
    expect(line).toHaveTextContent(/~\/\.claude\.json\s*·\s*연결 안 됨/);
    expect(line).toHaveTextContent("이 출처만 빼고 표시합니다");
    expect(container.querySelector('[data-wf="09-4"]')).toHaveTextContent("claude.ai 커넥터");

    fireEvent.click(within(line).getByRole("button", { name: "설정 열기" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/settings");
  });

  it("[FR-024-AC1] 펼치면 정의상 name 목록 + `전체 상속 N명` 칩, 정의상 없으면 `-`", async () => {
    stubMcp(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();

    const github = rowOf("github");
    fireEvent.click(within(github).getByRole("button", { name: "github 펼치기" }));
    const defined = github.querySelector('[data-wf="09-8"]') as HTMLElement;
    expect(defined).toHaveTextContent("web-develop-tech-lead");
    expect(defined).toHaveTextContent("web-reviewer");
    expect(defined).toHaveTextContent("전체 상속 9명");

    const none = rowOf("claude_ai_Gmail");
    fireEvent.click(within(none).getByRole("button", { name: "claude_ai_Gmail 펼치기" }));
    expect(none.querySelector('[data-wf="09-8"]')).toHaveTextContent("-");
  });

  it("[FR-024-AC2] 실제 사용: 에이전트 이름 + 굵은 횟수, 기본 세션 포함", async () => {
    stubMcp(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();

    const github = rowOf("github");
    fireEvent.click(within(github).getByRole("button", { name: "github 펼치기" }));
    expect(github).toHaveTextContent(/web-reviewer\s*4/);
    expect(github).toHaveTextContent(/기본 세션\s*11/);
    expect(within(github).getByText("11").tagName).toBe("B");
  });

  it("[FR-024-AC4] `사용 에이전트 N명` 버튼 = 행 펼침 버튼과 같은 상태, 0명은 약한 모양, 여러 행 동시 펼침", async () => {
    stubMcp(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();

    const github = rowOf("github");
    const count = within(github).getByRole("button", { name: "사용 에이전트 2명" });
    expect(count).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(count);
    expect(count).toHaveAttribute("aria-expanded", "true");
    expect(within(github).getByRole("button", { name: "github 접기" })).toHaveAttribute("aria-expanded", "true");

    const context7 = rowOf("context7");
    fireEvent.click(within(context7).getByRole("button", { name: "context7 펼치기" }));
    expect(count).toHaveAttribute("aria-expanded", "true");
    expect(within(rowOf("claude_ai_Gmail")).getByRole("button", { name: "사용 에이전트 0명" })).toHaveAttribute("data-zero");
  });

  it("[FR-024-E1] hookConfigured=false → 실제 사용 `기록 없음`, 기간 안 호출 0 → `기간 안 호출 없음`", async () => {
    const report = buildMcpReport(
      [
        buildMcpServer("no-hook", { actualAgents: null }),
        buildMcpServer("quiet", { actualAgents: [] }),
      ],
      { hookConfigured: false },
    );
    stubMcp(() => jsonResponse(report));
    renderScreen();
    await waitForRows();

    fireEvent.click(screen.getByRole("button", { name: "no-hook 펼치기" }));
    fireEvent.click(screen.getByRole("button", { name: "quiet 펼치기" }));
    expect(rowOf("no-hook")).toHaveTextContent("기록 없음");
    expect(rowOf("no-hook")).not.toHaveTextContent("기간 안 호출 없음");
    expect(rowOf("quiet")).toHaveTextContent("기간 안 호출 없음");
  });

  it("[FR-024-AC2] 기간을 바꾸면 해당 기간으로 다시 조회하고 펼침은 유지된다", async () => {
    const urls = stubMcp(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();
    fireEvent.click(screen.getByRole("button", { name: "github 펼치기" }));

    fireEvent.click(screen.getByRole("button", { name: "30일" }));
    await waitFor(() => expect(urls.some((url) => url.includes("period=30d"))).toBe(true));
    expect(screen.getByRole("button", { name: "github 접기" })).toBeInTheDocument();
  });

  it("[FR-024-AC3] `usage-changed` mcp 신호 → 다시 조회, 같은 화면 재조회는 1초에 1회 이하·마지막 신호 뒤 1회 (ADR-94)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const urls = stubMcp(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitFor(() => expect(urls).toHaveLength(1));

    act(() => usageSignalStore.signal(["mcp"], null));
    act(() => usageSignalStore.signal(["mcp"], null));
    act(() => usageSignalStore.signal(["mcp"], null));
    expect(urls).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MCP_REFETCH_INTERVAL_MS + 50);
    });
    expect(urls).toHaveLength(2);

    act(() => usageSignalStore.signal(["skills"], null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MCP_REFETCH_INTERVAL_MS * 2);
    });
    expect(urls).toHaveLength(2);
  });

  it("[FR-023-AC1] 빈 상태: 점선 안내 카드 `설치된 MCP가 없습니다`, 위쪽 줄(읽은 곳·커넥터 안내)은 그대로", async () => {
    stubMcp(() => jsonResponse(buildMcpReport([])));
    const { container } = renderScreen();
    const card = await screen.findByText("설치된 MCP가 없습니다");
    expect(card.closest("section")).toHaveAttribute("data-wf", "09-5");
    expect(card.closest("section")).toHaveTextContent(
      "프로젝트·전역·플러그인 설정과 에이전트 정의에 MCP 서버가 없고, 기간 안 호출 기록도 없습니다.",
    );
    expect(container.querySelector('[data-wf="09-2"]')).toHaveTextContent("서버 0개");
    expect(container.querySelector('[data-wf="09-3"]')).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "MCP 서버 목록" })).toBeNull();
  });

  it("[FR-023-AC1] 조회 실패 → 목록 자리 Alert + `다시 시도`로 다시 조회", async () => {
    let calls = 0;
    stubMcp(() => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ code: "IO_FAILED", message: "MCP 설정을 읽지 못했습니다" }, 500)
        : jsonResponse(SAMPLE);
    });
    renderScreen();
    expect(await screen.findByRole("alert")).toHaveTextContent("MCP 설정을 읽지 못했습니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitForRows();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
