import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_HELPER_TOKEN_HEADER, checkHelperHealth, getHelperToken, openHelperSession } from "./helper";

const HELPER_URL = "http://127.0.0.1:4181";
const HELPER_TOKEN = "b".repeat(64);
const BROWSER_TOKEN = "a".repeat(64);

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

interface Handlers {
  /** `GET /api/helper/token` 응답(기본: 토큰 있음). */
  token?: () => Response | Promise<Response>;
  /** 도우미 `POST /open` 응답(기본: 204). */
  open?: () => Response | Promise<Response>;
  /** 도우미 `GET /health` 응답(기본: 200 `{ok:true}`). */
  health?: () => Response | Promise<Response>;
}

/** 응답이 오지 않다가 2초 타임아웃의 `abort`에만 반응하는 프라미스(고정 대기 없이 경계를 만든다). */
function neverResolving(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise<Response>((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

function stubFetch(handlers: Handlers = {}): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/browser-token")) {
        return jsonResponse({ token: BROWSER_TOKEN });
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
      if (url.endsWith("/health")) {
        return handlers.health === undefined ? jsonResponse({ ok: true, version: "1" }) : handlers.health();
      }
      if (url.endsWith("/open")) {
        return handlers.open === undefined ? new Response(null, { status: 204 }) : handlers.open();
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function openCall(calls: FetchCall[]): FetchCall {
  const call = calls.find((candidate) => candidate.url.endsWith("/open"));
  if (call === undefined) throw new Error("도우미 /open 호출이 없다");
  return call;
}

describe("api/helper (FR-013)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("[FR-013-AC6][ADR-57] 도우미 헤더 상수 값 = 옛 도우미 헤더 이름(값 불변)", () => {
    const expected = "X-AojiStudio-Helper-Token".replace("Aoji", "Jay");
    expect(expected).toMatch(/^X-Jay.+-Helper-Token$/);
    expect(LEGACY_HELPER_TOKEN_HEADER).toBe(expected);
  });

  it("[FR-013-AC6] 요청 URL = config.helperUrl + '/open', 본문 키는 target(+leadName)뿐, 헤더 LEGACY_HELPER_TOKEN_HEADER 상수 이름", async () => {
    const calls = stubFetch();

    expect(await openHelperSession(HELPER_URL, { target: "default" })).toEqual({ kind: "opened" });

    const defaultCall = openCall(calls);
    expect(defaultCall.url).toBe(`${HELPER_URL}/open`);
    expect(defaultCall.method).toBe("POST");
    expect(defaultCall.headers[LEGACY_HELPER_TOKEN_HEADER]).toBe(HELPER_TOKEN);
    expect(defaultCall.headers["Content-Type"]).toBe("application/json");
    expect(Object.keys(JSON.parse(defaultCall.body ?? "{}"))).toEqual(["target"]);
    expect(JSON.parse(defaultCall.body ?? "{}")).toEqual({ target: "default" });

    const leadCalls = stubFetch();
    expect(await openHelperSession(HELPER_URL, { target: "lead", leadName: "dev-lead" })).toEqual({
      kind: "opened",
    });

    const leadCall = openCall(leadCalls);
    expect(Object.keys(JSON.parse(leadCall.body ?? "{}"))).toEqual(["target", "leadName"]);
    expect(JSON.parse(leadCall.body ?? "{}")).toEqual({ target: "lead", leadName: "dev-lead" });
    // 경로·명령·옵션은 보내지 않는다.
    expect(leadCall.body).not.toContain("claude");
    expect(leadCall.body).not.toContain("/Users");
    // 도우미 토큰은 헤더로만 간다(URL·본문에 없다).
    expect(leadCall.url).not.toContain(HELPER_TOKEN);
    expect(leadCall.body).not.toContain(HELPER_TOKEN);
  });

  it("[FR-013-AC9] 도우미가 2초 안에 응답하지 않으면 요청을 끊고 무응답으로 본다", async () => {
    vi.useFakeTimers();
    stubFetch({ open: () => neverResolving(currentSignal()) });

    let settled: unknown = null;
    void openHelperSession(HELPER_URL, { target: "default" }).then((result) => {
      settled = result;
    });

    await vi.advanceTimersByTimeAsync(1999);
    expect(settled).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual({ kind: "no-response" });
  });

  it("[FR-013-AC9][FR-013-E1] 연결 자체가 실패하면 무응답으로 본다", async () => {
    stubFetch({
      open: () => {
        throw new TypeError("Failed to fetch");
      },
    });

    expect(await openHelperSession(HELPER_URL, { target: "default" })).toEqual({ kind: "no-response" });
  });

  it("[FR-013-AC9] 토큰 파일이 없으면(token: null) 도우미를 호출하지 않는다", async () => {
    const calls = stubFetch({ token: () => jsonResponse({ token: null }) });

    expect(await openHelperSession(HELPER_URL, { target: "default" })).toEqual({ kind: "no-response" });
    expect(calls.filter((call) => call.url.endsWith("/open"))).toEqual([]);
  });

  it("[FR-013-E2] 도우미가 403으로 거부하면 인증 실패 갈래를 돌려준다", async () => {
    stubFetch({
      open: () => jsonResponse({ code: "UNAUTHORIZED_TOKEN", message: "토큰이 다릅니다" }, 403),
    });

    expect(await openHelperSession(HELPER_URL, { target: "default" })).toEqual({ kind: "auth-failed" });
  });

  it("[FR-013-E3] 도우미가 400으로 거부하면 도우미가 준 message를 그대로 돌려준다", async () => {
    stubFetch({
      open: () =>
        jsonResponse({ code: "INVALID_NAME", message: "팀장 name 형식이 올바르지 않습니다" }, 400),
    });

    expect(await openHelperSession(HELPER_URL, { target: "lead", leadName: "dev-lead" })).toEqual({
      kind: "message",
      message: "팀장 name 형식이 올바르지 않습니다",
    });
  });

  it("도우미가 500으로 실패하면 도우미 message를, 본문이 없으면 공통 문구를 돌려준다", async () => {
    stubFetch({ open: () => jsonResponse({ code: "OPEN_FAILED", message: "터미널을 열지 못했습니다" }, 500) });
    expect(await openHelperSession(HELPER_URL, { target: "default" })).toEqual({
      kind: "message",
      message: "터미널을 열지 못했습니다",
    });

    stubFetch({ open: () => new Response("<html>", { status: 500 }) });
    expect(await openHelperSession(HELPER_URL, { target: "default" })).toEqual({
      kind: "message",
      message: "서버에 연결할 수 없습니다 · 다시 시도하세요",
    });
  });

  it("서버가 도우미 토큰을 주지 못하면(403) 서버 message를 그대로 돌려주고 도우미를 호출하지 않는다", async () => {
    const calls = stubFetch({
      token: () =>
        jsonResponse(
          {
            code: "FORBIDDEN_ORIGIN",
            message: "허용되지 않은 출처입니다 · http://127.0.0.1:4180 주소로 다시 접속하세요",
          },
          403,
        ),
    });

    expect(await openHelperSession(HELPER_URL, { target: "default" })).toEqual({
      kind: "message",
      message: "허용되지 않은 출처입니다 · http://127.0.0.1:4180 주소로 다시 접속하세요",
    });
    expect(calls.filter((call) => call.url.endsWith("/open"))).toEqual([]);
  });

  it("[FR-013-AC8] GET /api/helper/token은 브라우저 토큰 헤더를 붙여 보내고 token 값과 null을 구분한다", async () => {
    const calls = stubFetch();
    expect(await getHelperToken()).toEqual({ kind: "token", token: HELPER_TOKEN });
    // 서버(HelperTokenController)가 이 GET에서도 브라우저 토큰을 직접 검사한다(api-spec `security: browserToken`).
    expect(calls[0]?.headers["X-AojiStudio-Browser-Token"]).toBe(BROWSER_TOKEN);

    stubFetch({ token: () => jsonResponse({ token: null }) });
    expect(await getHelperToken()).toEqual({ kind: "no-token" });
  });

  it("[FR-013-AC10] GET /health가 응답하면 설치됨, 2초 안에 응답하지 않으면 미설치로 본다", async () => {
    const calls = stubFetch();
    expect(await checkHelperHealth(HELPER_URL)).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([`GET ${HELPER_URL}/health`]);
    // `/health`는 Origin 검사만 한다 — 토큰을 보내지 않는다(api-spec.yaml).
    expect(calls[0]?.headers[LEGACY_HELPER_TOKEN_HEADER]).toBeUndefined();

    vi.useFakeTimers();
    stubFetch({ health: () => neverResolving(currentSignal()) });
    let healthy: boolean | null = null;
    void checkHelperHealth(HELPER_URL).then((result) => {
      healthy = result;
    });

    await vi.advanceTimersByTimeAsync(1999);
    expect(healthy).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(healthy).toBe(false);
  });
});

/**
 * 대역이 응답을 만들 때 그 호출에 실린 `AbortSignal`을 꺼낸다.
 * `vi.stubGlobal`로 넣은 mock의 마지막 인자에서 읽는다.
 */
function currentSignal(): AbortSignal | null | undefined {
  const mock = fetch as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } };
  const lastCall = mock.mock.calls[mock.mock.calls.length - 1];
  return lastCall?.[1]?.signal;
}
