/**
 * 시각 표기 (conventions.md §3 공통 MUST): 서버는 ISO-8601 offset 문자열을 주고,
 * 프론트는 이 파일로만 화면용 로컬 시각 문자열을 만든다.
 */

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** `hh:mm:ss` (이벤트 시각, 마지막 수신 시각 등). */
export function formatHms(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** `yyyy-mm-dd hh:mm` (04-4 배너, 워크플로우 카드 "마지막 활동" 등). */
export function formatDateHm(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `hh:mm` (03 선택 패널 최근 이벤트 목록). */
export function formatHm(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 시각이 없을 때 쓰는 글자(마지막 수신 없음 등). */
export const NO_TIME_TEXT = "없음";

function isSameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * 전 화면 공통 시각 표기 (ADR-72): 오늘(브라우저 로컬 날짜)이면 `hh:mm:ss`, 아니면 `yyyy-mm-dd hh:mm`.
 * 값이 없으면 `없음`. `now`는 테스트 주입용이다.
 */
export function formatTimestamp(iso: string | null, now: Date = new Date()): string {
  if (iso === null) {
    return NO_TIME_TEXT;
  }
  return isSameLocalDate(new Date(iso), now) ? formatHms(iso) : formatDateHm(iso);
}

/**
 * 레일 축약 (ADR-72): 오늘이면 `hh:mm`, 아니면 `mm-dd`. 값이 없으면 `없음`.
 */
export function formatRailTimestamp(iso: string | null, now: Date = new Date()): string {
  if (iso === null) {
    return NO_TIME_TEXT;
  }
  const d = new Date(iso);
  return isSameLocalDate(d, now) ? formatHm(iso) : `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
