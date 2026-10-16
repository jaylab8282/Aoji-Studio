// E2E-19 중 08 스킬 사용 집계 부분(T-R4-15, 배치 13): `usage.jsonl` 재생 → 08 횟수·%·`사용 에이전트 N명`·펼침 내용 = `expected.json`.
// fixture: `project-usage` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-basic`(architecture §8.2 배치 13).
// 검증 ID: FR-018-AC2·AC3·AC6, FR-019-AC1~AC3·AC5·AC7.
//
// **이 spec이 `usage.jsonl`을 재생한다**(E2E-19의 데이터 준비). 뒤따르는 e2e-19b·e2e-20 등은 다시 재생하지 않고 이미 쌓인 데이터를 쓴다.
// 이벤트 0건인 새 컨테이너에서 시작해야 한다(첫 테스트의 `기록 없음`). 파일 이름순으로 배치 13의 맨 앞에서 돈다.
// 테스트는 파일 순서대로 이어지는 시나리오다(serial). 목킹 없음(conventions §8).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { FIXTURES_DIR } from "../lib/e2e-state";
import { replayScenarioLines, SCENARIOS_DIR } from "../lib/replay";
import { gotoReady, measureFileChangeReflection } from "./ui-helpers";

test.describe.configure({ mode: "serial" });

const USAGE_SCENARIO = join(SCENARIOS_DIR, "usage.jsonl");
/** 재생 38줄 중 마지막에 따로 보내 2초 반영을 재는 줄: 기본 세션의 `Skill` 호출 `release-notes`(README 16번 줄). */
const LIVE_LINE = 16;
const TOTAL_LINES = 38;

interface ExpectedRow {
  name: string;
  call: number;
  slash: number;
  preload: number;
  total: number;
  definedAgents: string[];
  actualAgents: Array<{ agent: string; count: number }>;
  definedUnused: string[];
  usedAgentCount: number;
  percent: number;
  percentDisplay: string;
}

interface Expected {
  skills: { totalUses: number; ignoredNames: string[]; rows: ExpectedRow[] };
}

const expected: Expected = JSON.parse(
  readFileSync(join(FIXTURES_DIR, "project-usage", "expected.json"), "utf8"),
) as Expected;

// ── 화면 도우미 (ui-spec SCR-08) ─────────────────────────────────────────────────

function skillList(page: Page): Locator {
  return page.locator('[data-wf="08-5"]');
}

function skillRow(page: Page, name: string): Locator {
  const label = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (펼치기|접기)$`);
  return skillList(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: label }) });
}

function periodButton(page: Page, label: "7일" | "30일" | "전체"): Locator {
  return page.getByRole("group", { name: "기간", exact: true }).getByRole("button", { name: label, exact: true });
}

async function rowNames(page: Page): Promise<string[]> {
  const labels = await skillList(page)
    .getByRole("button", { name: /(펼치기|접기)$/ })
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? ""));
  return labels.map((label) => label.replace(/ (펼치기|접기)$/, ""));
}

async function selectAllPeriod(page: Page): Promise<void> {
  await periodButton(page, "전체").click();
  await expect(periodButton(page, "전체")).toHaveAttribute("aria-pressed", "true");
}

/** 펼친 내용(`08-13`)에서 `호출 N · 직접 호출 N · 미리 넣음 N = N회`를 찾는 정규식(칸 사이 공백 유무에 기대지 않는다). */
function countsPattern(row: ExpectedRow): RegExp {
  return new RegExp(
    `(?<!직접 )호출\\s*${row.call}\\s*·\\s*직접 호출\\s*${row.slash}\\s*·\\s*미리 넣음\\s*${row.preload}\\s*=\\s*${row.total}\\s*회`,
  );
}

/** 한 행을 `expected.json` 값과 대조한다(펼치지 않은 줄 요약 + 펼친 내용). */
async function expectRow(page: Page, row: ExpectedRow): Promise<void> {
  const li = skillRow(page, row.name);
  const context = `행 ${row.name}`;
  await expect(li, context).toHaveCount(1);

  // FR-019-AC2: % 소수 첫째 자리 + 막대(`role=img`, aria-label `활용도 N.N%`)
  await expect(li.getByRole("img", { name: `활용도 ${row.percentDisplay}%`, exact: true }), `${context} 활용도`).toBeVisible();

  // FR-018-AC6: `사용 에이전트 N명`(N = 정의상 ∪ 실제의 합집합, 기본 세션 제외)
  await expect(
    li.getByRole("button", { name: `사용 에이전트 ${row.usedAgentCount}명`, exact: true }),
    `${context} 사용 에이전트`,
  ).toBeVisible();

  // 펼친 내용
  const toggle = li.getByRole("button", { name: /(펼치기|접기)$/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  const detail = li.locator('[data-wf="08-13"]');
  await expect(detail, `${context} 펼침`).toBeVisible();

  // FR-019-AC1·AC3: 방법별 횟수와 합
  await expect(detail, `${context} 사용 횟수`).toContainText(countsPattern(row));

  // FR-018-AC2: 정의상 사용 에이전트(name 오름차순)
  for (const agent of row.definedAgents) {
    await expect(detail, `${context} 정의상 ${agent}`).toContainText(agent);
  }
  // FR-018-AC3: 실제 사용(이름 + 횟수, 기본 세션 포함)과 `정의됨 · 사용 0`
  for (const actual of row.actualAgents) {
    await expect(detail, `${context} 실제 ${actual.agent}`).toContainText(
      new RegExp(`${actual.agent}\\s*${actual.count}(?!\\d)`),
    );
  }
  if (row.actualAgents.length === 0) {
    await expect(detail, `${context} 실제 사용 없음`).not.toContainText("기본 세션");
  }
  for (const agent of row.definedUnused) {
    await expect(detail.getByText("정의됨 · 사용 0", { exact: false }), `${context} 정의됨 · 사용 0`).toBeVisible();
    await expect(detail, `${context} 정의됨 · 사용 0 대상`).toContainText(agent);
  }
  if (row.definedUnused.length === 0) {
    await expect(detail.getByText("정의됨 · 사용 0", { exact: false }), `${context} 정의됨 · 사용 0 없음`).toHaveCount(0);
  }
}

// ── 시나리오 ────────────────────────────────────────────────────────────────────

test("[FR-019-AC7][E2E-19] 재생 전(기록 없음): 모든 행의 활용도가 `기록 없음`이고 막대가 없으며 사용 합계는 0회다", async ({
  page,
}) => {
  await gotoReady(page, "/skills");
  await expect(skillList(page)).toBeVisible();
  await selectAllPeriod(page);

  const names = expected.skills.rows.map((row) => row.name);
  await expect.poll(() => rowNames(page)).toEqual(names);
  await expect(skillList(page).getByText("기록 없음", { exact: true })).toHaveCount(names.length);
  await expect(skillList(page).getByRole("img", { name: /^활용도 / })).toHaveCount(0);
  await expect(page.locator('[data-wf="08-3"]')).toContainText(/사용 합계\s*0\s*회/);
});

test("[FR-018-AC2][FR-018-AC3][FR-018-AC6][FR-019-AC1][FR-019-AC2][FR-019-AC3][FR-019-AC5][E2E-19] `usage.jsonl` 재생 → 08 전체 행이 `expected.json`과 같다(행 순서·%·막대·사용 에이전트 N명·방법별 횟수·정의상/실제 사용·`정의됨 · 사용 0`), 새 이벤트 1건은 2초 안에 반영된다", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await gotoReady(page, "/skills");
  await expect(skillList(page)).toBeVisible();
  await selectAllPeriod(page);

  // 데이터 준비: 마지막에 따로 보낼 한 줄(기본 세션의 `Skill` 호출 release-notes)만 빼고 재생한다.
  replayScenarioLines({ from: 1, to: LIVE_LINE - 1, scenarioPath: USAGE_SCENARIO });
  replayScenarioLines({ from: LIVE_LINE + 1, to: TOTAL_LINES, scenarioPath: USAGE_SCENARIO });

  const releaseNotes = expected.skills.rows.find((row) => row.name === "release-notes") as ExpectedRow;
  const before: ExpectedRow = { ...releaseNotes, call: releaseNotes.call - 1, total: releaseNotes.total - 1 };

  // FR-019-AC5: 재생된 이벤트가 새로고침 없이 화면에 잡힌다. 사용 합계는 마지막 한 줄 전까지 expected - 1.
  await expect(page.locator('[data-wf="08-3"]')).toContainText(
    new RegExp(`사용 합계\\s*${expected.skills.totalUses - 1}\\s*회`),
    { timeout: 10_000 },
  );
  const beforeDetail = await (async () => {
    const li = skillRow(page, "release-notes");
    await li.getByRole("button", { name: /(펼치기|접기)$/ }).click();
    return li.locator('[data-wf="08-13"]');
  })();
  await expect(beforeDetail).toContainText(countsPattern(before));

  // 마지막 한 줄을 보내 2초 안에 호출 횟수·합이 expected 값이 되는지 잰다.
  await measureFileChangeReflection(
    testInfo,
    "usage 이벤트 1건 → 08 호출 횟수",
    () => {
      replayScenarioLines({ from: LIVE_LINE, to: LIVE_LINE, scenarioPath: USAGE_SCENARIO });
    },
    async () => {
      const text = (await beforeDetail.allTextContents()).join(" ");
      return countsPattern(releaseNotes).test(text);
    },
  );

  // 행 순서: 정의상 name 오름차순(FR-018-AC2) — 형식 오류 포함 8행
  await expect.poll(() => rowNames(page)).toEqual(expected.skills.rows.map((row) => row.name));
  await expect(page.locator('[data-wf="08-3"]')).toContainText(
    new RegExp(`사용 합계\\s*${expected.skills.totalUses}\\s*회`),
  );

  // 없는 스킬(ghost-skill 등)은 행으로도 분모로도 나타나지 않는다(FR-019-AC6 — 이 spec의 부수 확인)
  for (const ignored of expected.skills.ignoredNames) {
    await expect(skillRow(page, ignored), `무시할 이름 ${ignored}`).toHaveCount(0);
  }

  for (const row of expected.skills.rows) {
    await expectRow(page, row);
  }
});

test("[FR-019-AC5][FR-018-AC7][E2E-19] 기간을 바꿔도 목록 순서·펼침이 유지되고 재생한 이벤트는 7일·30일·전체 모두에 잡힌다", async ({
  page,
}) => {
  await gotoReady(page, "/skills");
  await expect(skillList(page)).toBeVisible();

  const names = expected.skills.rows.map((row) => row.name);
  const expandedRow = skillRow(page, "design-review");
  await expandedRow.getByRole("button", { name: /(펼치기|접기)$/ }).click();
  await expect(expandedRow.locator('[data-wf="08-13"]')).toBeVisible();

  for (const label of ["7일", "30일", "전체"] as const) {
    await periodButton(page, label).click();
    await expect(periodButton(page, label)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => rowNames(page)).toEqual(names);
    // 이벤트는 방금 쌓였으므로 어느 기간에서도 합이 같다
    await expect(page.locator('[data-wf="08-3"]')).toContainText(
      new RegExp(`사용 합계\\s*${expected.skills.totalUses}\\s*회`),
    );
    await expect(expandedRow.locator('[data-wf="08-13"]')).toBeVisible();
  }
});
