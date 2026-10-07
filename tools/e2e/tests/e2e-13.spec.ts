// E2E-13 스크린샷 + 화면 대조 산출물 (architecture.md §8.2 E2E-13 행, DoD "화면 대조").
// fixture: `project-showcase` + `tools/replay/scenarios/showcase.jsonl` 22줄 재생.
// 검증 ID: DoD 화면 대조(리뷰어). 추가로 tasks.md T-024 `추가` 절의 이연 Minor를 실측한다
//   - T-015 m5·m1 책상 가로·세로 pitch 실측 (토큰 값은 바꾸지 않는다 — architect 판단 영역)
//   - T-015 m6 13자 이름 열 번짐 실측
//   - D-032 04-4 변형(hook 미설정 03) 캡처를 공식 산출물에 포함
//   - T-FIX-03 m4 기본 캡처 뷰포트 1440×1024 고정 (`playwright.config.ts`는 고치지 않는다)
//   - T-024 Minor 4 01 문서 높이·사이드바 하단 `수집 상태` 카드의 프레임 내부 여부 실측 (ADR-46 C)
//   - T-024 Minor 6 13자 이름 칩 + **상태 줄**(`작업 중 · 부모 <라벨>`) 열 번짐 실측
//   - T-FIX-12 span-1 열(4열)에 부모 접미가 붙은 책상을 **나란히 두 개 실제로 놓고** 상태 줄 clamp를
//     실측한다(ADR-50 B. 투영값이 아니라 실측 — `scenarios/span1-status-clamp.jsonl` 재생)
//
// 재생 줄 ↔ 화면 상태의 근거는 `tools/replay/scenarios/README.md`의 showcase.jsonl 22줄 대응표다.
// 잘못된 상태를 보면 단언이 무의미하므로 **대응표대로의 상태를 먼저 단언**한다.
//
// T-R3-05: 기준 이미지(`docs/ui/screens/01-home.png` 등)가 디자인 확정본 가져오기 때 삭제돼(final D-F21)
// `captureFrame` 호출 4곳과 `captureFrame`·`pngSize`·`REFERENCE_DIR` 도우미를 지웠다. 기능 단언은 그대로다.
// 화면 대조 캡처는 T-R3-21이 새 기준으로 다시 정의한다.
//
// 목킹 없음: 실제 컨테이너·실제 재생 도구·실제 fixture 파일만 쓴다(conventions.md §8).
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
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

/**
 * span-1 층(4열)에 부모 접미가 붙은 책상을 **나란히 두 개** 만드는 재생(T-FIX-12, ADR-50 B).
 * `showcase.jsonl`은 22줄 대응표·줄 수 단언·기준 캡처가 걸려 있어 고치지 않고 파일을 따로 둔다
 * (줄별 대응표는 `scenarios/README.md`의 span1-status-clamp 절).
 */
const SPAN1_CLAMP_SCENARIO = join(SCENARIOS_DIR, "span1-status-clamp.jsonl");
const SPAN1_CLAMP_LINE_COUNT = 8;

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
const PANEL_FOOTNOTE_TRASH = "제거 = 휴지통(.aojistudio/trash/)으로 이동 · 원문 로그 보기 없음";
function panelFootnoteTerminal(lead: string): string {
  return `작업 지시는 상단 팀장 호출로 연 터미널에서 직접 한다 · claude --agent ${lead}`;
}

/** 02 책상 칸 폭(`auto-fill 100px`, ui-spec SCR-02). 이름 줄은 이 폭, 상태 줄은 `STATUS_MAX_WIDTH`까지다. */
const COLUMN_PITCH = 100;
const STATUS_MAX_WIDTH = 96;

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
    headers: { "X-AojiStudio-Collect-Token": state.collectToken },
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

// ── 02 책상 격자 실측 (T-015 m5·m1·m6) ────────────────────────────────────────────

interface DeskMetric {
  name: string;
  label: string;
  /** 책상 SVG(46px 고정)의 중심. 열 중앙 정렬이므로 중심 간 거리가 곧 열 pitch다. */
  centerX: number;
  centerY: number;
  /**
   * 이름 칩에 **그려진 글자**의 좌·우 끝과 폭(요소 상자가 아니라 글자 범위 — `paintExtent` 참고).
   * 열 번짐·가림 판정에 쓴다.
   */
  labelLeft: number;
  labelRight: number;
  labelWidth: number;
  /**
   * 상태 줄(`Desk.tsx` 마지막 줄 `작업 중`/`대기`/`작업 중 · 부모 <라벨>`)의 문구와 좌·우 끝·폭.
   * 같은 책상에서 이름 칩(12자 + `…`로 제한)보다 **넓어질 수 있는 유일한 요소**라 번짐 판정에 함께 쓴다
   * (T-024 리뷰 Minor 6).
   */
  statusText: string;
  /**
   * 상태 줄에 **그려진 글자**의 좌·우 끝과 폭. 요소 상자가 아니라 눈에 보이는 글자 범위다
   * (clamp가 걸리면 칸 폭에서 잘린 뒤의 범위 — `paintExtent` 참고). ADR-50 B로 상태 줄 상자가 항상
   * 칸 폭과 같아졌으므로 **상자로 재면 겹침 판정이 공허해진다**: 가림은 글자 범위로만 판정한다.
   */
  statusLeft: number;
  statusRight: number;
  statusWidth: number;
  /**
   * 상태 줄의 `title` 속성. 부모 접미가 있을 때만 전체 문구가 들어간다(ADR-50 B).
   * 공용 `Tooltip` 래퍼가 아니라 **같은 요소의 네이티브 속성**이어야 clamp 기준 폭이 유지된다.
   */
  statusTitle: string | null;
  /** 상태 줄의 레이아웃 폭(`clientWidth`)과 잘리지 않은 글자 폭(`scrollWidth`). 둘이 다르면 clamp가 걸린 것이다. */
  statusClientWidth: number;
  statusScrollWidth: number;
}

/** 층 카드 안 책상들의 실측값(DOM 순서 = FR-006-AC1 정렬 순서). */
async function deskMetrics(page: Page, workflowName: string): Promise<DeskMetric[]> {
  return page
    .getByRole("heading", { level: 3, name: workflowName, exact: true })
    .evaluate((heading) => {
      // h3 → 헤더 행 1줄 → 헤더 div → 층 카드
      const card = heading.parentElement?.parentElement?.parentElement;
      if (card === null || card === undefined) return [];
      /**
       * 요소에 **그려진 글자**의 가로 범위. 요소 상자를 쓰지 않는 이유: ADR-50 B로 두 글자 줄의 상자가
       * 항상 칸 폭과 같아져 상자 기준 겹침 판정이 공허해진다. 글자 범위는 `Range`로 재고, 자기 자신이나
       * 조상이 가로로 잘라내면(`overflow-x: hidden` = clamp) 그 상자들과 교차시켜 **눈에 보이는 범위**만
       * 남긴다(clamp를 어느 층에 걸든 같은 값이 나온다).
       */
      const paintExtent = (element: Element | null): { left: number; right: number; width: number } => {
        if (element === null) return { left: 0, right: 0, width: 0 };
        const range = document.createRange();
        range.selectNodeContents(element);
        const textBox = range.getBoundingClientRect();
        range.detach();
        let left = textBox.left;
        let right = textBox.right;
        for (let node: Element | null = element; node !== null; node = node.parentElement) {
          if (getComputedStyle(node).overflowX !== "hidden") continue;
          const clip = node.getBoundingClientRect();
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
        }
        return { left, right, width: Math.max(0, right - left) };
      };
      return [...card.querySelectorAll("svg[data-testid='pixel-char']")].map((svg) => {
        const box = svg.getBoundingClientRect();
        const root = svg.parentElement;
        const labelSpan = root?.querySelector("span[title]") ?? null;
        const labelRect = paintExtent(labelSpan);
        // 상태 줄은 책상 묶음(`Desk`)의 마지막 자식 span이다. 선택 결과는 호출하는 쪽에서
        // `statusText`로 검증한다(구조가 바뀌면 빈 문구로 드러난다).
        const statusSpan = root?.lastElementChild ?? null;
        const statusRect = paintExtent(statusSpan);
        return {
          name: root?.getAttribute("data-agent-name") ?? "",
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
          statusTitle: statusSpan?.getAttribute("title") ?? null,
          statusClientWidth: statusSpan?.clientWidth ?? 0,
          statusScrollWidth: statusSpan?.scrollWidth ?? 0,
        };
      });
    });
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

/** 상태 줄 문구 형식(`lib/text.ts agentStatusWithParent`). 선택자가 엉뚱한 요소를 잡으면 여기서 드러난다. */
const STATUS_LINE_PATTERN = /^(작업 중|권한 대기|대기)( · 부모 .+)?$/;

// ── 화면 조회 도우미 ──────────────────────────────────────────────────────────────

function sidebar(page: Page): Locator {
  return page.getByRole("complementary", { name: "주 메뉴" });
}

function floorCardByName(page: Page, workflowName: string): Locator {
  return page
    .getByRole("heading", { level: 3, name: workflowName, exact: true })
    .locator("xpath=../../..");
}

async function featuredCardNames(page: Page): Promise<string[]> {
  return page
    .locator("a", { hasText: "워크플로우 보기" })
    .evaluateAll((elements) => elements.map((element) => element.querySelector("h3")?.textContent ?? ""));
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

test("[DoD 화면 대조][E2E-13] 01 홈 — showcase 22줄 재생 상태를 단언한다", async ({
  page,
}) => {
  await gotoReady(page, "/");

  // hook 설정이 인식됐다(사이드바 탭 + KPI 4).
  await expect(sidebar(page).getByText("hook 설정됨", { exact: true })).toBeVisible({
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });

  // KPI 1·2·3 (FR-005-AC1·AC2): 실행 중 6 / 17, 에이전트 17, 스킬 2.
  // `/ 전체`는 수치와 다른 요소(D-125 이후 KPI 1 두 요소)라 각각 단언한다.
  await expect(page.getByTestId("kpi-running-value")).toHaveText(String(RUNNING_COUNT));
  await expect(page.getByTestId("kpi-running-total")).toHaveText(`/ ${AGENT_COUNT}`);
  await expect(page.getByTestId("kpi-running-sub")).toHaveText(
    `권한·입력 대기 ${WAITING_COUNT} · hook 이벤트 기준`,
  );
  await expect(page.getByText(".claude/agents 정의 파일", { exact: true })).toBeVisible();
  await expect(page.getByText(".claude/skills 스킬 폴더", { exact: true })).toBeVisible();

  // 상태 막대 범례 3상태 합 = 에이전트 수.
  await expect(page.getByText(`작업 중 ${RUNNING_COUNT}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`권한·입력 대기 ${WAITING_COUNT}`, { exact: true })).toBeVisible();
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
    page.getByText("최근 50개 · 최신순", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("실시간 연결됨", { exact: true })).toBeVisible();
  await expect(page.getByText("export TOKEN=••••••••", { exact: true })).toBeVisible();
  await expect(
    page.getByText("token·key·password 같은 민감 값은 ••••••••로 가립니다", { exact: true }),
  ).toBeVisible();

});

test("[DoD 화면 대조][E2E-13] 02 워크플로우 층 뷰 — 로비 2세션·층 4개 상태를 단언한다", async ({
  page,
}) => {
  await gotoReady(page, "/workflows");

  // 요약 줄·범례(fixture 실물 + 재생 결과).
  await expect(
    page.getByText(
      `에이전트 ${AGENT_COUNT} · 스킬 ${SKILL_COUNT} · 워크플로우 ${WORKFLOW_COUNT}`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("워크플로우 밖 에이전트 0 · 가져오기", { exact: true })).toBeVisible();

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

});

test("[DoD 화면 대조][E2E-13] 03 픽셀 오피스 — 말풍선·부모·작은 캐릭터를 단언한다", async ({
  page,
}) => {
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
    .locator(".office-grid svg[data-testid='pixel-char']")
    .evaluateAll((elements) => elements.map((element) => element.parentElement?.getAttribute("data-agent-name") ?? ""));
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

});

test("[DoD 화면 대조][E2E-13][D-032] 03 04-4 변형 — hook 설정을 지운 03의 04-4 표시를 단언한다", async ({
  page,
}) => {
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
  } finally {
    writeFixtureFile(settingsFile(), hookSettingsJson());
  }

  // 되돌렸는지 화면으로 확인한다.
  await gotoReady(page, `/workflows/${DEV_TEAM}`);
  await expect(page.getByRole("status").filter({ hasText: "hook 이벤트 수신 없음" })).toHaveCount(0, {
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });
});


test("[E2E-13][T-015 m6][FR-006-AC4] 13자 이름을 보통 층 첫 줄 두 번째 칸(책상 칸 100px)에 놓고 이웃 칸 번짐·겹침을 확인한다", async ({
  page,
}) => {
  // 기준 폭은 책상 칸 100px(이름 줄 100, 상태 줄 최대 96). 보통 층(video-team)과 넓은 층(dev-team) 모두 확인한다.
  const SPAN1_TEAM = "video-team";
  const LONG_NAME = "vid-longname1"; // 13자 — FR-006-AC4 경계(12자 초과 → 12자 + …)
  const originalVideoTeam = readFixtureFile(teamFile(SPAN1_TEAM));
  expect(LONG_NAME).toHaveLength(13);

  try {
    await gotoReady(page, "/workflows");

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
    // 선택자는 이름 span(`span[title][data-clamp]`)으로 좁힌다 — 부모 접미가 붙은 책상은 상태 줄에도
    // `title`이 생기므로(ADR-50 B) 책상 안 `title` 요소를 세는 선택자는 strict 위반이 된다.
    // 이 상태의 보통 층에는 접미가 없다(아래 상태 줄 문구 단언이 확인한다).
    await expect(spriteBox(page, LONG_NAME).locator("span[title][data-clamp]")).toHaveAttribute(
      "title",
      LONG_NAME,
    );
    // ADR-50 B: 이름 칩도 칸 폭에서 잘린다(ui-spec §공통 `Desk` "두 글자 줄은 그리드 칸 폭을 넘지 않는다").
    expect(
      round2(longDesk.labelWidth),
      "13자 이름 칩이 칸 폭을 넘습니다",
    ).toBeLessThanOrEqual(COLUMN_PITCH + 1);

    const neighbours = desks.filter(
      (desk) => desk.name === "video-lead" || desk.name === "video-02",
    );
    expect(neighbours).toHaveLength(2);
    const overlaps = neighbours.filter(
      (desk) => longDesk.labelLeft < desk.labelRight && longDesk.labelRight > desk.labelLeft,
    );
    // ui-spec.md SCR-02 책상 행 + docs/ui/README.md(요소 가림은 결함): 이웃 칸 이름을 가리면 안 된다.
    expect(
      overlaps.map((desk) => desk.name),
      "13자 이름 칩이 이웃 칸의 이름 칩과 겹칩니다",
    ).toEqual([]);

    // ── 상태 줄 폭·겹침 (T-024 리뷰 Minor 6) ──────────────────────────────────────
    // 한 책상에서 이름 칩보다 넓어질 수 있는 요소는 상태 줄뿐이다. 보통 층·넓은 층 모두 문구 형식·폭 > 0·겹침 0을 본다.
    for (const desk of desks) {
      expect(desk.statusText, `${desk.name} 상태 줄 문구`).toMatch(STATUS_LINE_PATTERN);
      expect(desk.statusWidth, `${desk.name} 상태 줄 폭`).toBeGreaterThan(0);
    }
    const normalOverlaps = statusOverlaps(desks);

    const wideDesks = await deskMetrics(page, DEV_TEAM);
    for (const desk of wideDesks) {
      expect(desk.statusText, `${desk.name} 상태 줄 문구`).toMatch(STATUS_LINE_PATTERN);
    }
    const wideOverlaps = statusOverlaps(wideDesks);

    // 요소 가림은 결함 기준이다.
    expect(normalOverlaps, "보통 층에서 상태 줄이 이웃 칸 상태 줄과 겹칩니다").toEqual([]);
    expect(wideOverlaps, "넓은 층에서 상태 줄이 이웃 칸 상태 줄과 겹칩니다").toEqual([]);
  } finally {
    writeFixtureFile(teamFile(SPAN1_TEAM), originalVideoTeam);
    removeFixturePath(agentFile(LONG_NAME));
  }

  await gotoReady(page, "/workflows");
  await expect(floorCardByName(page, SPAN1_TEAM).getByText("4명", { exact: true })).toBeVisible({
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });
});

/**
 * 보통 층의 이웃 두 칸(책상 칸 100px)에 부모 접미가 붙은 책상을 실제로 놓고 상태 줄 clamp를 단언한다(ADR-50 B).
 *
 * 한 번 호출로 T-FIX-12 Done when의 ①~④(13자 라벨 단계에서는 ⑤)를 모두 단언한다.
 * 투영값은 쓰지 않는다 — 두 책상이 같은 줄의 이웃 칸에 실제로 있고 접미가 실제로 붙은 상태에서 잰 값만 쓴다.
 */
async function assertSpan1SuffixPair(options: {
  page: Page;
  workflowName: string;
  pair: readonly [string, string];
  parentLabel: string;
  phase: string;
}): Promise<void> {
  const { page, workflowName, pair, parentLabel, phase } = options;
  const desks = await deskMetrics(page, workflowName);
  const expectedStatus = `작업 중 · 부모 ${parentLabel}`;

  // 측정 대상 두 책상(구조 전제 — 이것이 없으면 아래 실측 자체가 성립하지 않는다).
  const left = desks.find((desk) => desk.name === pair[0]);
  const right = desks.find((desk) => desk.name === pair[1]);
  expect(left, `${phase} ${pair[0]} 책상을 찾지 못했습니다`).toBeDefined();
  expect(right, `${phase} ${pair[1]} 책상을 찾지 못했습니다`).toBeDefined();
  const pairDesks = [left as DeskMetric, right as DeskMetric];
  const overlaps = statusOverlaps(desks);

  // 선택자가 엉뚱한 요소를 잡지 않았는지 고정한다(모든 책상의 상태 줄이 조립 규칙대로다).
  for (const desk of desks) {
    expect(desk.statusText, `${phase} ${desk.name} 상태 줄 문구`).toMatch(STATUS_LINE_PATTERN);
  }

  // ① 접미가 실제로 붙었다(먼저 고정해야 겹침 0건이 공허하지 않다).
  for (const desk of pairDesks) {
    expect(desk.statusText, `${phase} ${desk.name} 상태 줄`).toBe(expectedStatus);
    expect(desk.statusText).toMatch(/^작업 중 · 부모 .+$/);
  }

  // ③ 그려진 상태 줄끼리 겹치지 않는다(요소 가림 판정 — `docs/ui/README.md`, FR-006-AC10).
  expect(overlaps, `${phase} span-1 층에서 상태 줄이 인접 열 상태 줄과 겹칩니다`).toEqual([]);

  // ④ 그려진 상태 줄이 상태 줄 최대 폭(96) 안에 있다(책상 칸 100px 안).
  for (const desk of pairDesks) {
    expect(
      round2(desk.statusWidth),
      `${phase} ${desk.name} 상태 줄 폭이 칸 폭을 넘습니다`,
    ).toBeLessThanOrEqual(STATUS_MAX_WIDTH + 1);
  }

  // ② 두 책상은 같은 줄의 이웃 칸이다(centerX 차이 = 책상 칸 100px). 가림 판정(③·④) **뒤**에 둔다 —
  // clamp를 되돌리면 책상 묶음이 칸 밖으로 번져 행·열 계산도 함께 흔들리는데, 그때 먼저 드러나야 하는
  // 사실은 "글자가 겹쳤다"이기 때문이다.
  const [leftDesk, rightDesk] = pairDesks as [DeskMetric, DeskMetric];
  expect(Math.abs(leftDesk.centerY - rightDesk.centerY), `${phase} 두 책상이 같은 행이 아닙니다`).toBeLessThan(2);
  expect(
    Math.abs(rightDesk.centerX - leftDesk.centerX - COLUMN_PITCH),
    `${phase} 두 책상이 이웃 칸이 아닙니다(centerX 차이 ${round2(rightDesk.centerX - leftDesk.centerX)}px, ` +
      `칸 폭 ${COLUMN_PITCH}px)`,
  ).toBeLessThan(1);

  // 잘린 전체 문구는 같은 요소의 네이티브 title로 본다(FR-006-AC4와 같은 방식). 가림 판정(③·④)보다
  // 뒤에 둔다 — title이 없다는 실패가 겹침 실패를 가리지 않게 하기 위해서다.
  for (const desk of pairDesks) {
    expect(desk.statusTitle, `${phase} ${desk.name} 상태 줄 title`).toBe(expectedStatus);
  }

  // clamp가 실제로 걸렸다 — 자르지 않은 글자 폭이 칸 폭보다 넓다(넓지 않으면 위 ③·④가 공허해진다).
  for (const desk of pairDesks) {
    expect(
      desk.statusScrollWidth,
      `${phase} ${desk.name} 상태 줄이 칸 폭을 넘지 않아 clamp 검증이 공허합니다`,
    ).toBeGreaterThan(desk.statusClientWidth);
  }
}

test("[E2E-13][FR-006-AC10][FR-006-AC4][ADR-50 B] 보통 층 이웃 두 칸에 부모 접미 책상을 놓고 상태 줄 clamp를 확인한다", async ({
  page,
}) => {
  // 기준 캡처(01·02·03)와 기존 단언을 모두 끝낸 뒤에만 실행한다(serial 선언 순서) — 이 재생이 남기는
  // live 상태가 캡처 대상 화면을 바꾸지 않게 하기 위해서다. `showcase.jsonl`은 건드리지 않는다.
  const SPAN1_TEAM = "video-team";
  // video-team(4명)의 2·3번째 열 = 양옆에 이웃이 있는 인접 두 열(FR-006-AC1 정렬 기준).
  const PAIR = ["video-02", "video-03"] as const;
  const SHORT_PARENT = "video-lead";
  /** 13자 부모 라벨 — FR-006-AC4 경계(12자 초과)를 넘고 부모 접미는 잘리지 않으므로 가장 긴 상태 줄이다. */
  const LONG_PARENT = "vid-parentxyz";
  expect(LONG_PARENT).toHaveLength(13);
  expect(
    scenarioLines(SPAN1_CLAMP_SCENARIO).length,
    "span1-status-clamp.jsonl 줄 수가 scenarios/README.md 대응표(8줄)와 다릅니다",
  ).toBe(SPAN1_CLAMP_LINE_COUNT);

  const originalVideoTeam = readFixtureFile(teamFile(SPAN1_TEAM));

  try {
    await gotoReady(page, "/workflows");
    // 재생 전에는 span-1 층에 접미가 없다(이 테스트가 만드는 상태임을 고정한다).
    const before = await deskMetrics(page, SPAN1_TEAM);
    expect(before.map((desk) => desk.name)).toEqual(["video-lead", "video-02", "video-03", "video-04"]);
    expect(before.filter((desk) => desk.statusText.includes("· 부모 "))).toEqual([]);

    // ── 1단계: 짧은 부모 라벨(video-lead, 10자) — 1~3줄 재생 ────────────────────────
    expect(replayScenarioLines({ scenarioPath: SPAN1_CLAMP_SCENARIO, from: 1, to: 3 }).sent).toBe(3);
    for (const name of PAIR) {
      await expect(
        spriteBox(page, name).getByText(`작업 중 · 부모 ${SHORT_PARENT}`, { exact: true }),
      ).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
    }
    await assertSpan1SuffixPair({
      page,
      workflowName: SPAN1_TEAM,
      pair: PAIR,
      parentLabel: SHORT_PARENT,
      phase: `부모 ${SHORT_PARENT}(${SHORT_PARENT.length}자)`,
    });

    // ── 2단계: 13자 부모 라벨 — 4~5줄로 1단계 서브를 비우고 6~8줄 재생 ──────────────
    expect(replayScenarioLines({ scenarioPath: SPAN1_CLAMP_SCENARIO, from: 4, to: 5 }).sent).toBe(2);
    for (const name of PAIR) {
      await expect(spriteBox(page, name).getByText("대기", { exact: true })).toBeVisible({
        timeout: SETUP_REFLECT_TIMEOUT_MS,
      });
    }

    // 13자 부모는 같은 층의 정의 있는 에이전트로 만든다(원본 fixture는 건드리지 않는다).
    writeFixtureFile(
      agentFile(LONG_PARENT),
      agentFileContent({
        name: LONG_PARENT,
        description: "T-FIX-12 13자 부모 라벨 실측용",
        body: "측정용.",
      }),
    );
    const videoTeam = JSON.parse(originalVideoTeam) as { members: string[] };
    videoTeam.members = [...videoTeam.members, LONG_PARENT].sort();
    writeFixtureFile(teamFile(SPAN1_TEAM), `${JSON.stringify(videoTeam, null, 2)}\n`);
    await expect(spriteSvg(page, LONG_PARENT)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });

    expect(replayScenarioLines({ scenarioPath: SPAN1_CLAMP_SCENARIO, from: 6, to: 8 }).sent).toBe(3);
    for (const name of PAIR) {
      await expect(
        spriteBox(page, name).getByText(`작업 중 · 부모 ${LONG_PARENT}`, { exact: true }),
      ).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
    }

    // 5명이 되어 첫 줄은 `video-lead · vid-parentxyz · video-02 · video-03`, 둘째 줄은 `video-04`다
    // → 측정 대상 두 책상은 여전히 첫 줄의 인접 열이다(열 수는 그대로 4열).
    const widened = await deskMetrics(page, SPAN1_TEAM);
    expect(widened.map((desk) => desk.name)).toEqual([
      "video-lead",
      LONG_PARENT,
      "video-02",
      "video-03",
      "video-04",
    ]);
    await assertSpan1SuffixPair({
      page,
      workflowName: SPAN1_TEAM,
      pair: PAIR,
      parentLabel: LONG_PARENT,
      phase: `부모 ${LONG_PARENT}(${LONG_PARENT.length}자)`,
    });
  } finally {
    writeFixtureFile(teamFile(SPAN1_TEAM), originalVideoTeam);
    removeFixturePath(agentFile(LONG_PARENT));
  }

  // fixture가 원래대로 돌아왔는지 화면으로 확인한다(live 상태는 이 배치의 마지막 테스트라 남겨 둔다).
  await gotoReady(page, "/workflows");
  await expect(floorCardByName(page, SPAN1_TEAM).getByText("4명", { exact: true })).toBeVisible({
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });
});
