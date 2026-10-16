// 09 MCP 화면 spec(e2e-19b·e2e-20·e2e-21b)이 함께 쓰는 선택자·기대값 도우미(T-R4-17). spec이 아니라 Playwright가 수집하지 않는다.
// 선택자는 ui-spec SCR-09의 `data-wf` 영역·역할·문구만 쓴다. 행 = 그 이름의 펼침 버튼(`<이름> 펼치기`/`<이름> 접기`)을 가진 `listitem`(08과 같은 규칙).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";

import { FIXTURES_DIR } from "../lib/e2e-state";

export const MASK = "••••••••";
/** fixture 전체에 심은 비밀 표지(NFR-14). 화면 어디에도 나오면 안 된다. */
export const ENV_MARKER = "AOJI-MARKER-ENV-91c2";
/**
 * e2e-19b `[FR-024-AC3]`가 `usage-changed`를 일으키려고 `usage.jsonl` 31번 줄(기본 세션의 `mcp__github__get_issue`)을 이 횟수만큼 더 재생한다.
 * 파일 이름순으로 e2e-19b가 e2e-20보다 먼저 돌므로 e2e-20의 `github` 기본 세션 횟수는 `expected`의 값 또는 값 + 이 상수다.
 */
export const LIVE_EXTRA_GITHUB_MAIN_CALLS = 3;
export const GITHUB_MAIN_CALL_LINE = 31;

export interface McpLocation {
  kind: "project" | "global" | "plugin" | "agent" | "called-only";
  detail?: string;
  active?: boolean | null;
}

export interface McpExpectedRow {
  name: string;
  callName: string;
  locations: McpLocation[];
  active: boolean | null;
  definedAgents: string[];
  inheritAllCount: number | null;
  actualAgents: Array<{ agent: string; count: number }>;
  usedAgentCount: number;
}

export interface McpExpected {
  notListed: string[];
  inheritAllAgents: string[];
  rows: McpExpectedRow[];
  masked: Record<string, { urlQueryValues?: string; headers?: Record<string, string>; env?: Record<string, string> }>;
}

export const mcpExpected: McpExpected = (
  JSON.parse(readFileSync(join(FIXTURES_DIR, "project-usage", "expected.json"), "utf8")) as { mcp: McpExpected }
).mcp;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 목록 카드(`09-5`). */
export function mcpList(page: Page): Locator {
  return page.locator('[data-wf="09-5"]');
}

export function mcpRow(page: Page, name: string): Locator {
  const label = new RegExp(`^${escapeRegExp(name)} (펼치기|접기)$`);
  return mcpList(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: label }) });
}

export async function mcpRowNames(page: Page): Promise<string[]> {
  const labels = await mcpList(page)
    .getByRole("button", { name: /(펼치기|접기)$/ })
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? ""));
  return labels.map((label) => label.replace(/ (펼치기|접기)$/, ""));
}

export function mcpPeriodButton(page: Page, label: "7일" | "30일" | "전체"): Locator {
  return page.getByRole("group", { name: "기간", exact: true }).getByRole("button", { name: label, exact: true });
}

/** 행을 펼친다(이미 펼쳐져 있으면 그대로). */
export async function expandMcpRow(page: Page, name: string): Promise<Locator> {
  const li = mcpRow(page, name);
  await expect(li, `행 ${name}`).toHaveCount(1);
  const toggle = li.getByRole("button", { name: /(펼치기|접기)$/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return li;
}

/** 정의 위치 칩의 화면 문구(FR-023 Output). */
export function locationLabel(location: McpLocation): string {
  switch (location.kind) {
    case "project":
      return "프로젝트";
    case "global":
      return "전역";
    case "plugin":
      return `플러그인 ${location.detail ?? ""}`;
    case "agent":
      return `에이전트 ${location.detail ?? ""}`;
    default:
      return "호출 기록만";
  }
}

/** `실제 사용 (횟수)` 칸의 한 에이전트 `이름 N`을 찾는 정규식(칸 사이 공백 유무에 기대지 않는다). */
export function actualAgentPattern(agent: string, count: number): RegExp {
  return new RegExp(`${escapeRegExp(agent)}\\s*${count}(?!\\d)`);
}

/** 한 행의 `실제 사용` 쪽(FR-024-AC2·E1): 에이전트별 횟수, 기본 세션 포함, 없으면 `기간 안 호출 없음`. */
export async function expectActualUsage(
  li: Locator,
  row: McpExpectedRow,
  options: { extraDefaultSessionCalls?: number[] } = {},
): Promise<void> {
  const context = `행 ${row.name}`;
  if (row.actualAgents.length === 0) {
    await expect(li, `${context} 실제 사용 없음`).toContainText("기간 안 호출 없음");
    return;
  }
  await expect(li, `${context} 기간 안 호출 없음 아님`).not.toContainText("기간 안 호출 없음");
  for (const actual of row.actualAgents) {
    const allowed = actual.agent === "기본 세션" && row.name === "github" ? options.extraDefaultSessionCalls ?? [0] : [0];
    const pattern = new RegExp(allowed.map((extra) => actualAgentPattern(actual.agent, actual.count + extra).source).join("|"));
    await expect(li, `${context} 실제 ${actual.agent}`).toContainText(pattern);
  }
}
