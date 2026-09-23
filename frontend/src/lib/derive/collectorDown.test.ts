import { describe, expect, it } from "vitest";
import { displayStatus, isCollectorDown } from "./collectorDown";

describe("isCollectorDown", () => {
  it("[FR-007-E1] everReceived false 또는 hookConfigured false → 수집 중단", () => {
    expect(isCollectorDown({ everReceived: false, hookConfigured: true })).toBe(true);
    expect(isCollectorDown({ everReceived: true, hookConfigured: false })).toBe(true);
    expect(isCollectorDown({ everReceived: false, hookConfigured: false })).toBe(true);
    expect(isCollectorDown({ everReceived: true, hookConfigured: true })).toBe(false);
  });

  it("[FR-007-E1] 수집 중단이면 표시 상태만 idle로 고정, 아니면 실제 상태 그대로", () => {
    expect(displayStatus("running", true)).toBe("idle");
    expect(displayStatus("waiting", true)).toBe("idle");
    expect(displayStatus("running", false)).toBe("running");
    expect(displayStatus("waiting", false)).toBe("waiting");
  });
});
