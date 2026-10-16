/** 막대 채움 비율을 0~1로 자른다(NaN·무한대는 0). `Meter`가 쓴다. */
export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.max(0, ratio));
}
