import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowsHeader } from "./WorkflowsHeader";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

const HELPER_URL = "http://127.0.0.1:4181";
const DEFAULT_COMMAND = 'cd "/Users/jaybee/Desktop/JayStudio" && claude';
const writeText = vi.fn<(text: string) => Promise<void>>();

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

interface Handlers {
  /** 도우미 `POST /open` 응답(기본: 204 — 도우미는 spawn 시점에 204를 준다). */
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
        return handlers.token === undefined ? jsonResponse({ token: "b".repeat(64) }) : handlers.token();
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

function openButton(): HTMLElement {
  return screen.getByRole("button", { name: /Claude 열기 · 기본 세션/ });
}

describe("WorkflowsHeader", () => {
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

  it("[FR-013-AC3] 팀장 선택 목록·메뉴 없음, 버튼 하나", () => {
    stubFetch();
    render(<WorkflowsHeader />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(openButton()).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("[ADR-44][FR-013-AC1][FR-013-AC6] 스냅샷 수신 후 → 버튼 활성(secondary), 누르면 config.helperUrl + '/open'으로 {target:'default'} 1회", async () => {
    const calls = stubFetch();
    render(<WorkflowsHeader />);

    // 스냅샷을 받은 뒤(beforeEach가 fixture를 넣었다)에는 비활성 모양이 아니라 secondary 활성 모양이다.
    const button = openButton();
    expect(button).toBeEnabled();
    expect(button.className).toContain("border-border-strong");
    expect(button.className).not.toContain("border-dashed");

    fireEvent.click(button);

    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/open"))).toBe(true));
    const openCalls = calls.filter((call) => call.url.endsWith("/open"));
    expect(openCalls).toHaveLength(1);
    expect(openCalls[0]?.url).toBe(`${HELPER_URL}/open`);
    expect(JSON.parse(openCalls[0]?.body ?? "{}")).toEqual({ target: "default" });
    expect(openCalls[0]?.headers["X-JayStudio-Helper-Token"]).toBe("b".repeat(64));
    // 성공(204)은 화면에 아무 것도 남기지 않는다 — 터미널은 맥북에서 열린다.
    expect(screen.queryByTestId("helper-missing-dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[ADR-44] 첫 스냅샷 전(snapshotStore 초기 상태) → 'Claude 열기 · 기본 세션' 버튼이 disabled이고 이유 줄 텍스트가 문서에 없다", () => {
    snapshotStore.reset();
    stubFetch();
    render(<WorkflowsHeader />);

    const button = openButton();
    expect(button).toBeDisabled();
    // `disabledReason`을 넘기지 않으므로 Button은 버튼 하나만 그린다 — 옆에 이유 줄(sibling span)이 없다.
    expect(button.parentElement?.children).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[ADR-44] 첫 스냅샷 전 클릭 시도 → 도우미 fetch 0회, HelperMissingDialog 없음, 에러 줄 없음", () => {
    snapshotStore.reset();
    const calls = stubFetch();
    render(<WorkflowsHeader />);

    const button = openButton();
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(calls).toEqual([]);
    expect(screen.queryByTestId("helper-missing-dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("[FR-013-AC9][FR-013-E1] 2초 타임아웃·연결 실패 → HelperMissingDialog + 선택 명령 + 명령 복사", async () => {
    vi.useFakeTimers();
    const calls = stubFetch({ open: (signal) => neverResolving(signal) });
    render(<WorkflowsHeader />);

    fireEvent.click(openButton());

    // 2초 전까지는 안내를 띄우지 않는다(도우미가 늦게 답할 수 있다).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(screen.queryByTestId("helper-missing-dialog")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByTestId("helper-missing-dialog")).toBeInTheDocument();
    expect(screen.getByText("열기 도우미가 응답하지 않습니다")).toBeInTheDocument();
    // 선택한 항목의 명령(기본 세션)이 팝업에 실린다.
    expect(screen.getByText(DEFAULT_COMMAND)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "명령 복사" }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith(DEFAULT_COMMAND);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByTestId("helper-missing-dialog")).not.toBeInTheDocument();

    // 연결 자체가 실패하는 경우(도우미 미설치)도 같은 안내다.
    vi.unstubAllGlobals();
    stubFetch({
      open: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    fireEvent.click(openButton());
    await act(async () => {});
    expect(screen.getByTestId("helper-missing-dialog")).toBeInTheDocument();
    expect(screen.getByText(DEFAULT_COMMAND)).toBeInTheDocument();
    expect(calls.filter((call) => call.url.endsWith("/open"))).toHaveLength(1);
  });

  it("[FR-013-E2] 403 → '도우미 인증 실패 · 도우미를 다시 설치하세요'", async () => {
    stubFetch({
      open: () => jsonResponse({ code: "FORBIDDEN_ORIGIN", message: "허용되지 않은 출처입니다" }, 403),
    });
    render(<WorkflowsHeader />);

    fireEvent.click(openButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "도우미 인증 실패 · 도우미를 다시 설치하세요",
    );
    // 403은 도우미가 응답한 것이므로 미설치 안내를 띄우지 않는다.
    expect(screen.queryByTestId("helper-missing-dialog")).not.toBeInTheDocument();
    // 도우미가 준 message는 그대로 쓰지 않는다(FR-013-E2가 문구를 확정했다).
    expect(screen.queryByText("허용되지 않은 출처입니다")).not.toBeInTheDocument();
  });

  it("도우미 토큰 파일이 없으면 호출하지 않고 미설치 안내를 보여준다", async () => {
    const calls = stubFetch({ token: () => jsonResponse({ token: null }) });
    render(<WorkflowsHeader />);

    fireEvent.click(openButton());

    expect(await screen.findByTestId("helper-missing-dialog")).toBeInTheDocument();
    expect(calls.filter((call) => call.url.endsWith("/open"))).toEqual([]);
  });
});
