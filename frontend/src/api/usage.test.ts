import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserTimeZone, fetchCost, fetchLimits, fetchMcp, fetchPricing, fetchSkills } from "./usage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("api/usage (api-spec 1.2.0 기간 조회)", () => {
  let urls: string[];

  beforeEach(() => {
    urls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        return jsonResponse({ ok: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[ADR-86] 기간 조회는 period와 tz(브라우저 IANA 시간대, percent-encoding)를 함께 보낸다", async () => {
    await fetchSkills("7d", "Asia/Seoul");
    await fetchMcp("30d", "Asia/Seoul");
    await fetchCost("all", "America/Los_Angeles");

    expect(urls).toEqual([
      "/api/skills?period=7d&tz=Asia%2FSeoul",
      "/api/mcp?period=30d&tz=Asia%2FSeoul",
      "/api/cost?period=all&tz=America%2FLos_Angeles",
    ]);
  });

  it("[ADR-86] tz를 생략하면 Intl 시간대를 그대로 보낸다", async () => {
    await fetchSkills("7d");
    expect(urls[0]).toBe(`/api/skills?period=7d&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
    expect(browserTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("단가표와 한도는 기간 파라미터 없이 읽는다", async () => {
    await fetchPricing();
    await fetchLimits();
    expect(urls).toEqual(["/api/pricing", "/api/limits"]);
  });
});
