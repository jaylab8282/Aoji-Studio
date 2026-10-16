import { describe, expect, it } from "vitest";
import { axisLabel, axisStep, chartRows, entrypointText } from "./costRows";
import { sums } from "../../test/fixtures/cost";

// ui-spec SCR-10 날짜별 차트(`10-7`): 눈금·막대 높이·`N.NM` 표기 (FR-025-AC4).
describe("costRows.chartRows", () => {
  it("[FR-025-AC4] 시안 같은 값: 최댓값 113.9M → 눈금 160M·120M·80M·40M·0, 막대 높이 = 합 / 160M", () => {
    const model = chartRows([
      { date: "2026-10-14", tokens: sums(61_020, 402_330, 3_904_100, 86_832_550 + 0), usd: 64.7 },
      { date: "2026-10-15", tokens: sums(0, 0, 0, 113_900_000), usd: 81.52 },
    ]);
    expect(model.ticks).toEqual(["160M", "120M", "80M", "40M", "0"]);
    expect(model.bars[1]?.heightPercent).toBeCloseTo((113_900_000 / 160_000_000) * 100, 6);
    expect(model.bars[1]?.heightPercent).toBeCloseTo(71.1875, 4);
  });

  it("[FR-025-AC4] 막대 이름 `MM-DD (요일) 합계 N.NM 토큰, 추정 $N.NN`, 읽기용 토큰 4가지는 쉼표", () => {
    const model = chartRows([{ date: "2026-10-14", tokens: sums(61_020, 402_330, 3_904_100, 86_832_550), usd: 64.7 }]);
    const bar = model.bars[0];
    expect(bar?.ariaLabel).toBe("10-14 (수) 합계 91.2M 토큰, 추정 $64.70");
    expect(bar).toMatchObject({
      monthDay: "10-14",
      weekday: "수",
      totalText: "91.2M",
      usdText: "$64.70",
      input: "61,020",
      output: "402,330",
      cacheCreation: "3,904,100",
      cacheRead: "86,832,550",
    });
  });

  it("[FR-025-AC4] 캐시 읽기 비율 = 캐시 읽기 / 합, 합 0인 날은 높이 0·비율 0", () => {
    const model = chartRows([
      { date: "2026-10-12", tokens: sums(0, 0, 0, 0), usd: 0 },
      { date: "2026-10-13", tokens: sums(10, 10, 0, 80), usd: 0.01 },
    ]);
    expect(model.bars[0]).toMatchObject({ total: 0, heightPercent: 0, cacheRatio: 0, totalText: "0.0M", usdText: "$0.00" });
    expect(model.bars[1]?.cacheRatio).toBeCloseTo(0.8, 6);
  });

  it("[FR-025-AC4] 기록이 작아도 눈금은 0.01M 단위 이상(`0.04M`…), 기록이 없으면 눈금만 있고 막대 높이 0", () => {
    const small = chartRows([{ date: "2026-10-10", tokens: sums(2_200, 900, 3_500, 18_000), usd: 0.05 }]);
    expect(small.ticks).toEqual(["0.04M", "0.03M", "0.02M", "0.01M", "0"]);
    expect(small.bars[0]?.heightPercent).toBeCloseTo((24_600 / 40_000) * 100, 6);
    const none = chartRows([{ date: "2026-10-10", tokens: sums(0, 0, 0, 0), usd: 0 }]);
    expect(none.ticks).toHaveLength(5);
    expect(none.bars[0]?.heightPercent).toBe(0);
  });

  it("[FR-025-AC4] 눈금 간격은 가장 작은 1·2·4·5×10^k이고 4칸이 최댓값을 덮는다 (가장 큰 막대는 100% 이하)", () => {
    expect(axisStep(113_900_000)).toBe(40_000_000);
    expect(axisStep(40_000_000)).toBe(10_000_000);
    expect(axisStep(41_000_000)).toBe(20_000_000);
    expect(axisStep(0)).toBe(10_000);
    for (const max of [1, 9_999, 123_456, 7_777_777, 99_999_999, 1_000_000_000]) {
      const step = axisStep(max);
      expect(step * 4).toBeGreaterThanOrEqual(max);
      const model = chartRows([{ date: "2026-10-10", tokens: sums(max, 0, 0, 0), usd: 0 }]);
      expect(model.bars[0]?.heightPercent).toBeLessThanOrEqual(100);
    }
  });

  it("[FR-025-AC4] 눈금 글자: 0 → `0`, 정수 M → `160M`, 소수는 뒤 0을 뗀 `0.5M`", () => {
    expect(axisLabel(0)).toBe("0");
    expect(axisLabel(160_000_000)).toBe("160M");
    expect(axisLabel(500_000)).toBe("0.5M");
    expect(axisLabel(10_000)).toBe("0.01M");
  });
});

describe("costRows.entrypointText", () => {
  it("[FR-025-AC3] 진입 방식: cli → CLI, claude-desktop → 데스크톱 앱, 그 밖은 원래 값, null → -", () => {
    expect(entrypointText("cli")).toBe("CLI");
    expect(entrypointText("claude-desktop")).toBe("데스크톱 앱");
    expect(entrypointText("sdk-ts")).toBe("sdk-ts");
    expect(entrypointText(null)).toBe("-");
  });
});
