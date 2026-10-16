import { describe, expect, it } from "vitest";
import { limitsView, resetTimeText, sourceLineText } from "./limitDisplay";
import { MISSING_LIMIT, NEVER_LIMITS, buildLimits, okLimit } from "../../test/fixtures/cost";

// TZ는 test/setup.ts가 Asia/Seoul로 고정한다. ui-spec SCR-10 `10-6`.
const NOW = new Date("2026-10-15T14:31:05+09:00");

describe("limitDisplay", () => {
  it("[FR-027-AC4] 출처 줄 `<출처> · N분 전 hh:mm:ss`: 분은 버림, 출처 없음 → null, 받은 시각 없음 → 출처만", () => {
    expect(sourceLineText("상태줄", "2026-10-15T14:28:05+09:00", NOW)).toBe("상태줄 · 3분 전 14:28:05");
    expect(sourceLineText("한도 캐시", "2026-10-15T14:30:12+09:00", NOW)).toBe("한도 캐시 · 0분 전 14:30:12");
    expect(sourceLineText("한도 캐시", null, NOW)).toBe("한도 캐시");
    expect(sourceLineText(null, null, NOW)).toBeNull();
  });

  it("[FR-027-AC5] 초기화 시각: 오늘이면 `hh:mm`, 아니면 `MM-DD (요일) hh:mm`", () => {
    expect(resetTimeText("2026-10-15T16:00:00+09:00", NOW)).toBe("16:00");
    expect(resetTimeText("2026-10-19T09:00:00+09:00", NOW)).toBe("10-19 (월) 09:00");
  });

  it("[FR-027-AC4] 5시간·주간 값: 정수 `N%`, 막대 비율은 반올림 전, 출처는 행마다(상태줄/한도 캐시), 플랜은 상태줄 출처", () => {
    const view = limitsView(
      buildLimits({
        fiveHour: okLimit(41.6, "2026-10-15T16:00:00+09:00", "statusline", "2026-10-15T14:28:05+09:00"),
        sevenDay: okLimit(63, "2026-10-19T09:00:00+09:00", "cache", "2026-10-15T14:30:12+09:00"),
      }),
      NOW,
    );
    expect(view.neverReceived).toBe(false);
    expect(view.plan).toEqual({ value: "max", sourceText: "상태줄 · 3분 전 14:28:05" });
    expect(view.fiveHour).toMatchObject({
      kind: "ok",
      percentText: "42%",
      percentValue: 42,
      resetText: "16:00",
      sourceText: "상태줄 · 3분 전 14:28:05",
    });
    expect(view.fiveHour.kind === "ok" ? view.fiveHour.ratio : -1).toBeCloseTo(0.416, 9);
    expect(view.sevenDay).toMatchObject({ kind: "ok", percentText: "63%", resetText: "10-19 (월) 09:00", sourceText: "한도 캐시 · 0분 전 14:30:12" });
  });

  it("[FR-027-AC5] 초기화 시각이 지났으면 사용률 대신 `초기화됨` 상태(막대 비움), 아직이면 값", () => {
    const view = limitsView(
      buildLimits({
        fiveHour: okLimit(90, "2026-10-15T14:00:00+09:00", "statusline", "2026-10-15T13:00:00+09:00"),
        sevenDay: okLimit(10, "2026-10-15T14:31:06+09:00", "statusline", "2026-10-15T13:00:00+09:00"),
      }),
      NOW,
    );
    expect(view.fiveHour).toMatchObject({ kind: "reset", resetText: "14:00" });
    expect(view.sevenDay.kind).toBe("ok");
  });

  it("[FR-027-E2] `missing` 항목은 `값 없음` 상태이고 플랜 null은 알 수 없음(출처 줄 없음)", () => {
    const view = limitsView(buildLimits({ plan: { value: null, receivedAt: null }, fiveHour: MISSING_LIMIT }), NOW);
    expect(view.fiveHour).toMatchObject({ kind: "missing", resetText: null });
    expect(view.plan).toEqual({ value: null, sourceText: null });
    expect(view.sevenDay.kind).toBe("ok");
  });

  it("[FR-027-E1] 5시간·주간이 모두 `never`면 받은 적 없음, 하나라도 값이 있으면 아니다", () => {
    expect(limitsView(NEVER_LIMITS, NOW).neverReceived).toBe(true);
    expect(limitsView(buildLimits({ fiveHour: NEVER_LIMITS.fiveHour }), NOW).neverReceived).toBe(false);
    expect(limitsView(NEVER_LIMITS, NOW).fiveHour.kind).toBe("missing");
  });
});
