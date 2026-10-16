// 10 비용 화면 spec(e2e-21·e2e-21b·e2e-22)이 함께 쓰는 기대값·선택자·표기 도우미(T-R4-18). spec이 아니라 Playwright가 수집하지 않는다.
// 선택자는 ui-spec SCR-10·10-1의 `data-wf` 영역·역할·문구만 쓴다. 기대값은 `claude-home-basic/expected.json`(대화 기록 집계)에서 읽는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";

import { FIXTURES_DIR } from "../lib/e2e-state";

export interface TokenSums {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  total: number;
}

export type CostExpectedDate = TokenSums & { date: string; usd: string };

export interface CostExpected {
  totals: TokenSums & { usd: string; usdRounded: string };
  excludedModelCount: number;
  skippedFiles: number;
  fileCount: number;
  byModel: Array<TokenSums & { model: string; usd: string | null; priceModel: string | null }>;
  byDate: { UTC: CostExpectedDate[]; "Asia/Seoul": CostExpectedDate[] };
  bySession: Array<{
    sessionId: string;
    short: string;
    project: string;
    startedAt: string;
    entrypoint: string;
    total: number;
  }>;
  /** `usage.jsonl` 재생 뒤(e2e-19a 이후): 토큰 합 내림차순. 재생 전에는 `기본 세션` 대신 `미확인`이 크다. */
  byAgentAfterReplay: Array<TokenSums & { agent: string; usd: string }>;
  limitsFromCache: {
    fiveHour: { utilization: number; resets_at: string };
    sevenDay: { utilization: number; resets_at: string };
  };
}

export const costExpected: CostExpected = JSON.parse(
  readFileSync(join(FIXTURES_DIR, "claude-home-basic", "expected.json"), "utf8"),
) as CostExpected;

/** 대화 본문·계정 표지(NFR-14, FR-025-AC5·FR-027-AC7). 화면·API 응답 어디에도 나오면 안 된다. */
export const CONVO_MARKER = "AOJI-MARKER-CONVO-7f3a";
export const EMAIL_MARKER = "AOJI-MARKER-EMAIL-55d0";

// ── 표기 ─────────────────────────────────────────────────────────────────────────

/** 천 단위 쉼표. */
export function comma(value: number): string {
  return value.toLocaleString("en-US");
}

/** 십진수 문자열 → `$N.NN`(소수 둘째 자리, 셋째 자리에서 반올림). 부동소수 오차가 끼지 않게 문자열로 계산한다. */
export function usd2(decimal: string): string {
  const [integer = "0", fraction = ""] = decimal.split(".");
  const padded = `${fraction}000`.slice(0, 3);
  let cents = BigInt(integer) * 100n + BigInt(padded.slice(0, 2));
  if (padded.charAt(2) >= "5") {
    cents += 1n;
  }
  return `$${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

/** 차트 합계 표기 `N.NM`(백만, 소수 첫째). */
export function millions(total: number): string {
  return `${(total / 1_000_000).toFixed(1)}M`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** `YYYY-MM-DD` → `MM-DD`. */
export function monthDay(date: string): string {
  return date.slice(5);
}

/** `YYYY-MM-DD`의 요일(`일`~`토`). 날짜 자체가 로컬 날짜라 UTC로 읽어도 같다. */
export function weekdayKo(date: string): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

/** ISO 시각 → 그 시간대의 `MM-DD hh:mm`(세션 표 시작 시각). */
export function monthDayTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}`;
}

/** 진입 방식 표기(ui-spec SCR-10: `CLI`/`데스크톱 앱`/원래 값/`-`). */
export function entrypointLabel(entrypoint: string | null): string {
  if (entrypoint === "cli") return "CLI";
  if (entrypoint === "claude-desktop") return "데스크톱 앱";
  return entrypoint ?? "-";
}

/** 단가 표기: 소수 둘째 자리, 셋째 자리가 0이 아니면 셋째까지(예 `0.125`). */
export function priceText(value: number): string {
  const third = value.toFixed(3);
  return third.endsWith("0") ? value.toFixed(2) : third;
}

// ── 화면 선택자 (ui-spec SCR-10) ─────────────────────────────────────────────────

export function regExpEscape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 토큰 칸 하나: 라벨(`입력 토큰` 등)과 수치를 함께 가진 카드. */
export function tokenTile(page: Page, label: string): Locator {
  return page.locator('[data-wf="10-4"]').getByText(label, { exact: true }).locator("xpath=..");
}

export function readingStrip(page: Page): Locator {
  return page.locator('[data-wf="10-3"]');
}

export function splitCard(page: Page): Locator {
  return page.locator('[data-wf="10-10"]');
}

export async function selectSplitTab(page: Page, name: "모델별" | "세션별" | "에이전트별"): Promise<Locator> {
  const tab = splitCard(page).getByRole("tab", { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return splitCard(page).getByRole("tabpanel");
}

/** 나눔 표의 본문 줄(머리 제외)을 셀 글자 배열로 읽는다. 합계 줄도 들어 있다. */
export async function splitRows(panel: Locator): Promise<string[][]> {
  return panel
    .getByRole("row")
    .filter({ has: panel.page().getByRole("cell") })
    .evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll("td,[role='cell']")).map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
      ),
    );
}

/** 표 글자 `1,234`를 숫자로(숫자가 아니면 NaN). */
export function numberOf(text: string): number {
  return Number(text.replace(/,/g, ""));
}

// ── 구독·한도 카드 (10-6) ────────────────────────────────────────────────────────

export interface LimitSegments {
  plan: string;
  five: string;
  week: string;
}

/** 한도 카드 글자(`innerText`)를 즉시 읽는다(자체 대기 없음 — `measureFileChangeReflection`의 술어용). */
export async function limitsText(page: Page): Promise<string> {
  return page.evaluate(() => (document.querySelector('[data-wf="10-6"]') as HTMLElement | null)?.innerText ?? "");
}

/** `구독 플랜`·`5시간 한도`·`주간 한도` 라벨 사이를 잘라 각 줄의 글자로 나눈다(DOM 구조에 기대지 않는다, ui-spec 순서). */
export function limitSegments(text: string): LimitSegments {
  const plan = text.indexOf("구독 플랜");
  const five = text.indexOf("5시간 한도");
  const week = text.indexOf("주간 한도");
  const info = text.indexOf("Claude Code CLI");
  if (plan < 0 || five < 0 || week < 0) {
    return { plan: "", five: "", week: "" };
  }
  const end = info > week ? info : text.length;
  return {
    plan: text.slice(plan, five).replace(/\s+/g, " ").trim(),
    five: text.slice(five, week).replace(/\s+/g, " ").trim(),
    week: text.slice(week, end).replace(/\s+/g, " ").trim(),
  };
}

export async function readLimitSegments(page: Page): Promise<LimitSegments> {
  return limitSegments(await limitsText(page));
}

/**
 * 사용률 글자 패턴. 정수로 반올림하든 소수 첫째 자리·원래 값으로 보이든 받아들인다(표기 자릿수는 ui-spec이 정하지 않았다).
 * 정수 값을 쓰면 세 형태가 같다.
 */
export function percentPattern(value: number): RegExp {
  const forms = new Set([String(value), value.toFixed(1), String(Math.round(value))]);
  return new RegExp(`(?<![\\d.])(${[...forms].map(regExpEscape).join("|")})%`);
}
