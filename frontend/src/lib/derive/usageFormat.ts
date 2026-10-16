/**
 * 08·09·10 사용 수치 표기 (ui-spec SCR-08 활용도 칸, FR-019-AC2·AC7).
 * 서버 `percent`는 반올림 전 값(0~100)이고 화면은 소수 첫째 자리까지 쓴다. null(기간 안 모든 스킬 사용 0)은 표기하지 않는다(`기록 없음`).
 */
export function percentText(percent: number | null): string | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  return percent.toFixed(1);
}

/** 천 단위 쉼표(10 토큰 칸·표). */
export function commaText(value: number): string {
  return value.toLocaleString("en-US");
}

/** `$` + 소수 둘째 자리(FR-026-AC1). 서버 값은 반올림 전이다. */
export function usdText(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** 차트·툴팁 합계 `N.NM`(백만, 소수 첫째). */
export function millionsText(tokens: number): string {
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** `YYYY-MM-DD`(브라우저 로컬 날짜)의 요일 `일`~`토`. 날짜 자체가 로컬 날짜라 UTC로 읽어도 같다. */
export function weekdayOf(date: string): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}
