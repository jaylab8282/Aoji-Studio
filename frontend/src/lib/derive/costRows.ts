/**
 * 10 날짜별 차트 계산 (ui-spec SCR-10 `10-7`, FR-025-AC4): `cost.byDate[]` → y축 눈금·막대 높이·캐시 읽기 비율·읽기용 표기.
 * 순수 함수다. 높이는 그날 토큰 합 / y축 최댓값(눈금 맨 위)이고, 막대 안은 아래 캐시 읽기 + 나머지로 나눈다.
 */
import type { CostByDate } from "../../api/types";
import { COST_ENTRYPOINT_CLI, COST_ENTRYPOINT_DESKTOP, EMPTY_VALUE_TEXT } from "../text";
import { commaText, millionsText, usdText, weekdayOf } from "./usageFormat";

/** y축 눈금 칸 수(눈금은 0 포함 5개). */
export const AXIS_STEPS = 4;
/** 눈금 한 칸의 최솟값: 0.01M. 이보다 작은 단위는 쓰지 않아 `M` 표기가 소수 둘째 자리 안에서 끝난다. */
const MIN_STEP_TOKENS = 10_000;
/** 눈금 간격 후보의 가수(1·2·4·5·10 × 10^k). */
const STEP_MANTISSAS = [1, 2, 4, 5, 10] as const;

export interface ChartBar {
  date: string;
  /** `MM-DD`. */
  monthDay: string;
  /** `일`~`토`. */
  weekday: string;
  total: number;
  /** 막대 높이: y축 최댓값 대비 0~100(백분율). */
  heightPercent: number;
  /** 막대 안 캐시 읽기 몫 0~1. */
  cacheRatio: number;
  /** `N.NM`. */
  totalText: string;
  /** `$N.NN`. */
  usdText: string;
  /** 막대 `aria-label`: `MM-DD (요일) 합계 N.NM 토큰, 추정 $N.NN`. */
  ariaLabel: string;
  /** 툴팁 둘째·셋째 줄의 토큰 4가지(천 단위 쉼표). */
  input: string;
  output: string;
  cacheCreation: string;
  cacheRead: string;
}

export interface ChartModel {
  /** 위에서 아래로: 맨 위 최댓값 … `0`. */
  ticks: string[];
  bars: ChartBar[];
}

/** 눈금 한 칸(토큰): `AXIS_STEPS`칸으로 `maxTotal`을 덮는 가장 작은 1·2·4·5×10^k. */
export function axisStep(maxTotal: number): number {
  const needed = Math.max(maxTotal / AXIS_STEPS, MIN_STEP_TOKENS);
  let scale = MIN_STEP_TOKENS;
  for (;;) {
    for (const mantissa of STEP_MANTISSAS) {
      if (mantissa * scale >= needed) return mantissa * scale;
    }
    scale *= 10;
  }
}

/** 눈금 글자: 0 → `0`, 그 밖은 백만 단위 `N.NNM`(뒤 0 제거). */
export function axisLabel(tokens: number): string {
  if (tokens === 0) return "0";
  return `${Number((tokens / 1_000_000).toFixed(2))}M`;
}

export function chartRows(byDate: readonly CostByDate[]): ChartModel {
  const maxTotal = byDate.reduce((max, row) => Math.max(max, row.tokens.total), 0);
  const step = axisStep(maxTotal);
  const axisMax = step * AXIS_STEPS;
  const ticks = Array.from({ length: AXIS_STEPS + 1 }, (_, index) => axisLabel(axisMax - step * index));
  const bars = byDate.map((row) => {
    const monthDay = row.date.slice(5);
    const weekday = weekdayOf(row.date);
    const totalText = millionsText(row.tokens.total);
    const amount = usdText(row.usd);
    return {
      date: row.date,
      monthDay,
      weekday,
      total: row.tokens.total,
      heightPercent: (row.tokens.total / axisMax) * 100,
      cacheRatio: row.tokens.total > 0 ? row.tokens.cacheRead / row.tokens.total : 0,
      totalText,
      usdText: amount,
      ariaLabel: `${monthDay} (${weekday}) 합계 ${totalText} 토큰, 추정 ${amount}`,
      input: commaText(row.tokens.input),
      output: commaText(row.tokens.output),
      cacheCreation: commaText(row.tokens.cacheCreation),
      cacheRead: commaText(row.tokens.cacheRead),
    };
  });
  return { ticks, bars };
}

/** 세션 표 진입 방식 표기: `CLI`/`데스크톱 앱`/원래 값/`-`. */
export function entrypointText(entrypoint: string | null): string {
  if (entrypoint === "cli") return COST_ENTRYPOINT_CLI;
  if (entrypoint === "claude-desktop") return COST_ENTRYPOINT_DESKTOP;
  return entrypoint ?? EMPTY_VALUE_TEXT;
}
