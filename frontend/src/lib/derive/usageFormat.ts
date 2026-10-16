/**
 * 08·09·10 사용 수치 표기 (ui-spec SCR-08 활용도 칸, FR-019-AC2·AC7).
 * 서버 `percent`는 반올림 전 값(0~100)이고 화면은 소수 첫째 자리까지 쓴다. null(기간 안 모든 스킬 사용 0)은 표기하지 않는다(`기록 없음`).
 */
export function percentText(percent: number | null): string | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  return percent.toFixed(1);
}
