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

const TOKEN_UNITS = [
  { suffix: "K", divisor: 1_000 },
  { suffix: "M", divisor: 1_000_000 },
  { suffix: "B", divisor: 1_000_000_000 },
] as const;

/**
 * 10 토큰 수치 축약(FR-025-AC8): 1,000 미만은 정수 그대로, 이상은 K·M·B 소수 둘째 자리(끝자리 0 유지).
 * 반올림 결과가 1000.00 이상이면 다음 단위로 올리고, B 초과 단위는 없다(정수부 천 단위 쉼표). 정수 연산으로 반올림한다.
 */
export function tokenText(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value < 1_000) return String(Math.round(value));
  let index = value >= 1_000_000_000 ? 2 : value >= 1_000_000 ? 1 : 0;
  for (;;) {
    const unit = TOKEN_UNITS[index] ?? TOKEN_UNITS[2];
    const hundredths = Math.floor(
      (value * 100 + unit.divisor / 2) / unit.divisor,
    );
    if (hundredths >= 100_000 && index < 2) {
      index += 1;
      continue;
    }
    const whole = Math.floor(hundredths / 100).toLocaleString("en-US");
    return `${whole}.${String(hundredths % 100).padStart(2, "0")}${unit.suffix}`;
  }
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
