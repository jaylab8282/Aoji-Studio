/**
 * 기간 표기 (ui-spec SCR-08 목록 머리 `활용도 · 최근 7일`·펼친 내용 `사용 횟수 · 최근 7일`, FR-019-AC4).
 * `7d`·`30d`는 오늘(브라우저 로컬 날짜)을 포함한 최근 N일, `all`은 일별 집계에 남은 모든 날짜다. 날짜 범위는 서버 `range`가 준다.
 */
import type { UsagePeriod } from "../../api/types";
import { PERIOD_WINDOW_TEXT } from "../text";

export function periodWindowText(period: UsagePeriod): string {
  return PERIOD_WINDOW_TEXT[period];
}
