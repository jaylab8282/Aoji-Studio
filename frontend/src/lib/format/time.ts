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
