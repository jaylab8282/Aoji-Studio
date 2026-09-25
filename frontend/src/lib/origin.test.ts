import { describe, expect, it, vi } from "vitest";
import { canonicalHref, redirectToCanonical } from "./origin";

describe("origin", () => {
  it("[ADR-41] localhost·[::1] → 호스트명만 127.0.0.1로 바뀐 href, 포트·경로·쿼리·해시 유지", () => {
    expect(canonicalHref("http://localhost:4180/workflows?x=1#top")).toBe(
      "http://127.0.0.1:4180/workflows?x=1#top",
    );
    expect(canonicalHref("http://[::1]:4180/workflows?x=1#top")).toBe(
      "http://127.0.0.1:4180/workflows?x=1#top",
    );
    // 포트가 다른 배치(E2E 4190)에서도 포트를 바꾸지 않는다.
    expect(canonicalHref("http://localhost:4190/workflows?x=1")).toBe(
      "http://127.0.0.1:4190/workflows?x=1",
    );
    // 포트 없는 주소도 포트를 만들어 붙이지 않는다.
    expect(canonicalHref("http://localhost/")).toBe("http://127.0.0.1/");
    // 호스트명 대소문자는 URL 규칙대로 소문자로 읽는다.
    expect(canonicalHref("http://LOCALHOST:4180/")).toBe("http://127.0.0.1:4180/");
  });

  it("[ADR-41] 127.0.0.1·그 밖의 호스트명 → null(이동 없음)", () => {
    expect(canonicalHref("http://127.0.0.1:4180/workflows?x=1#top")).toBeNull();
    expect(canonicalHref("http://127.0.0.1:5173/")).toBeNull();
    expect(canonicalHref("http://example.com:4180/")).toBeNull();
    expect(canonicalHref("http://localhost.example.com:4180/")).toBeNull();
    expect(canonicalHref("http://192.168.0.10:4180/")).toBeNull();
    // 정규화 결과를 다시 넣으면 null이므로 리다이렉트 루프가 생기지 않는다.
    const once = canonicalHref("http://localhost:4180/workflows?x=1#top");
    expect(once).not.toBeNull();
    expect(canonicalHref(once as string)).toBeNull();
  });

  it("[ADR-41] https·다른 스킴 → null", () => {
    expect(canonicalHref("https://localhost:4180/workflows")).toBeNull();
    expect(canonicalHref("https://[::1]:4180/workflows")).toBeNull();
    expect(canonicalHref("file:///Users/me/index.html")).toBeNull();
    expect(canonicalHref("about:blank")).toBeNull();
    expect(canonicalHref("/workflows?x=1")).toBeNull();
    expect(canonicalHref("")).toBeNull();
  });

  it("[ADR-41] redirectToCanonical(가짜 location) — localhost면 replace 1회 호출 후 true 반환, 127.0.0.1이면 호출 없이 false 반환", () => {
    const moving = { href: "http://localhost:4180/workflows?x=1#top", replace: vi.fn() };
    expect(redirectToCanonical(moving)).toBe(true);
    expect(moving.replace).toHaveBeenCalledTimes(1);
    expect(moving.replace).toHaveBeenCalledWith("http://127.0.0.1:4180/workflows?x=1#top");

    const ipv6 = { href: "http://[::1]:4190/", replace: vi.fn() };
    expect(redirectToCanonical(ipv6)).toBe(true);
    expect(ipv6.replace).toHaveBeenCalledTimes(1);
    expect(ipv6.replace).toHaveBeenCalledWith("http://127.0.0.1:4190/");

    const staying = { href: "http://127.0.0.1:4180/workflows?x=1#top", replace: vi.fn() };
    expect(redirectToCanonical(staying)).toBe(false);
    expect(staying.replace).not.toHaveBeenCalled();

    const https = { href: "https://localhost:4180/", replace: vi.fn() };
    expect(redirectToCanonical(https)).toBe(false);
    expect(https.replace).not.toHaveBeenCalled();
  });
});
