/**
 * 테스트 전용 `GET /api/cost`·`/api/limits`·`/api/pricing` fixture. api-spec.yaml `CostReport`·`Limits`·`PriceTable` 스키마를 그대로 따른다.
 */
import type { CostReport, LimitValue, Limits, PriceTable, TokenSums, TranscriptStatus } from "../../api/types";

export function sums(input: number, output: number, cacheCreation: number, cacheRead: number): TokenSums {
  return { input, output, cacheCreation, cacheRead, total: input + output + cacheCreation + cacheRead };
}

export const READY_TRANSCRIPTS: TranscriptStatus = {
  connected: true,
  state: "ready",
  readFiles: 1280,
  totalFiles: 1280,
  skippedFiles: 3,
};

export const NOT_CONNECTED_TRANSCRIPTS: TranscriptStatus = {
  connected: false,
  state: "not-connected",
  readFiles: 0,
  totalFiles: 0,
  skippedFiles: 0,
};

/** 합계 = 모델 3개(그중 하나 단가 없음) = 세션 2개 = 에이전트 3개 = 날짜 3일. */
export function buildCostReport(overrides: Partial<CostReport> = {}): CostReport {
  const totals = sums(1000, 500, 200, 98300);
  return {
    period: "7d",
    range: { from: "2026-10-13", to: "2026-10-15" },
    transcripts: READY_TRANSCRIPTS,
    totals,
    estimate: { usd: 1.2345, excludedModelCount: 1 },
    byDate: [
      { date: "2026-10-13", tokens: sums(100, 50, 0, 49_850), usd: 0.4 },
      { date: "2026-10-14", tokens: sums(900, 450, 200, 0), usd: 0.8345 },
      { date: "2026-10-15", tokens: sums(0, 0, 0, 48_450), usd: 0 },
    ],
    byModel: [
      { model: "claude-opus-4-6", tokens: sums(700, 300, 200, 90_000), usd: 1.2345 },
      { model: "claude-haiku-4-5", tokens: sums(300, 200, 0, 8_300), usd: 0 },
      { model: "claude-opus-5-5", tokens: sums(0, 0, 0, 0), usd: null },
    ],
    bySession: [
      {
        sessionId: "e5f6a7b8-0000-4000-8000-000000000002",
        project: "/home/fixture/work/aoji-fixture-app",
        startedAt: "2026-10-14T09:05:00+09:00",
        entrypoint: "cli",
        tokens: sums(900, 450, 200, 0),
        usd: 0.8345,
      },
      {
        sessionId: "a1b2c3d4-0000-4000-8000-000000000001",
        project: null,
        startedAt: null,
        entrypoint: "claude-desktop",
        tokens: sums(100, 50, 0, 98_300),
        usd: 0.4,
      },
      {
        sessionId: "c0ffee00-0000-4000-8000-000000000003",
        project: "/home/fixture/work/other",
        startedAt: "2026-10-13T23:30:00+09:00",
        entrypoint: "sdk-ts",
        tokens: sums(0, 0, 0, 0),
        usd: 0,
      },
    ],
    byAgent: [
      { agent: null, kind: "main", tokens: sums(800, 400, 200, 90_000), usd: 1 },
      { agent: "web-reviewer", kind: "agent", tokens: sums(200, 100, 0, 8_300), usd: 0.2345 },
      { agent: null, kind: "unknown", tokens: sums(0, 0, 0, 0), usd: 0 },
    ],
    ...overrides,
  };
}

export function okLimit(usedPercent: number, resetsAt: string, source: "statusline" | "cache", receivedAt: string): LimitValue {
  return { state: "ok", usedPercent, resetsAt, source, receivedAt };
}

export const MISSING_LIMIT: LimitValue = { state: "missing", usedPercent: null, resetsAt: null, source: "statusline", receivedAt: "2026-10-15T14:28:05+09:00" };
export const NEVER_LIMIT: LimitValue = { state: "never", usedPercent: null, resetsAt: null, source: null, receivedAt: null };

export function buildLimits(overrides: Partial<Limits> = {}): Limits {
  return {
    plan: { value: "max", receivedAt: "2026-10-15T14:28:05+09:00" },
    fiveHour: okLimit(42, "2099-01-01T16:00:00+09:00", "statusline", "2026-10-15T14:28:05+09:00"),
    sevenDay: okLimit(63, "2099-01-04T09:00:00+09:00", "cache", "2026-10-15T14:30:12+09:00"),
    statuslineLastReceivedAt: "2026-10-15T14:28:05+09:00",
    ...overrides,
  };
}

export const NEVER_LIMITS: Limits = {
  plan: { value: null, receivedAt: null },
  fiveHour: NEVER_LIMIT,
  sevenDay: NEVER_LIMIT,
  statuslineLastReceivedAt: null,
};

export const PRICES: PriceTable = {
  source: "Anthropic 가격표",
  checkedAt: "2026-10-15",
  unit: "USD / 1M tokens",
  models: [
    { model: "claude-haiku-4-5", input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
    { model: "claude-opus-4-6", input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
    { model: "claude-sonnet-4-6", input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.125 },
  ],
};
