import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[client.test] 403 UNAUTHORIZED_TOKEN → 재발급 후 1회 재시도, 두 번째 403은 전파", async () => {
    const { apiPost } = await import("./client");

    let tokenCalls = 0;
    let postCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) {
          tokenCalls += 1;
          return jsonResponse({ token: `token-${tokenCalls}`.padEnd(64, "0") }, 200);
        }
        if (url.includes("/api/workflows")) {
          postCalls += 1;
          return jsonResponse({ code: "UNAUTHORIZED_TOKEN", message: "토큰이 유효하지 않습니다" }, 403);
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    await expect(apiPost("/api/workflows", { name: "x" })).rejects.toMatchObject({
      code: "UNAUTHORIZED_TOKEN",
      message: "토큰이 유효하지 않습니다",
    });
    expect(postCalls).toBe(2); // 최초 요청 + 재시도 1회
    expect(tokenCalls).toBe(2); // 최초 발급 + 재발급 1회
  });

  it("[client.test] 다른 403(FORBIDDEN_ORIGIN)은 재시도하지 않고 바로 전파한다", async () => {
    const { apiPost } = await import("./client");

    let postCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) {
          return jsonResponse({ token: "a".repeat(64) });
        }
        if (url.includes("/api/workflows")) {
          postCalls += 1;
          return jsonResponse({ code: "FORBIDDEN_ORIGIN", message: "허용되지 않은 요청입니다" }, 403);
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    await expect(apiPost("/api/workflows", { name: "x" })).rejects.toMatchObject({ code: "FORBIDDEN_ORIGIN" });
    expect(postCalls).toBe(1);
  });

  it("[client.test] localStorage 미사용", async () => {
    const { apiGet } = await import("./client");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ hostPath: "/x" }, 200)),
    );

    await apiGet("/api/state");

    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("[client.test] GET 요청은 브라우저 토큰 헤더를 붙이지 않는다", async () => {
    const { apiGet } = await import("./client");

    let receivedHeaders: Record<string, string> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        receivedHeaders = init?.headers as Record<string, string> | undefined;
        return jsonResponse({ ok: true });
      }),
    );

    await apiGet("/api/state");

    expect(receivedHeaders?.["X-JayStudio-Browser-Token"]).toBeUndefined();
  });

  it("[client.test] 네트워크 오류는 '서버에 연결할 수 없습니다 · 다시 시도하세요'로 변환한다", async () => {
    const { apiGet } = await import("./client");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );

    await expect(apiGet("/api/state")).rejects.toMatchObject({
      message: "서버에 연결할 수 없습니다 · 다시 시도하세요",
    });
  });

  it("[conventions §4] JSON 파싱 실패·네트워크 예외 → ApiError 정규화", async () => {
    const { ApiError, apiGet, apiPost } = await import("./client");

    // 1) 200인데 본문이 JSON이 아니면 `JSON.parse`가 SyntaxError를 던진다.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) {
          return jsonResponse({ token: "a".repeat(64) });
        }
        return new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );

    const parseError = await apiGet("/api/state").catch((error: unknown) => error);
    expect(parseError).toBeInstanceOf(ApiError);
    expect(parseError).toMatchObject({
      code: "NETWORK_ERROR",
      message: "서버에 연결할 수 없습니다 · 다시 시도하세요",
    });
    expect(String((parseError as Error).message)).not.toMatch(/SyntaxError|JSON/);

    // 2) 토큰 발급 응답이 깨져도(POST 경로) 같은 `ApiError`로 나온다.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 200, headers: { "Content-Type": "text/html" } })),
    );

    const tokenError = await apiPost("/api/workflows", { name: "x" }).catch((error: unknown) => error);
    expect(tokenError).toBeInstanceOf(ApiError);
    expect(tokenError).toMatchObject({
      code: "NETWORK_ERROR",
      message: "서버에 연결할 수 없습니다 · 다시 시도하세요",
    });

    // 3) fetch 자체가 문자열을 던지는 등 Error가 아닌 값도 정규화된다.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "boom";
      }),
    );

    const oddError = await apiGet("/api/state").catch((error: unknown) => error);
    expect(oddError).toBeInstanceOf(ApiError);
    expect((oddError as Error).message).toBe("서버에 연결할 수 없습니다 · 다시 시도하세요");
  });
});
