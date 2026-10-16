/**
 * 08·09·10(·07 상태줄)의 기간 조회 클라이언트 (api-spec.yaml `/api/skills`·`/api/mcp`·`/api/cost`·`/api/pricing`·`/api/limits`,
 * conventions.md §7 MUST: 기간 조회는 이 파일만 부른다).
 * `tz`는 브라우저 시간대(`Intl.DateTimeFormat().resolvedOptions().timeZone`)를 그대로 보낸다(ADR-80, ADR-86).
 * 재조회 시점은 `state/usageSignalStore.ts`의 영역 신호와 `registry` revision 변화뿐이다(타이머 폴링 없음).
 */
import { apiGet } from "./client";
import type { CostReport, Limits, McpReport, PriceTable, SkillsReport, UsagePeriod } from "./types";

/** 브라우저 IANA 시간대. 날짜 경계·날짜별 나눔의 기준이다. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function periodQuery(period: UsagePeriod, timeZone: string): string {
  return `period=${encodeURIComponent(period)}&tz=${encodeURIComponent(timeZone)}`;
}

/** 08 스킬 목록 + 기간 안 사용(FR-018·FR-019). */
export function fetchSkills(period: UsagePeriod, timeZone: string = browserTimeZone()): Promise<SkillsReport> {
  return apiGet<SkillsReport>(`/api/skills?${periodQuery(period, timeZone)}`);
}

/** 09 MCP 서버 목록 + 사용 에이전트(FR-023·FR-024). */
export function fetchMcp(period: UsagePeriod, timeZone: string = browserTimeZone()): Promise<McpReport> {
  return apiGet<McpReport>(`/api/mcp?${periodQuery(period, timeZone)}`);
}

/** 10 토큰 사용량·추정 금액(FR-025·FR-026). */
export function fetchCost(period: UsagePeriod, timeZone: string = browserTimeZone()): Promise<CostReport> {
  return apiGet<CostReport>(`/api/cost?${periodQuery(period, timeZone)}`);
}

/** 10-1 단가표(읽기 전용, FR-026-AC3). */
export function fetchPricing(): Promise<PriceTable> {
  return apiGet<PriceTable>("/api/pricing");
}

/** 10 구독 플랜·5시간·주간 한도(FR-027). */
export function fetchLimits(): Promise<Limits> {
  return apiGet<Limits>("/api/limits");
}
