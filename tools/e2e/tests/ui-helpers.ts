// UI 시나리오 spec(E2E-01·02·03·06·07·10)이 함께 쓰는 선택자·fixture 파일·대기 도우미.
// spec 파일이 아니므로 Playwright가 테스트로 수집하지 않는다(testMatch `*.spec.ts`).
//
// 원칙
// - 화면 문구는 각 spec이 `docs/ui-spec.md` 기준으로 직접 단언한다. 여기에는 구조 선택자와
//   fixture 파일 조작, 시간 측정만 둔다.
// - 주소·포트는 literal로 쓰지 않는다. 경로는 상대 경로(playwright `baseURL`)만 쓰고,
//   파일 경로는 항상 `readE2eState().fixtureDir` 아래로만 만든다(architecture.md §8.1 "파일 변경").
// - 목킹 없음: `page.route` 가로채기를 쓰지 않는다(conventions.md §8).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";

/**
 * FR-001-AC3 "2초 이내". ADR-04(1초 폴링) + SSE 전달 + React 렌더를 합친 기한이다.
 * AC 원문은 "2초 이내에 **화면에** 반영된다"이므로 **React 렌더가 이 예산 안에 있다** —
 * 예산을 제품 경로(파일 변경 → `/api/state`·SSE)에만 걸고 렌더 대기를 떼는 측정 분리는
 * AC의 측정 지점을 바꾸는 것이라 하지 않는다(ADR-50 A). 이 값은 늘리지 않는다(conventions.md §8 MUST).
 */
export const FILE_CHANGE_DEADLINE_MS = 2000;

/**
 * FR-001-AC3 측정의 **관측 격자**. 예산에서 빼는 것은 Playwright의 재시도 격자(관측 지연)뿐이며
 * 그것은 제품 경로도, "화면에 반영된 시점"도 아니다(화면은 이미 바뀌었고 테스트가 늦게 본 것이다).
 * 기본 격자(`expect.poll`의 `[100, 250, 500, 1000]` 계열)는 우리 코드에 없는 상수라 통과·실패를
 * 그 값이 가르게 된다 → 25ms로 우리가 고정한다(ADR-50 A). 남는 관측 오차(≤ 25ms + 1회 왕복)는
 * 예산 **안에** 남겨 보수적으로 단언한다.
 */
export const REFLECTION_POLL_INTERVAL_MS = 25;

/**
 * 진단 상한. "10초 안에 아예 반영되지 않음"(기능 결함)과 "반영은 됐으나 2000ms 초과"(기한 초과)를
 * **다른 실패 메시지**로 가르기 위한 상한이며, 예산이 아니다(예산은 `FILE_CHANGE_DEADLINE_MS`).
 */
export const REFLECTION_DIAGNOSTIC_TIMEOUT_MS = 10_000;

/** 준비 단계(측정 대상이 아닌 fixture 반영)에서 쓰는 넉넉한 대기 기한. */
export const SETUP_REFLECT_TIMEOUT_MS = 10_000;

/**
 * `frontend/src/components/pixel/palette.ts`의 고정 팔레트 값(pixel-sprites.md 공통 색).
 * `idle`은 ui-spec.md §공통 토큰 `state/idle`(#55627A)과 같은 값이며, 04-4 "캐릭터 모두 대기색"
 * (FR-007-E1) 단언에 쓴다.
 */
export const PIXEL_FILL = {
  shirtIdle: "#55627A",
  shirtRunning: "#3DD68C",
  screenIdle: "#1B2433",
} as const;

/** `OfficeSprite`·`DeskSprite`의 rect 순서(두 컴포넌트가 같다): 0 모니터 화면 … 4 몸통(셔츠). */
const RECT_INDEX = { screen: 0, shirt: 4 } as const;

// ── fixture 파일 (항상 임시 사본 안) ────────────────────────────────────────────────

export function fixturePath(...segments: string[]): string {
  return join(readE2eState().fixtureDir, ...segments);
}

/** 에이전트 정의 파일 경로(architecture.md §6.1). */
export function agentFile(name: string): string {
  return fixturePath(".claude", "agents", `${name}.md`);
}

/** 워크플로우 구성 파일 경로(architecture.md §6.2). */
export function teamFile(workflowName: string): string {
  return fixturePath(".jaystudio", "teams", `${workflowName}.json`);
}

/** 휴지통 폴더 경로(architecture.md §6.4). */
export function trashDir(): string {
  return fixturePath(".jaystudio", "trash");
}

export function writeFixtureFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

export function readFixtureFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function removeFixturePath(path: string): void {
  rmSync(path, { force: true, recursive: true });
}

export function fixturePathExists(path: string): boolean {
  return existsSync(path);
}

/** 폴더 안 이름 목록(없으면 빈 배열). 휴지통 파일 확인에 쓴다. */
export function listFixtureDir(path: string): string[] {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    return [];
  }
  return readdirSync(path).sort();
}

/** 정의 파일 본문(architecture.md §6.1 Claude Code 형식). 줄 끝은 `\n` 그대로 쓴다. */
export function agentFileContent(options: {
  name: string;
  description: string;
  /** frontmatter에 그대로 들어갈 추가 줄(폼에 없는 필드 보존 확인용, FR-011-AC1). */
  extraFrontmatterLines?: string[];
  body: string;
}): string {
  const extra = options.extraFrontmatterLines ?? [];
  return [
    "---",
    `name: ${options.name}`,
    `description: ${options.description}`,
    ...extra,
    "---",
    "",
    options.body,
    "",
  ].join("\n");
}

/** 구성 파일 내용(architecture.md §6.2 스키마, `schemaVersion: 1`). */
export function teamFileContent(options: {
  name: string;
  description?: string;
  lead?: string | null;
  members?: string[];
}): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      name: options.name,
      description: options.description ?? "",
      lead: options.lead ?? null,
      members: options.members ?? [],
      createdAt: "2026-09-20T10:00:00+09:00",
      updatedAt: "2026-09-20T10:00:00+09:00",
    },
    null,
    2,
  )}\n`;
}

// ── 구조 선택자 (frontend 컴포넌트 구조 기준. testid를 새로 만들 수 없어 구조로 잡는다) ──────

/**
 * 02 층 카드의 헤더 행. `Floor.tsx` 구조: h3(이름) → 부모(이름·인원·요약 묶음) → 조부모(헤더 행)이며
 * 헤더 행에 `가져오기`·`+ 만들기`·`상세 →`·`삭제` 버튼이 있다.
 */
export function floorHeader(page: Page, workflowName: string): Locator {
  return floorName(page, workflowName).locator("xpath=../..");
}

/** 02 층 카드 전체(경고 줄·책상 포함) = 헤더 행의 부모. */
export function floorCard(page: Page, workflowName: string): Locator {
  return floorName(page, workflowName).locator("xpath=../../..");
}

/** 02 층 카드 제목(h3). 층이 있는지 자체를 볼 때 쓴다. */
export function floorName(page: Page, workflowName: string): Locator {
  return page.getByRole("heading", { level: 3, name: workflowName, exact: true });
}

/** 02 책상 / 03 오피스 캐릭터의 SVG(`role="img"`, `aria-label` = name). */
export function spriteSvg(page: Page, agentName: string): Locator {
  return page.getByRole("img", { name: agentName, exact: true });
}

/** 캐릭터 묶음(말풍선·name 칩·상태 글자를 함께 담은 래퍼) = SVG의 부모. */
export function spriteBox(page: Page, agentName: string): Locator {
  return spriteSvg(page, agentName).locator("xpath=..");
}

export function spriteShirtFill(page: Page, agentName: string): Promise<string | null> {
  return spriteSvg(page, agentName).locator("rect").nth(RECT_INDEX.shirt).getAttribute("fill");
}

export function spriteScreenFill(page: Page, agentName: string): Promise<string | null> {
  return spriteSvg(page, agentName).locator("rect").nth(RECT_INDEX.screen).getAttribute("fill");
}

/** 03 선택 패널(`Panel.tsx`)의 값 행: `<dt>라벨</dt><dd>값</dd>`에서 값 쪽. */
export function panelRowValue(page: Page, label: string): Locator {
  return page.locator("dt", { hasText: new RegExp(`^${escapeRegExp(label)}$`) }).locator("xpath=../dd");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── 화면 준비·대기 ────────────────────────────────────────────────────────────────

/** 상대 경로로 열고 04-2 공통 스켈레톤이 끝날 때까지(첫 스냅샷 수신) 기다린다. */
export async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId("app-shell-skeleton")).toHaveCount(0, {
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });
}

/**
 * fixture 파일을 바꾸고 **화면에 반영될 때까지** 걸린 시간을 재서 예산 안인지 단언한다(FR-001-AC3).
 *
 * `reflected`는 "지금 화면이 반영됐는가"만 답하는 술어다(`isVisible()`·`count()`·`allTextContents()`처럼
 * 자체 대기가 없는 조회만 쓴다 — 술어 안에서 다시 폴링하면 격자가 두 겹이 된다). 반영 시점은
 * `REFLECTION_POLL_INTERVAL_MS`(25ms) 격자로 잡고, 진단 상한까지 반영이 없으면 "기능 결함",
 * 반영은 됐으나 예산을 넘겼으면 "기한 초과 + 실측 ms"로 **서로 다른 문구**로 실패한다(ADR-50 A).
 * 고정 대기는 두지 않고, 통과 실행에서도 실측 ms를 annotation에 남겨 추세를 쌓는다.
 */
export async function measureFileChangeReflection(
  testInfo: TestInfo,
  label: string,
  change: () => void,
  reflected: () => Promise<boolean>,
): Promise<number> {
  const startedAt = Date.now();
  change();
  try {
    await expect
      .poll(reflected, {
        intervals: [REFLECTION_POLL_INTERVAL_MS],
        timeout: REFLECTION_DIAGNOSTIC_TIMEOUT_MS,
        message: `${label}: ${REFLECTION_DIAGNOSTIC_TIMEOUT_MS}ms 안에 화면에 반영되지 않았습니다(기능 결함)`,
      })
      .toBe(true);
  } catch (error) {
    const waitedMs = Date.now() - startedAt;
    testInfo.annotations.push({
      type: "FR-001-AC3 반영 시간",
      description: `${label}: 반영 확인 실패 (${waitedMs}ms 관측 · 진단 상한 ${REFLECTION_DIAGNOSTIC_TIMEOUT_MS}ms · 예산 ${FILE_CHANGE_DEADLINE_MS}ms)`,
    });
    process.stdout.write(
      `[FR-001-AC3 반영 시간] ${label}: 미반영 (${waitedMs}ms 관측 · 진단 상한 ${REFLECTION_DIAGNOSTIC_TIMEOUT_MS}ms)\n`,
    );
    if (error instanceof Error) {
      error.message = `${error.message}\n실측 대기 ${waitedMs}ms (예산 ${FILE_CHANGE_DEADLINE_MS}ms)`;
    }
    throw error;
  }
  const elapsedMs = Date.now() - startedAt;
  // 실측 수치를 테스트 주석과 실행 로그에 함께 남긴다(추세 기준선이 되는 산출물이다 — E2E-13 `logMeasurement`와 같은 형식).
  testInfo.annotations.push({
    type: "FR-001-AC3 반영 시간",
    description: `${label}: ${elapsedMs}ms (기한 ${FILE_CHANGE_DEADLINE_MS}ms · 관측 격자 ${REFLECTION_POLL_INTERVAL_MS}ms)`,
  });
  process.stdout.write(
    `[FR-001-AC3 반영 시간] ${label}: ${elapsedMs}ms (기한 ${FILE_CHANGE_DEADLINE_MS}ms · 관측 격자 ${REFLECTION_POLL_INTERVAL_MS}ms)\n`,
  );
  expect(
    elapsedMs,
    `${label} 반영이 ${FILE_CHANGE_DEADLINE_MS}ms를 넘었습니다(실측 ${elapsedMs}ms)`,
  ).toBeLessThanOrEqual(FILE_CHANGE_DEADLINE_MS);
  return elapsedMs;
}

// ── UI를 거치는 공통 조작 (변경 API는 반드시 화면 버튼으로 호출한다) ──────────────────

/** 02 `+ 워크플로우 추가` → 05-L → `만들기`. 층이 나타날 때까지 기다린다(FR-008-AC4). */
export async function addWorkflowViaUi(page: Page, workflowName: string): Promise<void> {
  await page.getByRole("button", { name: "+ 워크플로우 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "워크플로우 추가" });
  await dialog.getByLabel("이름", { exact: true }).fill(workflowName);
  await dialog.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(floorName(page, workflowName)).toBeVisible();
}

/**
 * 02 층 헤더 `+ 만들기` → 06 폼 → `저장`. 성공하면 02로 돌아가 새 책상이 보인다(FR-010-AC5).
 * `tools`는 `전체 상속`을 고른다(FR-010-AC2: 방식을 명시해야 `저장`이 활성).
 */
export async function createAgentViaUi(
  page: Page,
  options: { workflowName: string; name: string; description: string; role: "팀장" | "팀원" },
): Promise<void> {
  await floorHeader(page, options.workflowName).getByRole("button", { name: "+ 만들기", exact: true }).click();
  const form = page.getByTestId("agent-form-dialog");
  await expect(form).toBeVisible();
  await form.getByLabel("이름 (name)", { exact: true }).fill(options.name);
  await form.getByLabel("설명 (description)", { exact: true }).fill(options.description);
  await form.getByRole("radio", { name: options.role, exact: true }).check();
  await form.getByRole("radio", { name: "전체 상속", exact: true }).check();
  await form.getByRole("button", { name: "저장", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(spriteSvg(page, options.name)).toBeVisible();
}

/**
 * 03 선택 패널 `제거` → 06-6 → 이름 입력 → `제거 (이름 일치 시 활성)`.
 * 호출 전에 대상 에이전트가 선택된 03 화면이어야 한다.
 */
export async function removeSelectedAgentViaUi(page: Page, agentName: string): Promise<void> {
  await page.getByRole("button", { name: "제거", exact: true }).click();
  const confirm = page.getByTestId("confirm-by-name-dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByLabel("확인을 위해 이름 입력", { exact: true }).fill(agentName);
  await confirm.getByRole("button", { name: "제거 (이름 일치 시 활성)", exact: true }).click();
  await expect(confirm).toHaveCount(0);
}
