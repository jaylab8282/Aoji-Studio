// E2E-13(화면 대조 캡처)·E2E-16(사이 크기 넘침 판정)이 함께 쓰는 도우미 (ADR-75).
// spec 파일이 아니므로 Playwright가 테스트로 수집하지 않는다(testMatch `*.spec.ts`).
//
// - 영역(`data-wf`) 존재·보임 판정, ui-spec "크기별 배치 차이" 수치 판정(±1px), 캡처 저장을 한 곳에 둔다.
// - 전환은 고정 시간 대기로 기다리지 않는다: 컨텍스트 `reducedMotion: 'reduce'` + `document.getAnimations()` 확인(ADR-75 5).
// - 목킹 없음: 실제 컨테이너 화면만 본다(conventions.md §8).
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, type Page } from "@playwright/test";

import { E2E_DIR } from "../lib/e2e-state";

/** 캡처 저장 폴더(`.gitignore` 대상 산출물). 파일 이름은 `docs/ui/screens/`의 원본 PNG와 같다. */
export const SCREENSHOT_DIR = join(E2E_DIR, "screenshots");

export interface Size {
  width: number;
  height: number;
}

/** 기준 크기 3개(ADR-75 2). 캡처 순서도 이 순서다. */
export const BASE_SIZES: readonly Size[] = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 810 },
  { width: 1080, height: 1920 },
];

/** 사이 크기 3개(ADR-75 4, E2E-16). */
export const BETWEEN_SIZES: readonly Size[] = [
  { width: 1512, height: 982 },
  { width: 1280, height: 800 },
  { width: 900, height: 1600 },
];

export function sizeLabel(size: Size): string {
  return `${size.width}x${size.height}`;
}

/** 세로형(`orientation: portrait`) 판정 — ui-spec "화면 환경·반응형". */
export function isPortrait(size: Size): boolean {
  return size.height > size.width;
}

/** 사이드 탭이 레일(64)인 조건: 세로형이거나 폭 1199 이하. */
export function isRail(size: Size): boolean {
  return isPortrait(size) || size.width <= 1199;
}

/** `narrow:` 조건: 폭 1599 이하. */
export function isNarrow(size: Size): boolean {
  return size.width <= 1599;
}

// ── 안정화 ──────────────────────────────────────────────────────────────────────

/** 글꼴 로딩과 진행 중 전환이 끝났음을 확인한다(고정 대기 없음). */
export async function settle(page: Page): Promise<void> {
  // `document.fonts.status`는 진행 중인 글꼴 요청이 없을 때 `loaded`다. `fonts.ready`를 await하면 서버가 멈춘 04-3 캡처에서
  // 요청이 끝나지 않을 때 테스트 기한까지 매달리므로, 조건 폴링으로 일찍 분명하게 실패하게 한다.
  await page.waitForFunction(() => document.fonts.status === "loaded", undefined, { timeout: 10_000 });
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
}

/**
 * 글꼴 조각(@fontsource는 한글을 unicode-range 조각으로 나눈다)을 미리 받는다. 컨테이너를 얼린 채 캡처하는 04-3처럼
 * 새 글자가 처음 나타나는 화면은 얼리기 전에 이 함수로 그 글자의 조각을 받아 둬야 캡처 글꼴이 같다(ADR-75 5).
 */
export async function preloadFonts(page: Page, text: string): Promise<void> {
  await page.evaluate(async (sample) => {
    await Promise.all([
      ...["400", "600", "700"].map((weight) => document.fonts.load(`${weight} 12px "Gothic A1"`, sample)),
      ...["400", "500"].map((weight) => document.fonts.load(`${weight} 12px "JetBrains Mono"`, sample)),
      ...["400", "600", "700"].map((weight) => document.fonts.load(`${weight} 12px "Sora"`, sample)),
    ]);
  }, text);
}

// ── 영역(data-wf) ───────────────────────────────────────────────────────────────

/** 사이드 탭 영역: 레일이면 `NAV-3R`, 아니면 `NAV-3`(ui-spec SCR-00). */
export function navRegions(size: Size): string[] {
  return ["NAV", "NAV-1", "NAV-2", isRail(size) ? "NAV-3R" : "NAV-3"];
}

/** 모든 영역이 DOM에 있고 보인다(첫 요소 기준). */
export async function expectRegionsVisible(page: Page, regions: readonly string[], context: string): Promise<void> {
  for (const region of regions) {
    await expect(
      page.locator(`[data-wf="${region}"]`).first(),
      `${context}: 영역 data-wf="${region}"이 없거나 보이지 않습니다`,
    ).toBeVisible();
  }
}

// ── 수치(±1px) ──────────────────────────────────────────────────────────────────

export async function boxOf(page: Page, selector: string, context: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${context}: ${selector} 영역의 경계 상자를 읽지 못했습니다`).not.toBeNull();
  return box as NonNullable<typeof box>;
}

export function expectNear(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}: 기대 ${expected}px, 실측 ${Math.round(actual * 100) / 100}px (±1px)`).toBeLessThanOrEqual(
    1,
  );
}

/** 여러 요소의 왼쪽 좌표를 1px 격자로 묶은 서로 다른 값의 수 = 열 수. */
export async function distinctColumns(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluateAll((elements) => {
    const lefts = elements
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => Math.round(rect.left));
    const unique: number[] = [];
    for (const left of lefts) {
      if (!unique.some((known) => Math.abs(known - left) <= 1)) unique.push(left);
    }
    return unique.length;
  });
}

/** 여러 요소의 위쪽 좌표 중 서로 다른 값의 수 = 줄 수. */
export async function distinctRows(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluateAll((elements) => {
    const tops = elements
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => Math.round(rect.top));
    const unique: number[] = [];
    for (const top of tops) {
      if (!unique.some((known) => Math.abs(known - top) <= 1)) unique.push(top);
    }
    return unique.length;
  });
}

/** 사이드 탭 폭 232 / 64(레일). */
export async function expectNavWidth(page: Page, size: Size): Promise<void> {
  const context = `사이드 탭 ${sizeLabel(size)}`;
  const box = await boxOf(page, '[data-wf="NAV"]', context);
  expectNear(box.width, isRail(size) ? 64 : 232, `${context} 폭`);
  // (v1.2.0) 메뉴 6개: 홈·에이전트 워크플로우·스킬·MCP·비용·설정 (가로형·레일 모두 `aria-label`이 같다, ui-spec SCR-00).
  const labels = await page
    .locator('[data-wf="NAV-2"] a')
    .evaluateAll((links) => links.map((link) => link.getAttribute("aria-label")));
  expect(labels, `${context} 메뉴 6개`).toEqual(["홈", "에이전트 워크플로우", "스킬", "MCP", "비용", "설정"]);
}

/** 03 오피스 열 수(ui-spec SCR-03 "크기별 배치 차이"). */
export const OFFICE_COLUMNS: Record<string, number> = {
  "1920x1080": 6,
  "1512x982": 4,
  "1440x810": 4,
  "1280x800": 3,
  "1080x1920": 4,
  "900x1600": 3,
};

/** 03 패널 폭: 가로형 360(폭 1599 이하 320), 세로형은 오피스 아래 전체 폭. */
export async function expectOfficeLayout(page: Page, size: Size): Promise<void> {
  const context = `03 ${sizeLabel(size)}`;
  const expectedColumns = OFFICE_COLUMNS[sizeLabel(size)];
  expect(expectedColumns, `${context}: 열 수 기대값이 정의돼 있지 않습니다`).toBeDefined();
  const cellSelector = '[data-wf="03-4"], [data-wf="03-5"], [data-wf="03-6"]';
  expect(await distinctColumns(page, cellSelector), `${context} 오피스 열 수`).toBe(expectedColumns);
  const cell = await boxOf(page, '[data-wf="03-4"]', context);
  expectNear(cell.height, 180, `${context} 칸 높이`);

  const panel = await boxOf(page, '[data-wf="03-8"]', context);
  const office = await boxOf(page, '[data-wf="03-3"]', context);
  if (isPortrait(size)) {
    expectNear(panel.width, office.width, `${context} 패널 폭(오피스 아래 전체 폭)`);
    expect(panel.y, `${context} 패널이 오피스 아래에 있어야 합니다`).toBeGreaterThanOrEqual(office.y + office.height - 1);
  } else {
    expectNear(panel.width, isNarrow(size) ? 320 : 360, `${context} 패널 폭`);
    expect(panel.x, `${context} 패널이 오피스 오른쪽에 있어야 합니다`).toBeGreaterThanOrEqual(office.x + office.width - 1);
  }
}

/** 02 층 열 수·넓은 층 전체 폭·책상 칸 100·미니맵 크기. `wideFloors` = 인원 7명 이상인 층 이름. */
export async function expectFloorLayout(page: Page, size: Size, wideFloors: readonly string[]): Promise<void> {
  const context = `02 ${sizeLabel(size)}`;
  const grid = await boxOf(page, '[data-testid="floor-grid"]', context);
  const wideSelectors = wideFloors.map((name) => `[data-floor=${JSON.stringify(name)}]`);
  for (const selector of wideSelectors) {
    const wide = await boxOf(page, selector, context);
    expectNear(wide.width, grid.width, `${context} 넓은 층(${selector}) 폭 = 층 그리드 전체 폭`);
  }
  const normalSelector = `section[data-floor]${wideSelectors.map((selector) => `:not(${selector})`).join("")}`;
  expect(await distinctColumns(page, normalSelector), `${context} 층 열 수`).toBe(isPortrait(size) ? 2 : 3);

  const desk = await boxOf(page, '[data-wf="02-7"]', context);
  expectNear(desk.width, 100, `${context} 책상 칸 폭`);

  const minimap = await boxOf(page, '[data-wf="02-10"]', context);
  if (isPortrait(size)) {
    expectNear(minimap.width, 160, `${context} 미니맵 폭(세로형)`);
    expectNear(minimap.height, 200, `${context} 미니맵 높이(세로형)`);
  } else if (isNarrow(size)) {
    expectNear(minimap.width, 168, `${context} 미니맵 폭(가로형 1599 이하)`);
    expectNear(minimap.height, 104, `${context} 미니맵 높이(가로형 1599 이하)`);
  } else {
    expectNear(minimap.width, 200, `${context} 미니맵 폭`);
    expectNear(minimap.height, 124, `${context} 미니맵 높이`);
  }
}

/** 01 KPI 4개 한 줄, 대표 카드 3열(가로형)/1열(세로형). 카드가 `cards`장일 때만 열 수를 본다. */
export async function expectHomeLayout(page: Page, size: Size): Promise<void> {
  const context = `01 ${sizeLabel(size)}`;
  expect(await distinctRows(page, '[data-wf="01-3"] > *'), `${context} KPI 줄 수(한 줄)`).toBe(1);
  expect(await distinctColumns(page, '[data-wf="01-5"] a'), `${context} 대표 카드 열 수`).toBe(isPortrait(size) ? 1 : 3);
}

/**
 * 07 카드 열(v1.2.0). 가로형 2열: 왼쪽 프로젝트 폴더(07-3) → 수집(07-5) → 전역 연결(07-7) / 오른쪽 Claude 열기(07-4) → 상태줄 연동(07-6), 위 정렬.
 * 세로형 1열: 프로젝트 폴더 → 수집 → Claude 열기 → 상태줄 연동 → 전역 연결 순서(CSS `order`, ui-spec SCR-07).
 */
export async function expectSettingsLayout(page: Page, size: Size): Promise<void> {
  const context = `07 ${sizeLabel(size)}`;
  const all = '[data-wf="07-3"], [data-wf="07-4"], [data-wf="07-5"], [data-wf="07-6"], [data-wf="07-7"]';
  expect(await distinctColumns(page, all), `${context} 카드 열 수`).toBe(isPortrait(size) ? 1 : 2);

  const box = async (wf: string) => boxOf(page, `[data-wf="${wf}"]`, context);
  const [folder, open, collect, statusline, global] = [
    await box("07-3"),
    await box("07-4"),
    await box("07-5"),
    await box("07-6"),
    await box("07-7"),
  ];
  if (isPortrait(size)) {
    const order = [folder, collect, open, statusline, global];
    order.slice(1).forEach((card, index) => {
      const previous = order[index] as typeof card;
      expect(card.y, `${context} 세로형 카드 순서(위에서 아래)`).toBeGreaterThanOrEqual(previous.y + previous.height - 1);
    });
  } else {
    expect(await distinctColumns(page, '[data-wf="07-3"], [data-wf="07-5"], [data-wf="07-7"]'), `${context} 왼쪽 열`).toBe(1);
    expect(await distinctColumns(page, '[data-wf="07-4"], [data-wf="07-6"]'), `${context} 오른쪽 열`).toBe(1);
    expect(open.x, `${context} Claude 열기는 왼쪽 열 오른쪽`).toBeGreaterThan(folder.x + folder.width - 1);
    expectNear(open.y, folder.y, `${context} 두 열 위 정렬`);
    expect(collect.y, `${context} 수집은 프로젝트 폴더 아래`).toBeGreaterThanOrEqual(folder.y + folder.height - 1);
    expect(global.y, `${context} 전역 연결은 수집 아래`).toBeGreaterThanOrEqual(collect.y + collect.height - 1);
    expect(statusline.y, `${context} 상태줄 연동은 Claude 열기 아래`).toBeGreaterThanOrEqual(open.y + open.height - 1);
  }
}

// ── (v1.2.0) 08·09·10 데이터 화면 영역·배치 (ui-spec SCR-08·09·10 "크기별 배치 차이") ─────────────────────

export const SKILLS_REGIONS = ["08-1", "08-2", "08-3", "08-5", "08-6", "08-7", "08-8", "08-12", "08-13"];
export const SKILLS_EMPTY_REGIONS = ["08-1", "08-2", "08-3"]; // + 빈 카드 `08-5`
export const MCP_REGIONS = ["09-1", "09-2", "09-3", "09-4", "09-5", "09-6", "09-7", "09-8", "09-9", "09-11", "09-12"];
export const MCP_EMPTY_REGIONS = ["09-1", "09-2", "09-3", "09-4", "09-5"];
export const COST_REGIONS = ["10-1", "10-2", "10-3", "10-4", "10-5", "10-6", "10-7", "10-8", "10-10"];
export const COST_DISCONNECTED_REGIONS = ["10-1", "10-2", "10-3", "10-4", "10-5", "10-6", "10-7", "10-8"];

/** 08 행 열: 가로형(폭 1400 이상) 280·150·200, 폭 1399 이하·세로형 200·130·190. 행이 하나 이상 있어야 한다. */
export async function expectSkillsLayout(page: Page, size: Size): Promise<void> {
  const context = `08 ${sizeLabel(size)}`;
  const narrowCols = isPortrait(size) || size.width <= 1399;
  const [use, agents, acts] = narrowCols ? [200, 130, 190] : [280, 150, 200];
  expectNear((await boxOf(page, '[data-wf="08-6"]', context)).width, use, `${context} 활용도 칸 폭`);
  expectNear((await boxOf(page, '[data-wf="08-7"]', context)).width, agents, `${context} 사용 에이전트 칸 폭`);
  expectNear((await boxOf(page, '[data-wf="08-8"]', context)).width, acts, `${context} 행 동작 칸 폭`);
}

/** 09 위쪽 줄: 가로형 2열(읽은 곳 1fr | 커넥터 안내 380), 세로형 1열(커넥터 안내가 아래 전체 폭). */
export async function expectMcpLayout(page: Page, size: Size): Promise<void> {
  const context = `09 ${sizeLabel(size)}`;
  const sources = await boxOf(page, '[data-wf="09-3"]', context);
  const connector = await boxOf(page, '[data-wf="09-4"]', context);
  if (isPortrait(size)) {
    expect(await distinctColumns(page, '[data-wf="09-3"], [data-wf="09-4"]'), `${context} 위쪽 줄 열 수`).toBe(1);
    expect(connector.y, `${context} 커넥터 안내는 읽은 곳 아래`).toBeGreaterThanOrEqual(sources.y + sources.height - 1);
    expectNear(connector.width, sources.width, `${context} 커넥터 안내 전체 폭`);
  } else {
    expect(await distinctColumns(page, '[data-wf="09-3"], [data-wf="09-4"]'), `${context} 위쪽 줄 열 수`).toBe(2);
    expectNear(connector.width, 380, `${context} 커넥터 안내 폭`);
    expect(connector.x, `${context} 커넥터 안내는 읽은 곳 오른쪽`).toBeGreaterThanOrEqual(sources.x + sources.width - 1);
  }
}

/**
 * 10 본문 그리드: 가로형 2열(1fr | 한도 480, 폭 1599 이하 420), 차트 줄 최소 320(높이 900 이하 248),
 * 세로형 1열(차트 높이 400, 한도 카드는 차트 아래). `chart`는 날짜별 차트가 있는 화면(연결 안 됨 화면은 안내 카드가 그 자리).
 */
export async function expectCostLayout(page: Page, size: Size, chart: boolean): Promise<void> {
  const context = `10 ${sizeLabel(size)}`;
  const limits = await boxOf(page, '[data-wf="10-6"]', context);
  const main = await boxOf(page, '[data-wf="10-7"]', context);
  if (isPortrait(size)) {
    expect(await distinctColumns(page, '[data-wf="10-5"], [data-wf="10-6"], [data-wf="10-7"]'), `${context} 열 수`).toBe(1);
    expect(limits.y, `${context} 구독·한도는 날짜별 아래`).toBeGreaterThanOrEqual(main.y + main.height - 1);
    if (chart) expectNear(main.height, 400, `${context} 차트 높이`);
  } else {
    expectNear(limits.width, isNarrow(size) ? 420 : 480, `${context} 구독·한도 폭`);
    expect(limits.x, `${context} 구독·한도는 날짜별 오른쪽`).toBeGreaterThanOrEqual(main.x + main.width - 1);
    if (chart) {
      const min = size.height <= 900 ? 248 : 320;
      expect(main.height, `${context} 차트 줄 최소 높이 ${min}`).toBeGreaterThanOrEqual(min - 1);
    }
  }
}

/** 팝업 폭(card `data-wf`): sm 480 / md 560 / lg 880(세로형 920) / price 680(10-1, 가로형·세로형 같음). */
export async function expectDialogWidth(
  page: Page,
  size: Size,
  wf: string,
  kind: "sm" | "md" | "lg" | "price",
): Promise<void> {
  const context = `팝업 ${wf} ${sizeLabel(size)}`;
  const expected = kind === "sm" ? 480 : kind === "md" ? 560 : kind === "price" ? 680 : isPortrait(size) ? 920 : 880;
  const box = await boxOf(page, `[data-wf="${wf}"]`, context);
  expectNear(box.width, expected, `${context} 폭`);
}

// ── 캡처 ────────────────────────────────────────────────────────────────────────

/**
 * 같은 상태를 기준 크기 3개로 차례로 캡처한다(`screenshots/<원본 이름>@<W>x<H>.png`, 뷰포트만 — `fullPage` 아님).
 * 크기마다 `check`(영역·배치 판정)를 같은 순간에 돌린다. 판정은 크기를 바꾼 뒤 화면이 자리를 잡을 때까지
 * 자동 재시도한다(고정 대기 없음).
 */
export async function captureBaseSizes(
  page: Page,
  originalName: string,
  check: (size: Size) => Promise<void>,
): Promise<string[]> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const files: string[] = [];
  for (const size of BASE_SIZES) {
    await page.setViewportSize(size);
    await settle(page);
    await expect(async () => {
      await check(size);
    }).toPass({ timeout: 10_000 });
    await settle(page);
    const path = join(SCREENSHOT_DIR, `${originalName}@${sizeLabel(size)}.png`);
    await page.screenshot({ path, caret: "hide", animations: "disabled" });
    files.push(path);
  }
  return files;
}

/**
 * `captureBaseSizes` 뒤에 뷰포트를 첫 기준 크기(1920×1080)로 되돌린다. 캡처 뒤에도 같은 테스트가 화면을 계속 조작하는 spec용
 * (기본은 마지막 크기 1080×1920에 머문다).
 */
export async function captureBaseSizesAndRestore(
  page: Page,
  originalName: string,
  check: (size: Size) => Promise<void>,
): Promise<string[]> {
  const files = await captureBaseSizes(page, originalName, check);
  await page.setViewportSize(BASE_SIZES[0] as Size);
  await settle(page);
  return files;
}

// ── 사이 크기 넘침 판정 (E2E-16, ADR-75 4) ─────────────────────────────────────────────

/**
 * 화면 하나의 가로 스크롤·잘림·겹침 위반을 모아 돌려준다(없으면 빈 배열). 실패 메시지에 쓰도록 위반마다
 * `data-wf` + 태그 + 글자 앞 20자와 수치를 적는다.
 *
 * ① 페이지: `document.scrollingElement.scrollWidth − clientWidth ≤ 1`
 * ② 넘침: 계산된 `overflow-x`가 auto·scroll·hidden인 요소 중 `scrollWidth − clientWidth ≤ 1`(의도한 말줄임은
 *    `data-clamp` 속성을 단 요소만 제외)
 * ③ 잘림: 각 `data-wf` 영역 안 버튼·링크·입력·상태 칩의 가로 경계가 그 영역 경계 안(±1px)이고 뷰포트 가로 범위 안
 * ④ 겹침: 같은 `data-wf` 영역 안 버튼·링크·입력끼리 교차 면적 ≤ 1px², 서로 다른 최상위 영역끼리 교차 면적 ≤ 1px²
 *    (조상·자손 관계인 쌍은 제외)
 */
export async function collectLayoutViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const violations: string[] = [];
    const round = (value: number) => Math.round(value * 10) / 10;

    const describe = (element: Element): string => {
      const region = element.closest("[data-wf]")?.getAttribute("data-wf") ?? "-";
      const raw = element.getAttribute("aria-label") ?? element.textContent ?? "";
      const text = raw.trim().replace(/\s+/g, " ").slice(0, 20);
      return `${region} <${element.tagName.toLowerCase()}> "${text}"`;
    };
    const isVisible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) return false;
      const style = getComputedStyle(element);
      return style.visibility !== "hidden" && style.display !== "none";
    };
    const intersectionArea = (a: DOMRect, b: DOMRect): number => {
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return width > 0 && height > 0 ? width * height : 0;
    };

    // ① 페이지 가로 스크롤
    const root = document.scrollingElement ?? document.documentElement;
    if (root.scrollWidth - root.clientWidth > 1) {
      violations.push(`① 페이지 가로 스크롤: scrollWidth ${root.scrollWidth} − clientWidth ${root.clientWidth}`);
    }

    // ② 가로로 넘치는 overflow 요소
    for (const element of [document.documentElement, document.body, ...Array.from(document.body.querySelectorAll("*"))]) {
      const overflowX = getComputedStyle(element).overflowX;
      if (overflowX !== "auto" && overflowX !== "scroll" && overflowX !== "hidden") continue;
      if (element.hasAttribute("data-clamp") || !isVisible(element)) continue;
      const overflow = element.scrollWidth - element.clientWidth;
      if (overflow > 1) {
        violations.push(`② 넘침 ${describe(element)}: scrollWidth ${element.scrollWidth} − clientWidth ${element.clientWidth} = ${overflow}`);
      }
    }

    // ③ 잘림 · ④ 같은 영역 안 겹침
    const interactive = "button, a[href], input, select, textarea";
    const marked = "button, a[href], input, select, textarea, .h-chip";
    const regions = Array.from(document.querySelectorAll("[data-wf]")).filter(isVisible);
    for (const region of regions) {
      const box = region.getBoundingClientRect();
      for (const element of Array.from(region.querySelectorAll(marked)).filter(isVisible)) {
        const rect = element.getBoundingClientRect();
        if (rect.left < box.left - 1 || rect.right > box.right + 1) {
          violations.push(
            `③ 잘림 ${describe(element)}: 요소 ${round(rect.left)}~${round(rect.right)} 영역 ${round(box.left)}~${round(box.right)}`,
          );
        }
        if (rect.left < -1 || rect.right > window.innerWidth + 1) {
          violations.push(`③ 뷰포트 밖 ${describe(element)}: 요소 ${round(rect.left)}~${round(rect.right)} 뷰포트 0~${window.innerWidth}`);
        }
      }
    }
    const groups = new Map<Element, Element[]>();
    for (const element of Array.from(document.querySelectorAll(interactive)).filter(isVisible)) {
      const owner = element.closest("[data-wf]");
      if (owner === null) continue;
      groups.set(owner, [...(groups.get(owner) ?? []), element]);
    }
    for (const members of groups.values()) {
      for (let i = 0; i < members.length; i += 1) {
        for (let j = i + 1; j < members.length; j += 1) {
          const a = members[i] as Element;
          const b = members[j] as Element;
          if (a.contains(b) || b.contains(a)) continue;
          const area = intersectionArea(a.getBoundingClientRect(), b.getBoundingClientRect());
          if (area > 1) violations.push(`④ 겹침 ${describe(a)} × ${describe(b)}: 교차 면적 ${round(area)}px²`);
        }
      }
    }

    // ④ 서로 다른 최상위 영역끼리 겹침
    const topLevel = regions.filter((region) => region.parentElement?.closest("[data-wf]") === null);
    for (let i = 0; i < topLevel.length; i += 1) {
      for (let j = i + 1; j < topLevel.length; j += 1) {
        const a = topLevel[i] as Element;
        const b = topLevel[j] as Element;
        const area = intersectionArea(a.getBoundingClientRect(), b.getBoundingClientRect());
        if (area > 1) {
          violations.push(
            `④ 영역 겹침 data-wf=${a.getAttribute("data-wf")} × data-wf=${b.getAttribute("data-wf")}: 교차 면적 ${round(area)}px²`,
          );
        }
      }
    }
    return violations;
  });
}
