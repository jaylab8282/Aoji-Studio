import { describe, expect, it } from "vitest";
import { formatRailTimestamp, formatTimestamp } from "./time";

// 테스트 시간대는 setup.ts에서 Asia/Seoul(+09:00)로 고정된다.
const NOW = new Date("2026-10-06T10:00:00+09:00");

describe("time [FR-003-AC6]", () => {
  it("[FR-003-AC6] 오늘이면 hh:mm:ss", () => {
    expect(formatTimestamp("2026-10-06T08:05:09+09:00", NOW)).toBe("08:05:09");
  });

  it("[FR-003-AC6] 오늘이 아니면(어제) yyyy-mm-dd hh:mm", () => {
    expect(formatTimestamp("2026-10-05T18:20:33+09:00", NOW)).toBe("2026-10-05 18:20");
  });

  it("[FR-003-AC6] 자정 경계: 로컬 날짜로 판정한다", () => {
    // 2026-10-05T15:30Z = 서울 10-06 00:30 → 오늘
    expect(formatTimestamp("2026-10-05T15:30:00Z", NOW)).toBe("00:30:00");
    // 2026-10-05T14:59Z = 서울 10-05 23:59 → 어제
    expect(formatTimestamp("2026-10-05T14:59:00Z", NOW)).toBe("2026-10-05 23:59");
  });

  it("[FR-003-AC6] 레일 축약: 오늘 hh:mm, 아니면 mm-dd", () => {
    expect(formatRailTimestamp("2026-10-06T08:05:09+09:00", NOW)).toBe("08:05");
    expect(formatRailTimestamp("2026-10-04T18:20:00+09:00", NOW)).toBe("10-04");
  });

  it("[FR-003-AC6] 값이 없으면 없음", () => {
    expect(formatTimestamp(null, NOW)).toBe("없음");
    expect(formatRailTimestamp(null, NOW)).toBe("없음");
  });
});
