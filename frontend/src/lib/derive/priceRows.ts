/** 10-1 단가 표기 (ui-spec SCR-10-1, FR-026-AC3): 소수 둘째 자리, 셋째 자리가 0이 아니면 셋째까지(예 `0.125`). */
export function priceText(value: number): string {
  const third = value.toFixed(3);
  return third.endsWith("0") ? value.toFixed(2) : third;
}
