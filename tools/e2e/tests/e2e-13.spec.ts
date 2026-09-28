// E2E-13 스크린샷 + 화면 대조 산출물 (architecture.md §8.2 E2E-13 행, DoD "화면 대조").
// fixture: `project-showcase` + `tools/replay/scenarios/showcase.jsonl` 22줄 재생.
// 검증 ID: DoD 화면 대조(리뷰어). 추가로 tasks.md T-024 `추가` 절의 이연 Minor를 실측한다
//   - T-015 m5·m1 책상 가로·세로 pitch 실측 (토큰 값은 바꾸지 않는다 — architect 판단 영역)
//   - T-015 m6 13자 이름 열 번짐 실측
//   - D-032 04-4 변형(hook 미설정 03) 캡처를 공식 산출물에 포함
//   - T-FIX-03 m4 기본 캡처 뷰포트 1440×1024 고정 (`playwright.config.ts`는 고치지 않는다)
//   - T-024 Minor 4 01 문서 높이·사이드바 하단 `수집 상태` 카드의 프레임 내부 여부 실측 (ADR-46 C)
//   - T-024 Minor 6 13자 이름 칩 + **상태 줄**(`작업 중 · 부모 <라벨>`) 열 번짐 실측
//
// **01 캡처를 보는 리뷰어가 먼저 읽을 것(T-024 Minor 4)**: 01 캡처는 뷰포트 clip 1440×1140이고
// 01 문서 총 높이는 그보다 큰 1158px이다(T-025 실측). 그래서 사이드바 하단 `수집 상태` 카드 하단
// 1.75px가 프레임 밖으로 잘린다 — `AppShell`의 `min-h-screen` + `Sidebar`의 `justify-between` 때문이고
// 표 높이 `h-96`은 ADR-49 3에서 현행 유지로 확정됐다(`ui-spec.md` SCR-01 확정된 차이 1항:
// "01 문서 총 높이는 대조 대상 아님"). **요소 누락이 아니다** — `수집 상태` 카드와 그 안의
// `hook 설정됨`은 아래 01 테스트가 DOM으로 직접 단언하고, 실측치는 `captureFrame`이 annotation과
// 실행 로그에 매 실행마다 남긴다.
//
// 재생 줄 ↔ 화면 상태의 근거는 `tools/replay/scenarios/README.md`의 showcase.jsonl 22줄 대응표다.
// 잘못된 상태를 캡처하면 대조가 무의미하므로 **캡처 전에 대응표대로의 상태를 단언**한다.
//
// 캡처 범위: **뷰포트 clip 한 가지 방식**이다(ADR-46 C, conventions.md §8 MUST). 02·03은 기본 뷰포트
// 1440×1024로 찍고, 기준 프레임이 기본 뷰포트보다 높은 01만 캡처 직전 뷰포트 높이를 기준 프레임 높이로
// 바꿨다가 되돌린다. 저장 파일은 `docs/ui/screens/`의 기준 이미지와 **같은 픽셀 크기로 clip**해 리뷰어가
// 그대로 겹쳐 볼 수 있게 한다. 기준 이미지 크기는 PNG 헤더에서 읽어 대조하므로 이 spec에 크기를 임의로
// 적지 않는다.
//
// 목킹 없음: 실제 컨테이너·실제 재생 도구·실제 fixture 파일만 쓴다(conventions.md §8).
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { E2E_DIR, PROJECT_ROOT, readE2eState } from "../lib/e2e-state";
import { SCENARIOS_DIR, replayScenarioLines, scenarioLines } from "../lib/replay";
import {
  PIXEL_FILL,
  SETUP_REFLECT_TIMEOUT_MS,
  agentFile,
  agentFileContent,
  fixturePath,
  gotoReady,
  panelRowValue,
  readFixtureFile,
  removeFixturePath,
  spriteBox,
  spriteScreenFill,
  spriteShirtFill,
  spriteSvg,
  teamFile,
  writeFixtureFile,
} from "./ui-helpers";

/** `tools/replay/scenarios/README.md` showcase.jsonl 대응표의 줄 수. */
const SHOWCASE_LINE_COUNT = 22;
const SHOWCASE_SCENARIO = join(SCENARIOS_DIR, "showcase.jsonl");

/** 사이드바 하단 `CollectorStatus` 카드 제목(lib/text.ts `COLLECTOR_STATUS_TITLE`). 프레임 내부 여부 실측용. */
const COLLECTOR_CARD_TITLE = "수집 상태";

/**
 * 03 오피스 하단 `동작 매핑` 범례 문구(`docs/ui-spec.md` SCR-03 요소 표 원문 그대로).
 * 03 캡처 프레임보다 아래에 있어 캡처로는 보이지 않으므로 DOM으로 단언한다(T-024 리뷰 Minor 5).
 */
const OFFICE_LEGEND_TITLE = "동작 매핑";
const OFFICE_LEGEND_ITEMS = [
  "타이핑 = Edit·Write",
  "읽기 = Read·Grep·Glob",
  "주황 말풍선 = 권한 요청",
  "회색 = 대기",
  "작은 캐릭터 = 서브에이전트",
];

/** 03 선택 패널 각주 2줄(`docs/ui-spec.md` SCR-03 요소 표 원문. 두 번째 줄은 `workflow.lead`로 끝난다). */
const PANEL_FOOTNOTE_TRASH = "제거 = 휴지통(.jaystudio/trash/)으로 이동 · 원문 로그 보기 없음";
function panelFootnoteTerminal(lead: string): string {
  return `작업 지시는 상단 팀장 호출로 연 터미널에서 직접 한다 · claude --agent ${lead}`;
}

/** 산출물 폴더(PNG는 커밋 대상). */
const SCREENSHOT_DIR = join(E2E_DIR, "screenshots");
/** 확정 기준 이미지 폴더(읽기만 한다). */
const REFERENCE_DIR = join(PROJECT_ROOT, "docs", "ui", "screens");

/** `project-showcase` fixture 실물 수치. 값이 바뀌면 이 spec의 단언 근거가 깨진다. */
const AGENT_COUNT = 17;
const SKILL_COUNT = 2;
const WORKFLOW_COUNT = 4;

/** showcase.jsonl 22줄 재생 뒤의 상태 집계(대응표에서 도출). */
const RUNNING_COUNT = 6;
const WAITING_COUNT = 1;
const IDLE_COUNT = 10;

const DEV_TEAM = "dev-team";
const SETTINGS_FILE_SEGMENTS = [".claude", "settings.json"] as const;

/** FR-003-AC9 12종(architecture.md §7.1). 07 `설정 예시 복사`가 만드는 hook 설정과 같은 목록이다. */
const HOOK_EVENT_NAMES = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "Stop",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
];

/**
 * 수집 주소·토큰이 맞는 hook 설정(architecture.md §7.1 형태).
 *
 * fixture 원본의 `settings.json`은 운영 포트·placeholder 토큰을 하드코딩하고 있어 E2E 컨테이너에서는
 * `hook 설정 안 됨`이 된다(fixture의 성질. 팀장 확인 D-052). 공식 캡처는 `hook 설정됨` 화면이어야 하므로
 * **마운트된 임시 사본의** settings.json을 상태 파일의 주소·토큰으로 다시 쓴다(원본 fixture는 건드리지 않는다).
 */
function hookSettingsJson(): string {
  const state = readE2eState();
  const hook = {
    type: "http",
    url: `${state.baseUrl}/hooks/events`,
    headers: { "X-JayStudio-Collect-Token": state.collectToken },
    timeout: 3,
  };
  const hooks: Record<string, unknown> = {};
  for (const eventName of HOOK_EVENT_NAMES) {
    hooks[eventName] = [{ hooks: [hook] }];
  }
  return `${JSON.stringify({ hooks }, null, 2)}\n`;
}

function settingsFile(): string {
  return fixturePath(...SETTINGS_FILE_SEGMENTS);
}

// ── 기준 이미지 크기 (PNG IHDR에서 읽는다. 기준 이미지는 읽기만 하고 수정하지 않는다) ──────────────

interface PixelSize {
  width: number;
  height: number;
}

function pngSize(path: string): PixelSize {
  const header = readFileSync(path).subarray(0, 24);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

/** 실측 수치를 테스트 주석과 실행 로그에 함께 남긴다(리뷰 보고의 근거가 되는 산출물이다). */
function logMeasurement(testInfo: { annotations: { type: string; description?: string }[] }, type: string, description: string): void {
  testInfo.annotations.push({ type, description });
  process.stdout.write(`[E2E-13 실측] ${type}: ${description}\n`);
}

/**
 * 기준 이미지와 같은 픽셀 크기로 잘라 저장한다 — **뷰포트 clip 한 가지 방식**이다
 * (ADR-46 C / conventions.md §8 MUST). 02·03은 기본 뷰포트(1440×1024) 안에서 자르고,
 * 기준 프레임이 기본 뷰포트보다 높은 01만 캡처 직전 뷰포트 높이를 기준 프레임 높이로 바꾼 뒤 되돌린다.
 * `fullPage` 캡처와 "문서 높이 ≥ 프레임 높이" 단언은 쓰지 않는다: 01 실시간 이벤트 표가 고정 높이(`h-96`)라
 * 문서 높이가 콘텐츠에 따라 프레임 높이 아래로 내려갈 수 있고, `AppShell`의 `min-h-screen`이 뷰포트 높이만큼은
 * 보장해 산출물 크기가 콘텐츠와 무관해진다.
 *
 * 뷰포트를 바꿔 찍는 화면(01)에서는 리뷰 판정 근거를 실측해 annotation에 남긴다(T-024 Minor 4):
 * 문서 높이와 사이드바 하단 `수집 상태` 카드가 프레임 안에 들어왔는지.
 */
async function captureFrame(
  page: Page,
  testInfo: { annotations: { type: string; description?: string }[] },
  options: { fileName: string; referenceFileName: string },
): Promise<PixelSize> {
  const viewport = page.viewportSize();
  expect(viewport, "뷰포트 크기를 읽을 수 없습니다").not.toBeNull();
  const baseViewport = viewport as PixelSize;
  // T-FIX-03 m4: 기본 캡처 뷰포트는 기준 캡처와 같은 1440×1024여야 한다(playwright.config.ts에 고정돼 있다).
  expect(baseViewport.width).toBe(1440);
  expect(baseViewport.height).toBe(1024);

  const frame = pngSize(join(REFERENCE_DIR, options.referenceFileName));
  expect(frame.width, "기준 이미지 폭이 1440이 아닙니다").toBe(1440);

  // 기준 프레임이 기본 뷰포트보다 높으면(01) 그 높이로 잠시 바꿔 찍는다.
  const resized = frame.height > baseViewport.height;
  if (resized) {
    await page.setViewportSize({ width: frame.width, height: frame.height });
  }

  try {
    const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const path = join(SCREENSHOT_DIR, options.fileName);
    await page.screenshot({ path, clip: { x: 0, y: 0, width: frame.width, height: frame.height } });

    const saved = pngSize(path);
    expect(saved).toEqual(frame);
    expect(statSync(path).size, "캡처 파일이 비었습니다").toBeGreaterThan(0);
    logMeasurement(
      testInfo,
      `캡처 ${options.fileName}`,
      `${saved.width}×${saved.height}px (기준 ${options.referenceFileName} ${frame.width}×${frame.height}px, ` +
        `뷰포트 ${frame.width}×${resized ? frame.height : baseViewport.height}, 문서 높이 ${documentHeight}px, ` +
        `레이아웃 폭 ${clientWidth}px, 뷰포트 clip)`,
    );

    if (resized) {
      // T-024 Minor 4 판정 근거: 사이드바 하단 `수집 상태` 카드가 프레임 안에 들어왔는가.
      //
      // 현행 사실(2026-09-28 T-025 실측, ADR-49 3에서 현행 유지 확정): 01 문서 높이 1158px >
      // 프레임 1140px이라 이 카드 하단 약 1.75px이 **프레임 밖으로 잘린다**. 캡처만 보면 카드가
      // 없어 보일 수 있으나 요소 누락이 아니다 — 바로 아래 `toBeVisible()`이 카드를 DOM으로 단언하고
      // (01 테스트는 카드 안의 `hook 설정됨`도 단언한다), 잘린 양은 아래 annotation에 수치로 남는다.
      // 프레임을 문서 높이에 맞추지 않는 이유: `ui-spec.md` SCR-01 확정된 차이 1항이 "01 문서 총
      // 높이는 대조 대상 아님"으로 확정했고 기준 PNG와 같은 픽셀 크기로 잘라야 겹쳐 볼 수 있다.
      const collectorCard = sidebar(page).getByText(COLLECTOR_CARD_TITLE, { exact: true }).locator("..");
      await expect(collectorCard).toBeVisible();
      const box = await collectorCard.boundingBox();
      expect(box, "`수집 상태` 카드 상자를 읽을 수 없습니다").not.toBeNull();
      const { y, height } = box as { y: number; height: number };
      const bottom = round2(y + height);
      const insideFrame = y >= 0 && bottom <= frame.height;
      logMeasurement(
        testInfo,
        `캡처 ${options.fileName} 사이드바 수집 상태 카드`,
        `top ${round2(y)}px · bottom ${bottom}px · 프레임 높이 ${frame.height}px → ` +
          `${
            insideFrame
              ? "프레임 안"
              : `프레임 밖 ${round2(bottom - frame.height)}px(T-024 Minor 4 잔존 · ADR-49 3에서 현행 유지 확정 · ` +
                "요소 누락이 아니라 DOM 단언으로 검증된다)"
          }, 문서 높이 ${documentHeight}px ` +
          `(${documentHeight <= frame.height ? "프레임 높이 이하" : "프레임 높이 초과"})`,
      );
    }

    return saved;
  } finally {
    if (resized) {
      await page.setViewportSize(baseViewport);
    }
  }
}

// ── 02 책상 격자 실측 (T-015 m5·m1·m6) ────────────────────────────────────────────

interface DeskMetric {
  name: string;
  label: string;
  /** 책상 SVG(46px 고정)의 중심. 열 중앙 정렬이므로 중심 간 거리가 곧 열 pitch다. */
  centerX: number;
  centerY: number;
  /** 이름 칩의 좌·우 끝과 폭. 열 번짐 판정에 쓴다. */
  labelLeft: number;
  labelRight: number;
  labelWidth: number;
  /**
   * 상태 줄(`DeskSprite.tsx` 마지막 줄 `작업 중`/`대기`/`작업 중 · 부모 <라벨>`)의 문구와 좌·우 끝·폭.
   * 같은 책상에서 이름 칩(12자 + `…`로 제한)보다 **넓어질 수 있는 유일한 요소**라 번짐 판정에 함께 쓴다
   * (T-024 리뷰 Minor 6).
   */
  statusText: string;
  statusLeft: number;
  statusRight: number;
  statusWidth: number;
}

/** 층 카드 안 책상들의 실측값(DOM 순서 = FR-006-AC1 정렬 순서). */
async function deskMetrics(page: Page, workflowName: string): Promise<DeskMetric[]> {
  return page
    .getByRole("heading", { level: 3, name: workflowName, exact: true })
    .evaluate((heading) => {
      // h3 → 이름·인원 묶음 → 헤더 행 → 층 카드
      const card = heading.parentElement?.parentElement?.parentElement;
      if (card === null || card === undefined) return [];
      return [...card.querySelectorAll("svg[role='img']")].map((svg) => {
        const box = svg.getBoundingClientRect();
        const root = svg.parentElement;
        const labelSpan = root?.querySelector("span[title] > span") ?? null;
        const labelRect = labelSpan?.getBoundingClientRect() ?? { left: 0, right: 0, width: 0 };
        // 상태 줄은 책상 묶음(`DeskSprite`)의 마지막 자식 span이다. 선택 결과는 호출하는 쪽에서
        // `statusText`로 검증한다(구조가 바뀌면 빈 문구로 드러난다).
        const statusSpan = root?.lastElementChild ?? null;
        const statusRect = statusSpan?.getBoundingClientRect() ?? { left: 0, right: 0, width: 0 };
        return {
          name: svg.getAttribute("aria-label") ?? "",
          label: labelSpan?.textContent ?? "",
          centerX: box.left + box.width / 2,
          centerY: box.top + box.height / 2,
          labelLeft: labelRect.left,
          labelRight: labelRect.right,
          labelWidth: labelRect.width,
          statusText: statusSpan?.textContent ?? "",
          statusLeft: statusRect.left,
          statusRight: statusRect.right,
          statusWidth: statusRect.width,
        };
      });
    });
}

/** 같은 줄(중심 y가 같은) 책상들의 가로 pitch 목록. */
function horizontalPitches(desks: DeskMetric[]): number[] {
  const firstRow = desks.filter((desk) => Math.abs(desk.centerY - (desks[0] as DeskMetric).centerY) < 2);
  const pitches: number[] = [];
  for (let index = 1; index < firstRow.length; index += 1) {
    pitches.push(
      (firstRow[index] as DeskMetric).centerX - (firstRow[index - 1] as DeskMetric).centerX,
    );
  }
  return pitches;
}

/** 첫 줄과 두 번째 줄의 중심 y 차이 = 세로 pitch. 두 번째 줄이 없으면 던진다. */
function verticalPitch(desks: DeskMetric[]): number {
  const firstRowY = (desks[0] as DeskMetric).centerY;
  const nextRow = desks.filter((desk) => desk.centerY > firstRowY + 2);
  if (nextRow.length === 0) {
    throw new Error("두 번째 줄이 없어 세로 pitch를 잴 수 없습니다");
  }
  const nextRowY = Math.min(...nextRow.map((desk) => desk.centerY));
  return nextRowY - firstRowY;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 같은 줄(중심 y가 같은) 책상들의 묶음. 번짐·겹침은 줄 안에서만 일어난다. */
function rows(desks: DeskMetric[]): DeskMetric[][] {
  const grouped: DeskMetric[][] = [];
  for (const desk of desks) {
    const row = grouped.find((candidate) => Math.abs((candidate[0] as DeskMetric).centerY - desk.centerY) < 2);
    if (row === undefined) {
      grouped.push([desk]);
    } else {
      row.push(desk);
    }
  }
  return grouped;
}

/**
 * 같은 줄에서 상태 줄끼리 겹치는 쌍(요소 가림 판정 — `docs/ui/README.md` "요소 가림은 결함").
 * ADR-48 C가 면제한 것은 pitch 수치뿐이고 번짐·가림은 그대로 결함 기준이다(T-024 리뷰 Minor 6).
 */
function statusOverlaps(desks: DeskMetric[]): string[] {
  const found: string[] = [];
  for (const row of rows(desks)) {
    for (let index = 1; index < row.length; index += 1) {
      const left = row[index - 1] as DeskMetric;
      const right = row[index] as DeskMetric;
      if (left.statusRight > right.statusLeft) {
        found.push(`${left.name}↔${right.name} ${round2(left.statusRight - right.statusLeft)}px`);
      }
    }
  }
  return found;
}

/** 상태 줄이 자기 열(중심 ± pitch/2) 밖으로 나간 양. 양수면 번짐. */
function statusBleed(desk: DeskMetric, columnPitch: number): { left: number; right: number } {
  return {
    left: round2(desk.centerX - columnPitch / 2 - desk.statusLeft),
    right: round2(desk.statusRight - (desk.centerX + columnPitch / 2)),
  };
}

/** 상태 줄이 가장 넓은 책상(가림이 먼저 일어나는 지점). */
function widestStatusDesk(desks: DeskMetric[]): DeskMetric {
  return [...desks].sort((a, b) => b.statusWidth - a.statusWidth)[0] as DeskMetric;
}

/** 상태 줄 문구 형식(`lib/text.ts agentStatusWithParent`). 선택자가 엉뚱한 요소를 잡으면 여기서 드러난다. */
const STATUS_LINE_PATTERN = /^(작업 중|권한 대기|대기)( · 부모 .+)?$/;

// ── 화면 조회 도우미 ──────────────────────────────────────────────────────────────

function sidebar(page: Page): Locator {
  return page.locator("aside").filter({ hasText: "Jay Studio" });
}

function floorCardByName(page: Page, workflowName: string): Locator {
  return page
    .getByRole("heading", { level: 3, name: workflowName, exact: true })
    .locator("xpath=../../..");
}

async function featuredCardNames(page: Page): Promise<string[]> {
  return page
    .locator("a", { hasText: "워크플로우 보기 →" })
    .evaluateAll((elements) => elements.map((element) => element.querySelector("p")?.textContent ?? ""));
}

test.describe.configure({ mode: "serial" });

let originalSettings = "";

test.beforeAll(() => {
  expect(
    scenarioLines(SHOWCASE_SCENARIO).length,
    "showcase.jsonl 줄 수가 scenarios/README.md 대응표(22줄)와 다릅니다",
  ).toBe(SHOWCASE_LINE_COUNT);

  originalSettings = readFixtureFile(settingsFile());
  // 공식 캡처는 `hook 설정됨` 화면이어야 한다(D-052).
  writeFixtureFile(settingsFile(), hookSettingsJson());

  const result = replayScenarioLines({
    scenarioPath: SHOWCASE_SCENARIO,
    from: 1,
    to: SHOWCASE_LINE_COUNT,
  });
  expect(result.sent).toBe(SHOWCASE_LINE_COUNT);
});

test.afterAll(() => {
  // fixture 임시 사본을 원래대로 돌린다(같은 배치에 다른 spec이 들어와도 전제가 깨지지 않게).
  writeFixtureFile(settingsFile(), originalSettings);
});

test("[DoD 화면 대조][E2E-13] 01 홈 — showcase 22줄 재생 상태를 단언하고 01-home.png를 남긴다", async ({
  page,
}, testInfo) => {
  await gotoReady(page, "/");

  // hook 설정이 인식됐다(사이드바 탭 + KPI 4).
  await expect(sidebar(page).getByText("hook 설정됨", { exact: true })).toBeVisible({
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });

  // KPI 1·2·3 (FR-005-AC1·AC2): 실행 중 6 / 17, 에이전트 17, 스킬 2.
  await expect(page.getByText(`${RUNNING_COUNT} / ${AGENT_COUNT}`, { exact: true })).toBeVisible();
  await expect(
    page.getByText(`hook 이벤트 기준 · 권한·입력 대기 ${WAITING_COUNT}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(".claude/agents 정의 파일 수", { exact: true })).toBeVisible();
  await expect(page.getByText(".claude/skills 스킬 수", { exact: true })).toBeVisible();

  // 상태 막대 범례 3상태 합 = 에이전트 수.
  await expect(page.getByText(`작업 중 ${RUNNING_COUNT}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`입력·권한 대기 ${WAITING_COUNT}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`대기 ${IDLE_COUNT}`, { exact: true })).toBeVisible();
  expect(RUNNING_COUNT + WAITING_COUNT + IDLE_COUNT).toBe(AGENT_COUNT);

  // 대표 워크플로우 3장: 활성(실행 중·권한 대기 있음) 워크플로우가 앞이고, 마지막은 이벤트가 있는 ops-team이다
  // (video-team은 이벤트가 전혀 없어 마지막 순위 — scenarios/README.md showcase 절).
  const featured = await featuredCardNames(page);
  expect(featured).toHaveLength(3);
  expect(new Set(featured.slice(0, 2))).toEqual(new Set([DEV_TEAM, "mkt-team"]));
  expect(featured[2]).toBe("ops-team");

  // 실시간 이벤트: 재생한 22건 + 연결 표시 + 마스킹(FR-005-AC6·AC8, FR-015-AC1).
  await expect(
    page.getByText(`최근 ${SHOWCASE_LINE_COUNT}개 · 전체 로그 화면 없음`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("실시간 연결됨", { exact: true })).toBeVisible();
  await expect(page.getByText("export TOKEN=••••••••", { exact: true })).toBeVisible();
  await expect(
    page.getByText("token·key·password 등 기본 패턴은 ••••••••로 가림", { exact: true }),
  ).toBeVisible();

  await captureFrame(page, testInfo, { fileName: "01-home.png", referenceFileName: "01-home.png" });
});

test("[DoD 화면 대조][E2E-13] 02 워크플로우 층 뷰 — 로비 2세션·층 4개 상태를 단언하고 02-workflows.png를 남긴다", async ({
  page,
}, testInfo) => {
  await gotoReady(page, "/workflows");

  // 요약 줄·범례(fixture 실물 + 재생 결과).
  await expect(
    page.getByText(
      `에이전트 ${AGENT_COUNT} · 스킬 ${SKILL_COUNT} · 워크플로우 ${WORKFLOW_COUNT}`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("워크플로우 밖 에이전트 0", { exact: true })).toBeVisible();

  // 로비 2세션(대응표 1~4줄). 로비 waiting은 `입력 대기` 표기다(ui-spec.md SCR-02 로비 행).
  const lobby = page.locator("section").filter({ hasText: "로비 · 메인 세션" });
  await expect(lobby.getByText("[세션 1] · 작업 중", { exact: true })).toBeVisible();
  await expect(lobby.getByText("[세션 2] · 입력 대기", { exact: true })).toBeVisible();

  // 층 4개 순서(이름 오름차순)와 각 층 헤더 요약(FR-006-AC5).
  const floorNames = await page
    .getByRole("heading", { level: 3 })
    .evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));
  expect(floorNames).toEqual([DEV_TEAM, "mkt-team", "ops-team", "video-team"]);

  await expect(floorCardByName(page, DEV_TEAM).getByText("8명", { exact: true })).toBeVisible();
  await expect(
    floorCardByName(page, DEV_TEAM).getByText("실행 중 4명 · 권한 대기 1명", { exact: true }),
  ).toBeVisible();
  await expect(floorCardByName(page, "mkt-team").getByText("실행 중 2명", { exact: true })).toBeVisible();
  // 팀장 없는 층(ops-team): 요약 자리 `팀장 없음` + 경고 줄(FR-006-AC3).
  await expect(floorCardByName(page, "ops-team").getByText("팀장 없음", { exact: true })).toBeVisible();
  await expect(
    floorCardByName(page, "ops-team").getByText("팀장이 없습니다 · 팀장을 만들거나 가져오세요", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(floorCardByName(page, "video-team").getByText("모두 대기", { exact: true })).toBeVisible();

  // 정의 있는 서브에이전트는 02 책상에서도 부모 접미가 붙는다(대응표 14줄, FR-007-AC3).
  await expect(
    spriteBox(page, "dev-07").getByText(`작업 중 · 부모 ${"dev-lead"}`, { exact: true }),
  ).toBeVisible();

  await captureFrame(page, testInfo, {
    fileName: "02-workflows.png",
    referenceFileName: "02-workflows.png",
  });
});

test("[DoD 화면 대조][E2E-13] 03 픽셀 오피스 — 말풍선·부모·작은 캐릭터를 단언하고 03-workflow-detail.png를 남긴다", async ({
  page,
}, testInfo) => {
  await gotoReady(page, `/workflows/${DEV_TEAM}`);

  // 04-4 배너는 없다(hook 설정됨 + 이벤트 수신 이력 있음).
  await expect(page.getByRole("status").filter({ hasText: "hook 이벤트 수신 없음" })).toHaveCount(0);

  // 헤더: 수치 + 칩(권한 대기 우선, FR-007-AC9) + 팀장.
  await expect(
    page.locator("main").first().getByText(`에이전트 8 · 스킬 ${SKILL_COUNT}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(`권한 대기 ${WAITING_COUNT}명`, { exact: true })).toBeVisible();

  // 오피스 칸 순서: 팀장 첫 자리 → 정의 없는 서브에이전트는 부모 바로 다음 칸(FR-007-AC3, ADR-28).
  const officeNames = await page
    .locator(".office-grid svg[role='img']")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label") ?? ""));
  expect(officeNames).toEqual([
    "dev-lead",
    "Explore",
    "dev-02",
    "dev-03",
    "dev-04",
    "dev-05",
    "dev-06",
    "dev-07",
    "dev-08",
  ]);

  // 말풍선(대응표 5~16줄, FR-007-AC2).
  await expect(spriteBox(page, "dev-lead").getByText("타이핑 · Edit", { exact: true })).toBeVisible();
  await expect(spriteBox(page, "dev-02").getByText("읽기 · Read", { exact: true })).toBeVisible();
  await expect(spriteBox(page, "dev-03").getByText("권한 요청", { exact: true })).toBeVisible();
  await expect(spriteBox(page, "dev-05").getByText("Bash", { exact: true })).toBeVisible();
  await expect(spriteBox(page, "dev-04").getByText("대기", { exact: true }).first()).toBeVisible();
  // 정의 있는/없는 서브에이전트의 부모 접미.
  await expect(spriteBox(page, "dev-07").getByText("작업 중 · 부모 dev-lead", { exact: true })).toBeVisible();
  await expect(spriteBox(page, "Explore").getByText("작업 중 · 부모 dev-lead", { exact: true })).toBeVisible();

  // 기본 선택 = 팀장(FR-007-AC4) + 패널 값(FR-007-AC5).
  await expect(panelRowValue(page, "상태")).toHaveText("작업 중");
  await expect(panelRowValue(page, "현재 도구")).toHaveText("Edit · .claude/agents/dev-lead.md");

  // 오피스 하단 `동작 매핑` 범례와 패널 각주 2줄 — 03 캡처 프레임보다 아래에 있어 캡처로는 확인할 수
  // 없지만 DOM에는 있어야 한다(ui-spec.md SCR-03 요소 표. T-024 리뷰 Minor 5).
  const officeLegend = page.getByText(OFFICE_LEGEND_TITLE, { exact: true }).locator("..");
  await expect(officeLegend).toBeVisible();
  for (const item of OFFICE_LEGEND_ITEMS) {
    await expect(officeLegend.getByText(item, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(PANEL_FOOTNOTE_TRASH, { exact: true })).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: panelFootnoteTerminal("dev-lead") }),
  ).toBeVisible();

  await captureFrame(page, testInfo, {
    fileName: "03-workflow-detail.png",
    referenceFileName: "03-workflow-detail.png",
  });
});

test("[DoD 화면 대조][E2E-13][D-032] 03 04-4 변형 — hook 설정을 지운 03을 03-workflow-detail-collector-down.png로 남긴다", async ({
  page,
}, testInfo) => {
  try {
    await gotoReady(page, `/workflows/${DEV_TEAM}`);
    const collectorBanner = page.getByRole("status").filter({ hasText: "hook 이벤트 수신 없음" });
    await expect(collectorBanner).toHaveCount(0);

    // hook 항목을 지우면 `!registry.hookConfigured` → 04-4 표시 조건이 된다(FR-007-E1).
    writeFixtureFile(settingsFile(), "{}\n");
    await expect(collectorBanner).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
    await expect(collectorBanner.locator("p").first()).toHaveText(
      /^hook 이벤트 수신 없음 · 마지막 수신 \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
    await expect(collectorBanner).toContainText(
      "Claude Code 미실행 또는 컨테이너 재시작 · 캐릭터는 모두 회색 대기",
    );

    // ADR-17 표시 고정: 캐릭터·상태 글자·패널 상태는 모두 `대기`, 현재 도구는 `-`.
    await expect(spriteBox(page, "dev-lead").getByText("대기", { exact: true })).toHaveCount(2);
    await expect(spriteBox(page, "dev-07").getByText("대기", { exact: true })).toHaveCount(2);
    // 셔츠·모니터도 대기색이어야 한다(ui-spec.md SCR-04-4 "캐릭터 모두 회색 대기"). 캡처가 이 상태임을 증명한다.
    // 재생 결과 실제 상태가 running/waiting인 캐릭터와 정의 없는 서브에이전트를 함께 확인한다.
    for (const name of ["dev-lead", "dev-02", "dev-03", "dev-05", "dev-07", "Explore"]) {
      expect(await spriteShirtFill(page, name), `${name} 셔츠 색`).toBe(PIXEL_FILL.shirtIdle);
      expect(await spriteScreenFill(page, name), `${name} 모니터 색`).toBe(PIXEL_FILL.screenIdle);
    }
    await expect(panelRowValue(page, "상태")).toHaveText("대기");
    await expect(panelRowValue(page, "현재 도구")).toHaveText("-");
    // ADR-27 고정 비대상: 헤더 칩은 실제 live 값이라 그대로 `권한 대기 1명`이다.
    await expect(page.getByText(`권한 대기 ${WAITING_COUNT}명`, { exact: true })).toBeVisible();

    await captureFrame(page, testInfo, {
      fileName: "03-workflow-detail-collector-down.png",
      // 기준 이미지가 없는 변형 캡처이므로 03 기준 프레임과 같은 범위로 맞춘다(리뷰어가 03과 나란히 본다).
      referenceFileName: "03-workflow-detail.png",
    });
  } finally {
    writeFixtureFile(settingsFile(), hookSettingsJson());
  }

  // 되돌렸는지 화면으로 확인한다.
  await gotoReady(page, `/workflows/${DEV_TEAM}`);
  await expect(page.getByRole("status").filter({ hasText: "hook 이벤트 수신 없음" })).toHaveCount(0, {
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });
});


test("[E2E-13][T-015 m5][T-015 m1] 02 책상 가로·세로 pitch 실측 — span-3(9열) 층과 span-1(4열) 층", async ({
  page,
}, testInfo) => {
  // 공식 캡처를 모두 끝낸 뒤에만 실행한다(serial 선언 순서). fixture 변경은 측정 후 되돌린다.
  //
  // 가로 pitch는 "책상 격자 안쪽 폭 / 열 수"로 정해지고 열 수는 층 span에 따라 9열(인원 7 이상) 또는
  // 4열이다(`Floor.tsx`, FR-006-AC2). 기준 PNG의 86px과 비교할 수 있는 쪽은 4열 층이므로 두 경우를
  // 모두 재서 남긴다.
  const SPAN1_TEAM = "video-team";
  const DEV_EXTRA = ["dev-09", "dev-10"]; // span-3 층을 9칸 넘겨 두 번째 줄을 만든다
  const VIDEO_EXTRA = ["video-05"]; // span-1 층을 4칸 넘겨 두 번째 줄을 만든다
  const originalDevTeam = readFixtureFile(teamFile(DEV_TEAM));
  const originalVideoTeam = readFixtureFile(teamFile(SPAN1_TEAM));

  try {
    await gotoReady(page, "/workflows");

    // ① 공식 캡처와 같은 상태의 가로 pitch (dev-team 8명 = span-3 9열 / video-team 4명 = span-1 4열).
    const capturedSpan3 = await deskMetrics(page, DEV_TEAM);
    expect(capturedSpan3.map((desk) => desk.name)).toEqual([
      "dev-lead",
      "dev-02",
      "dev-03",
      "dev-04",
      "dev-05",
      "dev-06",
      "dev-07",
      "dev-08",
    ]);
    const span3Pitches = horizontalPitches(capturedSpan3);
    expect(span3Pitches).toHaveLength(7);
    const span3Pitch = round2(span3Pitches[0] as number);
    for (const pitch of span3Pitches) {
      expect(Math.abs(pitch - span3Pitch), "span-3 층의 가로 pitch가 균일하지 않습니다").toBeLessThan(1);
    }

    const capturedSpan1 = await deskMetrics(page, SPAN1_TEAM);
    expect(capturedSpan1.map((desk) => desk.name)).toEqual([
      "video-lead",
      "video-02",
      "video-03",
      "video-04",
    ]);
    const span1Pitches = horizontalPitches(capturedSpan1);
    expect(span1Pitches).toHaveLength(3);
    const span1Pitch = round2(span1Pitches[0] as number);
    for (const pitch of span1Pitches) {
      expect(Math.abs(pitch - span1Pitch), "span-1 층의 가로 pitch가 균일하지 않습니다").toBeLessThan(1);
    }

    logMeasurement(
      testInfo,
      "T-015 m5 가로 pitch",
      `span-1(4열, ${SPAN1_TEAM} 4명) ${span1Pitch}px [기준 PNG 실측값 86px → 차이 ` +
        `${round2(span1Pitch - 86)}px] / span-3(9열, ${DEV_TEAM} 8명) ${span3Pitch}px. ` +
        `표본 span-1 ${span1Pitches.map((pitch) => round2(pitch)).join(", ")} · ` +
        `span-3 ${span3Pitches.map((pitch) => round2(pitch)).join(", ")}. ` +
        `원인으로 지목된 토큰 --spacing-card(16px, 기준 10px)는 01·03과 공유하므로 값을 바꾸지 않았다`,
    );

    // ② 줄이 두 개가 되게 인원을 늘려 세로 pitch를 잰다(열 수는 그대로이므로 가로 pitch는 변하지 않는다).
    for (const name of [...DEV_EXTRA, ...VIDEO_EXTRA]) {
      writeFixtureFile(
        agentFile(name),
        agentFileContent({ name, description: `T-024 pitch 실측용 (${name})`, body: "측정용." }),
      );
    }
    const devTeam = JSON.parse(originalDevTeam) as { members: string[] };
    devTeam.members = [...devTeam.members, ...DEV_EXTRA].sort();
    writeFixtureFile(teamFile(DEV_TEAM), `${JSON.stringify(devTeam, null, 2)}\n`);
    const videoTeam = JSON.parse(originalVideoTeam) as { members: string[] };
    videoTeam.members = [...videoTeam.members, ...VIDEO_EXTRA].sort();
    writeFixtureFile(teamFile(SPAN1_TEAM), `${JSON.stringify(videoTeam, null, 2)}\n`);

    for (const name of [...DEV_EXTRA, ...VIDEO_EXTRA]) {
      await expect(spriteSvg(page, name)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
    }

    const widenedSpan3 = await deskMetrics(page, DEV_TEAM);
    expect(widenedSpan3).toHaveLength(10);
    expect(Math.abs((horizontalPitches(widenedSpan3)[0] as number) - span3Pitch)).toBeLessThan(1);
    const span3Vertical = round2(verticalPitch(widenedSpan3));

    const widenedSpan1 = await deskMetrics(page, SPAN1_TEAM);
    expect(widenedSpan1).toHaveLength(5);
    expect(Math.abs((horizontalPitches(widenedSpan1)[0] as number) - span1Pitch)).toBeLessThan(1);
    const span1Vertical = round2(verticalPitch(widenedSpan1));

    logMeasurement(
      testInfo,
      "T-015 m1 세로 pitch",
      `span-1(4열, ${SPAN1_TEAM} 5명 → 4+1줄) ${span1Vertical}px / ` +
        `span-3(9열, ${DEV_TEAM} 10명 → 9+1줄) ${span3Vertical}px ` +
        `(둘 다 책상 묶음 높이 + gap-y-2 8px). 토큰 값은 바꾸지 않았다`,
    );
    // 두 층의 책상 묶음 구조가 같으므로 세로 pitch도 같아야 한다(균일성 확인).
    expect(Math.abs(span1Vertical - span3Vertical), "층 span에 따라 세로 pitch가 다릅니다").toBeLessThan(1);
  } finally {
    writeFixtureFile(teamFile(DEV_TEAM), originalDevTeam);
    writeFixtureFile(teamFile(SPAN1_TEAM), originalVideoTeam);
    for (const name of [...DEV_EXTRA, ...VIDEO_EXTRA]) {
      removeFixturePath(agentFile(name));
    }
  }

  // fixture가 원래대로 돌아왔는지 화면으로 확인한다.
  await gotoReady(page, "/workflows");
  await expect(floorCardByName(page, DEV_TEAM).getByText("8명", { exact: true })).toBeVisible({
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });
  await expect(floorCardByName(page, SPAN1_TEAM).getByText("4명", { exact: true })).toBeVisible();
});

test("[E2E-13][T-015 m6][FR-006-AC4] 13자 이름을 가장 좁은 열(span-1 4열) 가운데에 놓고 인접 열 번짐을 실측한다", async ({
  page,
}, testInfo) => {
  // 가장 좁은 열 = span-1 층의 4열. 여기서 번지지 않으면 span-3 9열에서도 번지지 않는다.
  const SPAN1_TEAM = "video-team";
  const LONG_NAME = "vid-longname1"; // 13자 — FR-006-AC4 경계(12자 초과 → 12자 + …)
  const originalVideoTeam = readFixtureFile(teamFile(SPAN1_TEAM));
  expect(LONG_NAME).toHaveLength(13);

  try {
    await gotoReady(page, "/workflows");
    const before = await deskMetrics(page, SPAN1_TEAM);
    const columnPitch = round2(horizontalPitches(before)[0] as number);

    writeFixtureFile(
      agentFile(LONG_NAME),
      agentFileContent({
        name: LONG_NAME,
        description: "T-024 13자 이름 열 번짐 실측용",
        body: "측정용.",
      }),
    );
    const videoTeam = JSON.parse(originalVideoTeam) as { members: string[] };
    videoTeam.members = [...videoTeam.members, LONG_NAME].sort();
    writeFixtureFile(teamFile(SPAN1_TEAM), `${JSON.stringify(videoTeam, null, 2)}\n`);
    await expect(spriteSvg(page, LONG_NAME)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });

    const desks = await deskMetrics(page, SPAN1_TEAM);
    expect(desks).toHaveLength(5);
    // FR-006-AC1: 팀장 첫 자리, 나머지 name 오름차순 → 긴 이름이 첫 줄 두 번째 칸(양쪽에 이웃이 있다).
    expect(desks.map((desk) => desk.name)).toEqual([
      "video-lead",
      LONG_NAME,
      "video-02",
      "video-03",
      "video-04",
    ]);

    const longDesk = desks.find((desk) => desk.name === LONG_NAME) as DeskMetric;
    // FR-006-AC4: 12자 초과 → 12자 + `…`, 전체 이름은 title로.
    expect(longDesk.label, "12자 초과 이름이 말줄임되지 않았습니다").toBe(`${LONG_NAME.slice(0, 12)}…`);
    await expect(spriteSvg(page, LONG_NAME).locator("xpath=../span[@title]")).toHaveAttribute(
      "title",
      LONG_NAME,
    );

    const neighbours = desks.filter(
      (desk) => desk.name === "video-lead" || desk.name === "video-02",
    );
    expect(neighbours).toHaveLength(2);
    const overlaps = neighbours.filter(
      (desk) => longDesk.labelLeft < desk.labelRight && longDesk.labelRight > desk.labelLeft,
    );
    const bleedLeft = round2(longDesk.centerX - columnPitch / 2 - longDesk.labelLeft);
    const bleedRight = round2(longDesk.labelRight - (longDesk.centerX + columnPitch / 2));
    const gapToNeighbour = round2(
      Math.min(
        ...neighbours.map((desk) =>
          desk.centerX < longDesk.centerX
            ? longDesk.labelLeft - desk.labelRight
            : desk.labelLeft - longDesk.labelRight,
        ),
      ),
    );

    logMeasurement(
      testInfo,
      "T-015 m6 13자 이름 열 번짐",
      `표기 "${longDesk.label}" 이름 칩 폭 ${round2(longDesk.labelWidth)}px vs 열 폭 ${columnPitch}px ` +
        `(span-1 4열 = 가장 좁은 열) → 열 경계 밖으로 왼쪽 ${bleedLeft}px · 오른쪽 ${bleedRight}px ` +
        `(양수면 번짐), 인접 이름 칩과의 최소 간격 ${gapToNeighbour}px, 겹침 ${overlaps.length}건`,
    );

    // ui-spec.md SCR-02 책상 행 + docs/ui/README.md(요소 가림은 결함): 인접 열 이름을 가리면 안 된다.
    expect(
      overlaps.map((desk) => desk.name),
      "13자 이름 칩이 인접 열의 이름 칩과 겹칩니다",
    ).toEqual([]);

    // ── 상태 줄 번짐 (T-024 리뷰 Minor 6) ──────────────────────────────────────────
    // 한 책상에서 이름 칩보다 넓어질 수 있는 요소는 상태 줄뿐이다(이름 칩은 12자 + `…`로 잘리지만
    // 상태 줄은 `작업 중 · 부모 <라벨>`까지 길어진다). 가장 좁은 열(span-1 4열)에서 먼저 재고,
    // 이 fixture 상태의 span-1 층에는 부모 접미가 붙는 책상이 없으므로 **실제로 접미가 붙은 span-3 층
    // (dev-team의 dev-07)의 상태 줄 폭**을 함께 재서 같은 문구가 span-1 열 폭에 놓였을 때까지 수치로 남긴다
    // (두 층의 상태 줄 글꼴·크기가 같아 폭은 열과 무관하다).
    for (const desk of desks) {
      expect(desk.statusText, `${desk.name} 상태 줄 문구`).toMatch(STATUS_LINE_PATTERN);
      expect(desk.statusWidth, `${desk.name} 상태 줄 폭`).toBeGreaterThan(0);
    }
    const span1Widest = widestStatusDesk(desks);
    const span1Bleed = statusBleed(span1Widest, columnPitch);
    const span1Overlaps = statusOverlaps(desks);

    const span3Desks = await deskMetrics(page, DEV_TEAM);
    const span3Pitch = round2(horizontalPitches(span3Desks)[0] as number);
    for (const desk of span3Desks) {
      expect(desk.statusText, `${desk.name} 상태 줄 문구`).toMatch(STATUS_LINE_PATTERN);
    }
    const span3Widest = widestStatusDesk(span3Desks);
    const span3Bleed = statusBleed(span3Widest, span3Pitch);
    const span3Overlaps = statusOverlaps(span3Desks);
    // 같은 문구를 가장 좁은 열(span-1)에 놓으면 한쪽으로 이만큼 나간다(중앙 정렬이라 좌우 대칭).
    const projectedSpan1Bleed = round2((span3Widest.statusWidth - columnPitch) / 2);
    // 그 문구를 가진 책상이 span-1에서 **나란히 두 개**일 때의 겹침(둘 다 좌우로 번지므로 폭−열 폭).
    const projectedSpan1Overlap = round2(span3Widest.statusWidth - columnPitch);

    logMeasurement(
      testInfo,
      "T-024 Minor 6 상태 줄 번짐",
      `span-1(4열, 열 폭 ${columnPitch}px) 최대 상태 줄 "${span1Widest.statusText}"(${span1Widest.name}) ` +
        `폭 ${round2(span1Widest.statusWidth)}px → 열 경계 밖 왼쪽 ${span1Bleed.left}px · 오른쪽 ${span1Bleed.right}px, ` +
        `겹침 ${span1Overlaps.length}건${span1Overlaps.length === 0 ? "" : ` [${span1Overlaps.join(" / ")}]`} | ` +
        `span-3(9열, 열 폭 ${span3Pitch}px) 최대 상태 줄 "${span3Widest.statusText}"(${span3Widest.name}) ` +
        `폭 ${round2(span3Widest.statusWidth)}px → 열 경계 밖 왼쪽 ${span3Bleed.left}px · 오른쪽 ${span3Bleed.right}px, ` +
        `겹침 ${span3Overlaps.length}건${span3Overlaps.length === 0 ? "" : ` [${span3Overlaps.join(" / ")}]`} | ` +
        `같은 문구가 span-1 열 폭(${columnPitch}px)에 놓이면 좌·우로 각 ${projectedSpan1Bleed}px 번지고, ` +
        `그런 책상이 나란히 두 개면 ${projectedSpan1Overlap}px 겹친다` +
        `(양수면 번짐·겹침. 이 fixture 상태의 span-1 층에는 부모 접미가 붙는 책상이 없어 실제 겹침은 0건이다)`,
    );

    // 열 경계 번짐(pitch에서 비롯한 수치)은 ADR-48 C가 현행 확정했으나 **요소 가림은 결함 기준**이다.
    expect(span1Overlaps, "span-1 층에서 상태 줄이 인접 열 상태 줄과 겹칩니다").toEqual([]);
    expect(span3Overlaps, "span-3 층에서 상태 줄이 인접 열 상태 줄과 겹칩니다").toEqual([]);
  } finally {
    writeFixtureFile(teamFile(SPAN1_TEAM), originalVideoTeam);
    removeFixturePath(agentFile(LONG_NAME));
  }

  await gotoReady(page, "/workflows");
  await expect(floorCardByName(page, SPAN1_TEAM).getByText("4명", { exact: true })).toBeVisible({
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });
});
