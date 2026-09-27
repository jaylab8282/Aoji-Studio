// E2E-12 02 줌·미니맵·검색·드롭다운·30개 워크플로우 상단 바 (architecture.md §8.2 E2E-12 행).
// fixture: `project-large` (에이전트 100·워크플로우 30. floor-01만 인원 7 → span 3, 나머지는 span 1).
// 검증 ID: FR-006-AC6·AC7·AC8 (+ 이연 Minor T-015 m2 "미니맵 줌 반응").
//
// 기준: ui-spec.md SCR-02 "줌 버튼"·"미니맵"·"검색 입력"·"층 선택 드롭다운" 행과 ADR-23
// (줌·미니맵의 기준 컨테이너는 window가 아니라 **층 스크롤 영역**이다).
//
// 목킹 없음: 실제 컨테이너(공개 포트는 `.e2e-state.json`의 baseUrl)가 제공하는 빌드 결과를 실제
// 브라우저로 쓴다. `page.route` 가로채기 없음(conventions.md §8). 주소·포트 literal 없음.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { delay } from "../lib/harness-utils";
import { gotoReady } from "./ui-helpers";

/** project-large fixture 실물(`tools/fixtures/project-large`). 값이 바뀌면 이 spec의 단언 근거가 깨진다. */
const WORKFLOW_COUNT = 30;
const AGENT_COUNT = 100;

/** `WorkflowsScreen.tsx`의 줌 상수(ui-spec.md SCR-02 줌 버튼 행, FR-006-AC6). */
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;
const ZOOM_DEFAULT = 100;

/** 소수점 계산·브라우저 반올림을 허용하는 폭(%). 미니맵 비율 단언에 쓴다. */
const PERCENT_TOLERANCE = 1.5;

function floorName(index: number): string {
  return `floor-${String(index).padStart(2, "0")}`;
}

function zoomInButton(page: Page): Locator {
  return page.getByRole("button", { name: /^확대 \(현재 \d+%\)$/ });
}

function zoomOutButton(page: Page): Locator {
  return page.getByRole("button", { name: /^축소 \(현재 \d+%\)$/ });
}

function zoomFitButton(page: Page): Locator {
  return page.getByRole("button", { name: "화면에 맞춤" });
}

/** 줌 버튼 `aria-label`에 실린 현재 배율(ui-spec.md SCR-02 "각 버튼 aria-label"). */
async function currentZoomPercent(page: Page): Promise<number> {
  const label = await zoomInButton(page).getAttribute("aria-label");
  const matched = /(\d+)%/.exec(label ?? "");
  expect(matched, `확대 버튼 aria-label에서 배율을 읽을 수 없습니다: ${label}`).not.toBeNull();
  return Number((matched as RegExpExecArray)[1]);
}

/** 층 스크롤 영역(ADR-23의 기준 컨테이너). */
function scrollArea(page: Page): Locator {
  return page.getByTestId("floor-scroll-area");
}

/** `transform: scale(...)`이 걸린 층 영역 래퍼(로비 + 층 그리드). */
function zoomedContent(page: Page): Locator {
  return scrollArea(page).locator("div[style*='transform']");
}

/** 실제로 적용된 배율. `getComputedStyle().transform`의 matrix에서 x 배율을 읽는다. */
async function appliedScale(page: Page): Promise<number> {
  return zoomedContent(page).evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    if (transform === "none") return 1;
    const values = transform.replace(/^matrix\(|\)$/g, "").split(",");
    return Number(values[0]);
  });
}

function minimap(page: Page): Locator {
  return page.getByRole("img", { name: "미니맵" });
}

/** 미니맵 안의 현재 뷰포트 테두리(`Minimap.tsx`의 `absolute inset-x-1` 사각형). */
function minimapViewport(page: Page): Locator {
  return minimap(page).locator("> div").nth(1);
}

async function minimapViewportPercent(page: Page): Promise<{ top: number; height: number }> {
  const style = await minimapViewport(page).getAttribute("style");
  const top = /top:\s*([\d.]+)%/.exec(style ?? "");
  const height = /height:\s*([\d.]+)%/.exec(style ?? "");
  expect(top, `미니맵 뷰포트 style에서 top을 읽을 수 없습니다: ${style}`).not.toBeNull();
  expect(height, `미니맵 뷰포트 style에서 height를 읽을 수 없습니다: ${style}`).not.toBeNull();
  return {
    top: Number((top as RegExpExecArray)[1]),
    height: Number((height as RegExpExecArray)[1]),
  };
}

/**
 * 미니맵 뷰포트 높이가 목표 비율에 들어올 때까지 조건부로만 기다리고 마지막 값을 돌려준다.
 * 목표에 닿으면 즉시 반환하므로 고정 대기가 아니다(맞지 않으면 기한까지 폴링하고 실측치를 돌려준다).
 */
async function pollMinimapHeight(page: Page, targetPercent: number, timeoutMs = 3000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let latest = (await minimapViewportPercent(page)).height;
  while (Date.now() < deadline && Math.abs(latest - targetPercent) > PERCENT_TOLERANCE) {
    await delay(100);
    latest = (await minimapViewportPercent(page)).height;
  }
  return latest;
}

/** 층 스크롤 영역의 실제 스크롤 수치(ui-spec.md SCR-02 미니맵 행이 지정한 계산 입력). */
async function scrollMetrics(
  page: Page,
): Promise<{ scrollTop: number; clientHeight: number; scrollHeight: number }> {
  return scrollArea(page).evaluate((element) => ({
    scrollTop: element.scrollTop,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
}

/** 02 층 카드 제목(h3) 목록 = 지금 보이는 층. */
async function visibleFloorNames(page: Page): Promise<string[]> {
  return page
    .getByRole("heading", { level: 3 })
    .evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));
}

/** 02 책상 SVG의 `aria-label`(= 에이전트 name) 목록. */
async function visibleDeskNames(page: Page): Promise<string[]> {
  return page
    .locator("svg[role='img']")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label") ?? ""));
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await gotoReady(page, "/workflows");
  // 30개 층이 모두 렌더된 뒤에 측정한다(요약 줄이 fixture 실물 수치와 같은지로 확인한다).
  await expect(
    page.getByText(`에이전트 ${AGENT_COUNT} · 스킬 0 · 워크플로우 ${WORKFLOW_COUNT}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: floorName(WORKFLOW_COUNT), exact: true })).toBeVisible();
});

test(`[FR-006-AC6][E2E-12] 줌 +/− → 10%p 단위로 층 영역 transform scale이 바뀌고 ${ZOOM_MIN}~${ZOOM_MAX}%에서 멈춘다`, async ({
  page,
}) => {
  expect(await currentZoomPercent(page)).toBe(ZOOM_DEFAULT);
  expect(await appliedScale(page)).toBeCloseTo(ZOOM_DEFAULT / 100, 2);

  // `+` 한 번 = 10%p.
  await zoomInButton(page).click();
  expect(await currentZoomPercent(page)).toBe(ZOOM_DEFAULT + ZOOM_STEP);
  expect(await appliedScale(page)).toBeCloseTo((ZOOM_DEFAULT + ZOOM_STEP) / 100, 2);

  // 상한 200%까지 올린 뒤 더 눌러도 200%에서 멈춘다.
  const stepsToMax = (ZOOM_MAX - (ZOOM_DEFAULT + ZOOM_STEP)) / ZOOM_STEP;
  for (let index = 0; index < stepsToMax; index += 1) {
    await zoomInButton(page).click();
  }
  expect(await currentZoomPercent(page)).toBe(ZOOM_MAX);
  await zoomInButton(page).click();
  expect(await currentZoomPercent(page)).toBe(ZOOM_MAX);
  expect(await appliedScale(page)).toBeCloseTo(ZOOM_MAX / 100, 2);

  // 하한 50%까지 내린 뒤 더 눌러도 50%에서 멈춘다.
  const stepsToMin = (ZOOM_MAX - ZOOM_MIN) / ZOOM_STEP;
  for (let index = 0; index < stepsToMin; index += 1) {
    await zoomOutButton(page).click();
  }
  expect(await currentZoomPercent(page)).toBe(ZOOM_MIN);
  await zoomOutButton(page).click();
  expect(await currentZoomPercent(page)).toBe(ZOOM_MIN);
  expect(await appliedScale(page)).toBeCloseTo(ZOOM_MIN / 100, 2);
});

test("[FR-006-AC6][E2E-12] `맞춤` — 층 30개는 하한 50%까지만 줄고, 층 하나만 남기면 층 영역이 층 스크롤 영역 안에 들어간다", async ({
  page,
}) => {
  // 30개 층 전체는 50%로도 층 스크롤 영역에 들어가지 않으므로 `맞춤`은 하한에서 멈춘다(FR-006-AC6 범위).
  await zoomInButton(page).click();
  expect(await currentZoomPercent(page)).toBe(ZOOM_DEFAULT + ZOOM_STEP);
  await zoomFitButton(page).click();
  expect(await currentZoomPercent(page)).toBe(ZOOM_MIN);

  // 층 하나만 남기면 `맞춤` 결과가 실제로 "층 스크롤 영역 안에 들어가는" 배율이다.
  await page.getByLabel("층 선택").selectOption(floorName(30));
  await expect(page.getByRole("heading", { level: 3, name: floorName(30), exact: true })).toBeVisible();
  await zoomFitButton(page).click();

  const zoom = await currentZoomPercent(page);
  expect(zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
  expect(zoom).toBeLessThanOrEqual(ZOOM_MAX);

  const fits = await scrollArea(page).evaluate((area) => {
    const content = area.querySelector<HTMLElement>("div[style*='transform']");
    if (content === null) return null;
    const rect = content.getBoundingClientRect();
    return {
      contentWidth: rect.width,
      contentHeight: rect.height,
      clientWidth: area.clientWidth,
      clientHeight: area.clientHeight,
    };
  });
  expect(fits).not.toBeNull();
  const box = fits as { contentWidth: number; contentHeight: number; clientWidth: number; clientHeight: number };
  expect(box.contentWidth).toBeLessThanOrEqual(box.clientWidth + 1);
  expect(box.contentHeight).toBeLessThanOrEqual(box.clientHeight + 1);
});

test(`[FR-006-AC7][E2E-12] 층 선택 드롭다운 = \`전체 층 (${WORKFLOW_COUNT}개)\` + 워크플로우 ${WORKFLOW_COUNT}개, 고르면 그 층만 보인다`, async ({
  page,
}) => {
  const select = page.getByLabel("층 선택");
  const optionTexts = await select
    .locator("option")
    .evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));

  expect(optionTexts[0]).toBe(`전체 층 (${WORKFLOW_COUNT}개)`);
  expect(optionTexts.slice(1)).toEqual(
    Array.from({ length: WORKFLOW_COUNT }, (_unused, index) => floorName(index + 1)),
  );

  expect(await visibleFloorNames(page)).toHaveLength(WORKFLOW_COUNT);

  await select.selectOption(floorName(7));
  await expect(page.getByRole("heading", { level: 3, name: floorName(7), exact: true })).toBeVisible();
  expect(await visibleFloorNames(page)).toEqual([floorName(7)]);

  // 다시 `전체 층`을 고르면 30개가 모두 돌아온다.
  await select.selectOption("");
  await expect(page.getByRole("heading", { level: 3, name: floorName(1), exact: true })).toBeVisible();
  expect(await visibleFloorNames(page)).toHaveLength(WORKFLOW_COUNT);
});

test(`[FR-006-AC7][E2E-12] 워크플로우 ${WORKFLOW_COUNT}개여도 검색·드롭다운·추가 버튼이 한 줄에 남고 가로 스크롤이 생기지 않는다`, async ({
  page,
}) => {
  const searchBox = await page.getByLabel("워크플로우·에이전트 이름 검색").boundingBox();
  const selectBox = await page.getByLabel("층 선택").boundingBox();
  const addBox = await page.getByRole("button", { name: "+ 워크플로우 추가", exact: true }).boundingBox();
  expect(searchBox).not.toBeNull();
  expect(selectBox).not.toBeNull();
  expect(addBox).not.toBeNull();

  const boxes = [searchBox, selectBox, addBox] as { x: number; y: number; width: number; height: number }[];
  // 줄바꿈이 생기면 뒤 요소가 아래 줄로 내려가 y가 달라진다. 세로 중심이 같은지로 한 줄을 확인한다.
  const centers = boxes.map((box) => box.y + box.height / 2);
  for (const center of centers) {
    expect(Math.abs(center - (centers[0] as number))).toBeLessThanOrEqual(1);
  }
  // 오른쪽 정렬 묶음이므로 검색 → 드롭다운 → 버튼 순서로 x가 커진다.
  expect((boxes[0] as { x: number }).x).toBeLessThan((boxes[1] as { x: number }).x);
  expect((boxes[1] as { x: number }).x).toBeLessThan((boxes[2] as { x: number }).x);

  // window 가로 스크롤이 없다(ui-spec.md SCR-02 레이아웃 항).
  const horizontal = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(horizontal.scrollWidth).toBeLessThanOrEqual(horizontal.clientWidth);
});

test("[FR-006-AC8][E2E-12] 검색 — 워크플로우 이름 부분 일치는 층 전체, 에이전트 name 부분 일치(대소문자 무시)는 일치한 에이전트만", async ({
  page,
}) => {
  const search = page.getByLabel("워크플로우·에이전트 이름 검색");

  // 워크플로우 이름 부분 일치: `floor-2`는 floor-20~floor-29 열 개 층에 걸린다
  // (`floor-02`는 이름에 `floor-2`라는 연속 문자열이 없어 걸리지 않는다 — 부분 일치 규칙 그대로다).
  await search.fill("floor-2");
  await expect(page.getByRole("heading", { level: 3, name: floorName(20), exact: true })).toBeVisible();
  expect(await visibleFloorNames(page)).toEqual(
    Array.from({ length: 10 }, (_unused, index) => floorName(20 + index)),
  );
  // 이름이 일치한 층은 소속 인원 전체가 남는다(floor-20~29는 각 3명).
  expect(await visibleDeskNames(page)).toHaveLength(30);

  // 에이전트 name 부분 일치 + 대소문자 무시: `AGENT-009`는 floor-02 소속 agent-009 하나뿐이다.
  await search.fill("AGENT-009");
  await expect(page.getByRole("heading", { level: 3, name: floorName(2), exact: true })).toBeVisible();
  expect(await visibleFloorNames(page)).toEqual([floorName(2)]);
  expect(await visibleDeskNames(page)).toEqual(["agent-009"]);

  // 일치 없음 → 층 그리드 자리에 확정 문구 한 줄.
  await search.fill("zzz-없는-이름");
  await expect(page.getByText("검색 결과가 없습니다", { exact: true })).toBeVisible();
  expect(await visibleFloorNames(page)).toEqual([]);

  // 비우면 전체 복귀.
  await search.fill("");
  await expect(page.getByRole("heading", { level: 3, name: floorName(1), exact: true })).toBeVisible();
  expect(await visibleFloorNames(page)).toHaveLength(WORKFLOW_COUNT);
});

test("[FR-006-AC6][E2E-12] 미니맵 뷰포트 사각형이 층 스크롤 영역의 scrollTop·clientHeight/scrollHeight를 그대로 따른다", async ({
  page,
}) => {
  await expect(minimap(page)).toBeVisible();

  // ① 초기 상태: 높이 = clientHeight / scrollHeight (ui-spec.md SCR-02 미니맵 행).
  const initialMetrics = await scrollMetrics(page);
  const initialViewport = await minimapViewportPercent(page);
  expect(initialMetrics.scrollHeight).toBeGreaterThan(initialMetrics.clientHeight);
  expect(initialViewport.top).toBeCloseTo(0, 1);
  expect(
    Math.abs(initialViewport.height - (initialMetrics.clientHeight / initialMetrics.scrollHeight) * 100),
  ).toBeLessThanOrEqual(PERCENT_TOLERANCE);

  // ② 스크롤 반응: 절반쯤 내리면 테두리 위치 = scrollTop / scrollHeight.
  const targetScrollTop = Math.round(
    (initialMetrics.scrollHeight - initialMetrics.clientHeight) / 2,
  );
  await scrollArea(page).evaluate((element, top) => {
    element.scrollTop = top;
  }, targetScrollTop);
  await expect
    .poll(async () => (await minimapViewportPercent(page)).top, { timeout: 5000 })
    .toBeGreaterThan(initialViewport.top + 1);
  const scrolledMetrics = await scrollMetrics(page);
  const scrolledViewport = await minimapViewportPercent(page);
  expect(
    Math.abs(scrolledViewport.top - (scrolledMetrics.scrollTop / scrolledMetrics.scrollHeight) * 100),
  ).toBeLessThanOrEqual(PERCENT_TOLERANCE);
});

test("[FR-006-AC6][E2E-12][T-015 m2] 줌을 바꾸면 미니맵 뷰포트 사각형도 새 배율의 clientHeight/scrollHeight로 바뀐다", async ({
  page,
}, testInfo) => {
  await expect(minimap(page)).toBeVisible();

  // 기준: ui-spec.md SCR-02 미니맵 행 "테두리 위치 = scrollTop / scrollHeight, 높이 = clientHeight /
  // scrollHeight(둘 다 zoom 배율이 적용된 값으로 통일, 최소 4%)". 배율을 올리면 scrollHeight가 커지므로
  // 테두리 높이도 같은 식으로 다시 계산돼야 한다(이연 Minor T-015 m2).
  const initialMetrics = await scrollMetrics(page);
  expect(initialMetrics.scrollHeight).toBeGreaterThan(initialMetrics.clientHeight);
  const beforeZoom = await minimapViewportPercent(page);

  for (let index = 0; index < 5; index += 1) {
    await zoomInButton(page).click();
  }
  expect(await currentZoomPercent(page)).toBe(ZOOM_DEFAULT + 5 * ZOOM_STEP);

  const zoomedMetrics = await scrollMetrics(page);
  expect(
    zoomedMetrics.scrollHeight,
    "줌을 올렸는데 층 스크롤 영역의 scrollHeight가 커지지 않았습니다",
  ).toBeGreaterThan(initialMetrics.scrollHeight);
  const expectedHeightPercent = (zoomedMetrics.clientHeight / zoomedMetrics.scrollHeight) * 100;

  // 실측치를 단언 전에 먼저 기록한다(실패해도 수치가 남아야 한다 — T-015 m2는 측정 자체가 산출물이다).
  const zoomedViewport = await minimapViewportPercent(page);
  const measurement =
    `zoom ${ZOOM_DEFAULT}% → ${ZOOM_DEFAULT + 5 * ZOOM_STEP}%: 층 스크롤 영역 scrollHeight ` +
    `${initialMetrics.scrollHeight}px → ${zoomedMetrics.scrollHeight}px (clientHeight ` +
    `${zoomedMetrics.clientHeight}px) / 미니맵 뷰포트 높이 ${beforeZoom.height}% → ` +
    `${zoomedViewport.height}% (ui-spec SCR-02 미니맵 행 기준 기대값 ${expectedHeightPercent.toFixed(2)}%)`;
  testInfo.annotations.push({ type: "T-015 m2 미니맵 줌 반응 실측", description: measurement });

  // ui-spec.md SCR-02 미니맵 행: 높이 = clientHeight / scrollHeight, "둘 다 zoom 배율이 적용된 값으로 통일".
  // 다시 그려질 틈을 조건부 폴링으로만 준다(고정 대기 없음 — 값이 맞으면 즉시 빠져나온다).
  const settled = await pollMinimapHeight(page, expectedHeightPercent);
  expect(
    Math.abs(settled - expectedHeightPercent),
    `미니맵 뷰포트 높이가 줌 배율이 적용된 clientHeight/scrollHeight와 다릅니다 — 실측: ${measurement}`,
  ).toBeLessThanOrEqual(PERCENT_TOLERANCE);
});
