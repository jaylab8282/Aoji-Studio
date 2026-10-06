import { describe, expect, it } from "vitest";
import { collectorStage, deriveCollectorStatus } from "./collectorStatus";

const NOW = new Date("2026-10-06T10:00:00+09:00");

describe("collectorStatus [FR-003-AC6]", () => {
  it("[FR-003-AC6] hook 설정됨 + 수신 있음 = live(시안) · 오늘 hh:mm:ss · 레일 hh:mm", () => {
    const v = deriveCollectorStatus(
      { hookConfigured: true, everReceived: true, lastReceivedAt: "2026-10-06T09:41:07+09:00" },
      NOW,
    );
    expect(v.stage).toBe("live");
    expect(v.chipText).toBe("hook 설정됨");
    expect(v.lastReceivedText).toBe("09:41:07");
    expect(v.railText).toBe("09:41");
    expect(v.label).toBe("수집 상태 · hook 설정됨 · 마지막 수신 09:41:07");
  });

  it("[FR-003-AC6] 오늘이 아닌 수신은 날짜까지, 레일은 mm-dd", () => {
    const v = deriveCollectorStatus(
      { hookConfigured: true, everReceived: true, lastReceivedAt: "2026-10-04T18:20:00+09:00" },
      NOW,
    );
    expect(v.lastReceivedText).toBe("2026-10-04 18:20");
    expect(v.railText).toBe("10-04");
  });

  it("[FR-003-AC6] hook 설정됨 + 수신 없음 = neutral · 없음", () => {
    const v = deriveCollectorStatus({ hookConfigured: true, everReceived: false, lastReceivedAt: null }, NOW);
    expect(v.stage).toBe("neutral");
    expect(v.chipText).toBe("hook 설정됨");
    expect(v.railText).toBe("없음");
    expect(v.label).toBe("수집 상태 · hook 설정됨 · 마지막 수신 없음");
  });

  it("[FR-003-AC6] hook 설정 안 됨 = unset(빨강) · 레일 미설정", () => {
    const v = deriveCollectorStatus({ hookConfigured: false, everReceived: false, lastReceivedAt: null }, NOW);
    expect(v.stage).toBe("unset");
    expect(v.chipText).toBe("hook 설정 안 됨");
    expect(v.railText).toBe("미설정");
    expect(v.label).toBe("수집 상태 · hook 설정 안 됨 · 마지막 수신 없음");
  });

  it("[FR-003-AC6] 설정이 없으면 수신 기록이 있어도 unset", () => {
    expect(collectorStage({ hookConfigured: false, everReceived: true })).toBe("unset");
  });

  it("[FR-003-AC6] 시간이 지나도 단계가 바뀌지 않는다(마지막 수신이 아주 오래돼도 live)", () => {
    const input = { hookConfigured: true, everReceived: true, lastReceivedAt: "2026-01-01T00:00:00+09:00" };
    expect(deriveCollectorStatus(input, NOW).stage).toBe("live");
    expect(deriveCollectorStatus(input, new Date("2030-01-01T00:00:00+09:00")).stage).toBe("live");
    const never = { hookConfigured: true, everReceived: false, lastReceivedAt: null };
    expect(deriveCollectorStatus(never, new Date("2030-01-01T00:00:00+09:00")).stage).toBe("neutral");
  });
});
