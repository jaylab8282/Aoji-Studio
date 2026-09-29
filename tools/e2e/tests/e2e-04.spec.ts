// E2E-04 이벤트 재생 `states.jsonl` (architecture.md §8.2 E2E-04 행).
// fixture: `project-configured` (에이전트 5·스킬 1, 워크플로우 dev-team·ops-team, `freelancer`는 워크플로우 밖).
// 검증 ID: FR-004-AC1~AC7·E1, FR-003-AC4·AC5·AC10·E2, FR-005-AC1~AC3·AC6~AC8, FR-006-AC5·AC9,
//          FR-007-AC2·AC3·AC5·AC6·AC9·E1, FR-015-AC1·AC2.
//
// 시나리오 줄 ↔ 검증 항목 대응은 `tools/replay/scenarios/README.md`(28줄 대응표)가 근거다. 이 spec은
// 그 표의 순서대로 **한 줄씩** 재생하고, 줄마다 화면에 나타나는 변화를 단언한다. 한 줄씩 나눠 재생하는
// 이유: 전이표 12행 중 여러 행(정의 있는/없는 서브에이전트, `SubagentStop`, `SessionEnd`)은 뒤 줄에서
// 다시 제거되므로 전체 재생이 끝난 상태만 보면 확인할 수 없다.
//
// 전제(배치): 이 spec은 **이벤트 0건인 새 컨테이너**에서 시작해야 한다(`[세션 N]` 번호가 재생 순서대로
// 1부터 붙고, 01 실시간 이벤트 수가 재생 줄 수와 같아야 한다). `scripts/run-e2e.sh`가 E2E-04를 자기
// 배치의 맨 앞에 두어 그 조건을 보장한다(globalTeardown의 `compose down -v`로 DB 볼륨도 새로 만든다).
//
// 목킹 없음: 실제 컨테이너·실제 수집 경로(`tools/replay/replay.mjs`)·실제 fixture 파일 변경만 쓴다
// (conventions.md §8). `page.route` 가로채기 없음.
import { execFileSync } from "node:child_process";

import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import { COMPOSE_SERVICE, E2E_DIR, composeEnv, readE2eState } from "../lib/e2e-state";
import { replayScenarioLines, scenarioLines } from "../lib/replay";
import {
  PIXEL_FILL,
  SETUP_REFLECT_TIMEOUT_MS,
  fixturePath,
  gotoReady,
  measureFileChangeReflection,
  panelRowValue,
  readFixtureFile,
  spriteBox,
  spriteScreenFill,
  spriteShirtFill,
  spriteSvg,
  writeFixtureFile,
} from "./ui-helpers";

/** `tools/replay/scenarios/README.md`가 설명하는 줄 수. 시나리오가 바뀌면 이 spec의 단언 근거가 깨진다. */
const SCENARIO_LINE_COUNT = 28;

/** FR-004-AC6 "상태가 바뀌면 새로고침 없이 2초 이내에 01·02·03에 반영된다". */
const STATE_REFLECT_DEADLINE_MS = 2000;

/**
 * `frontend/src/components/pixel/palette.ts`의 고정 팔레트 값(pixel-sprites.md 공통 색) 중
 * `PIXEL_FILL`(ui-helpers)에 없는 두 값. `waiting`은 ui-spec §공통 토큰 `state/waiting`과 같고,
 * `sub`는 작은 캐릭터(서브에이전트) 셔츠 색이다.
 */
const SHIRT_WAITING_FILL = "#FF9A4D";
const SUB_SHIRT_FILL = "#7FB8A0";

const DEV_TEAM = "dev-team";
const OPS_TEAM = "ops-team";
const SETTINGS_FILE_SEGMENTS = [".claude", "settings.json"] as const;

/** FR-003-AC9 12종 — 07 `설정 예시 복사`가 만드는 hook 설정과 같은 이벤트 목록(architecture.md §7.1). */
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
 * 수집 주소·토큰이 맞는 hook 설정 JSON(architecture.md §7.1 형태).
 *
 * fixture 원본(`tools/fixtures/project-configured/.claude/settings.json`)의 `url`은 운영 공개 포트
 * 기준이라 E2E 컨테이너의 수집 주소(`<baseUrl>/hooks/events`, ADR-45로 포트가 바뀌었다)와 달라
 * `hookConfigured`가 false가 된다. 이 spec은 "hook 설정됨" 상태를 전제로 04-4를 검증하므로
 * **마운트된 fixture 임시 사본의** settings.json을 수집 주소로 다시 쓴다(원본 fixture는 건드리지 않는다).
 * 주소·토큰은 `.e2e-state.json`에서 가져오므로 literal이 없고, 값이 맞았는지는 화면의 `hook 설정됨`
 * 표시로 단언한다(FR-014-AC3).
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

/** 03 선택 패널(`Panel.tsx`). 사이드바와 구분하기 위해 패널 제목으로 좁힌다. */
function selectionPanel(page: Page): Locator {
  return page.locator("aside").filter({ hasText: "선택한 에이전트" });
}

/** 03 패널 `최근 이벤트` 목록 항목(최신순, 최대 10개. FR-007-AC6). */
function recentEventItems(page: Page): Locator {
  return selectionPanel(page).locator("ul > li");
}

/** 03 오피스 그리드의 캐릭터 SVG(그리드 배치 순서 그대로). */
function officeSprites(page: Page): Locator {
  // `Office.tsx`의 오피스 그리드 컨테이너 class. 칸 순서(FR-007-AC3 "부모 다음 칸") 확인에 쓴다.
  return page.locator(".office-grid svg[role='img']");
}

async function officeSpriteNames(page: Page): Promise<(string | null)[]> {
  return officeSprites(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")),
  );
}

/** 02 로비 카드(`Lobby.tsx`). */
function lobbyCard(page: Page): Locator {
  return page.locator("section").filter({ hasText: "로비 · 메인 세션" });
}

/** 02 층 카드 헤더 요약(FR-006-AC5)·책상을 담은 층 카드. */
function floorCardByName(page: Page, workflowName: string): Locator {
  return page
    .getByRole("heading", { level: 3, name: workflowName, exact: true })
    .locator("xpath=../../..");
}

/** 03 헤더 워크플로우 칩(FR-007-AC9). */
function headerChip(page: Page, label: string): Locator {
  return page.locator("main").first().getByText(label, { exact: true });
}

/** 컨테이너 표준 출력·오류 로그(FR-015-AC2 "서버 로그에도 원문이 없다" 확인용). */
function containerLogs(): string {
  const state = readE2eState();
  return execFileSync("docker", ["compose", "-f", state.composeFile, "logs", COMPOSE_SERVICE], {
    cwd: E2E_DIR,
    env: composeEnv(state.fixtureDir),
    encoding: "utf8",
  });
}

/**
 * 시나리오 한 줄을 재생하고, 그 줄이 만들어야 하는 화면 변화가 기한(FR-004-AC6 2초) 안에 나타나는지
 * 실제 경과 시간을 재서 단언한다. 고정 대기(`waitForTimeout`)는 쓰지 않는다 —
 * 기준 시각은 수집 POST가 2xx로 끝난 시점이고, 대기는 `expect` 폴링뿐이다.
 */
async function replayStep(
  testInfo: TestInfo,
  line: number,
  label: string,
  expectation: (deadlineMs: number) => Promise<void>,
): Promise<number> {
  replayScenarioLines({ from: line, to: line });
  const sentAt = Date.now();
  await expectation(STATE_REFLECT_DEADLINE_MS);
  const elapsedMs = Date.now() - sentAt;
  testInfo.annotations.push({
    type: "FR-004-AC6 반영 시간",
    description: `${line}줄 ${label}: ${elapsedMs}ms (기한 ${STATE_REFLECT_DEADLINE_MS}ms)`,
  });
  expect(
    elapsedMs,
    `${line}줄 ${label} 반영이 ${STATE_REFLECT_DEADLINE_MS}ms를 넘었습니다(${elapsedMs}ms)`,
  ).toBeLessThanOrEqual(STATE_REFLECT_DEADLINE_MS);
  return elapsedMs;
}

// 재생은 누적되므로 앞 단계가 실패하면 뒤 단계의 전제가 깨진다. serial로 두어 원인 하나를 그대로 보고한다.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  writeFixtureFile(settingsFile(), hookSettingsJson());
});

test("[FR-004-AC1][FR-004-AC2][FR-004-AC6][FR-003-AC4][FR-007-AC2][FR-007-AC5][FR-007-AC6][FR-007-AC9][FR-007-E1][E2E-04] states.jsonl 1~10줄 → 03 dev-lead 상태가 FR-004-AC2 전이표대로 바뀐다(각 단계 2초 이내)", async ({
  page,
}, testInfo) => {
  expect(
    scenarioLines().length,
    "states.jsonl 줄 수가 scenarios/README.md 대응표(28줄)와 다릅니다",
  ).toBe(SCENARIO_LINE_COUNT);

  await gotoReady(page, `/workflows/${DEV_TEAM}`);

  // 수집 주소가 맞는 hook 설정이 인식됐다(FR-014-AC3). 이후 04-4 판정은 everReceived만 남는다.
  const sidebar = page.locator("aside").filter({ hasText: "Jay Studio" });
  await expect(sidebar.getByText("hook 설정됨", { exact: true })).toBeVisible({
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });

  // 재생 전: 이벤트를 받은 적 없으므로 04-4 배너 + 모두 `대기`(FR-004-AC1, FR-007-E1).
  const collectorBanner = page.getByRole("status").filter({ hasText: "hook 이벤트 수신 없음" });
  await expect(collectorBanner).toContainText("hook 이벤트 수신 없음 · 마지막 수신 없음");
  await expect(collectorBanner).toContainText(
    "Claude Code 미실행 또는 컨테이너 재시작 · 캐릭터는 모두 회색 대기",
  );
  await expect(page.getByRole("heading", { level: 3, name: "dev-lead", exact: true })).toBeVisible();
  await expect(panelRowValue(page, "상태")).toHaveText("대기");
  await expect(panelRowValue(page, "현재 도구")).toHaveText("-");
  await expect(panelRowValue(page, "세션 시작")).toHaveText("-");
  await expect(selectionPanel(page).getByText("최근 이벤트 없음", { exact: true })).toBeVisible();
  await expect(headerChip(page, "모두 대기")).toBeVisible();
  await expect(page.locator("main").first().getByText("에이전트 2 · 스킬 1", { exact: true })).toBeVisible();

  // 1줄 SessionStart → 대기. 이벤트를 받았으므로 04-4 배너가 사라지는 것이 관찰 가능한 변화다.
  await replayStep(testInfo, 1, "SessionStart → 대기", async (deadlineMs) => {
    await expect(collectorBanner).toHaveCount(0, { timeout: deadlineMs });
  });
  await expect(panelRowValue(page, "상태")).toHaveText("대기");
  await expect(panelRowValue(page, "현재 도구")).toHaveText("-");
  // FR-007-AC5: 세션 시작 = 가장 최근 SessionStart 시각(hh:mm:ss), 작업 폴더 = 마지막 이벤트의 cwd.
  await expect(panelRowValue(page, "세션 시작")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(panelRowValue(page, "서브에이전트")).toHaveText("0");
  // 재생 시나리오의 `cwd`는 컨테이너 경로(`/workspace`)이고 `hostPath`(fixture 임시 폴더) 접두가 아니므로
  // 그대로 보인다(ui-spec.md SCR-03 패널 `작업 폴더` 행).
  await expect(panelRowValue(page, "작업 폴더")).toHaveText("/workspace");
  await expect(recentEventItems(page).first()).toContainText("세션 시작");
  await expect(spriteBox(page, "dev-lead").getByText("대기", { exact: true })).toHaveCount(2);

  // 2줄 PreToolUse(Edit) → 작업 중 + 말풍선 `타이핑 · Edit`(FR-007-AC2).
  await replayStep(testInfo, 2, "PreToolUse(Edit) → 작업 중", async (deadlineMs) => {
    await expect(spriteBox(page, "dev-lead").getByText("타이핑 · Edit", { exact: true })).toBeVisible({
      timeout: deadlineMs,
    });
  });
  await expect(panelRowValue(page, "상태")).toHaveText("작업 중");
  await expect(panelRowValue(page, "현재 도구")).toHaveText("Edit · .claude/agents/dev-lead.md");
  await expect(spriteBox(page, "dev-lead").getByText("작업 중", { exact: true })).toBeVisible();
  expect(await spriteShirtFill(page, "dev-lead")).toBe(PIXEL_FILL.shirtRunning);
  await expect(recentEventItems(page).first()).toContainText("도구 실행 · Edit");
  await expect(headerChip(page, "실행 중 1명")).toBeVisible();

  // 3·4·5줄 PostToolUse / PostToolUseFailure / PermissionDenied → 모두 작업 중(전이표 9행).
  // 상태가 이미 작업 중이므로 "그 이벤트가 처리됐다"는 증거는 패널 `최근 이벤트` 맨 앞 줄이다.
  const runningRows: [number, string, string][] = [
    [3, "PostToolUse → 작업 중", "도구 완료 · Edit"],
    [4, "PostToolUseFailure → 작업 중", "도구 실패 · Edit"],
    [5, "PermissionDenied → 작업 중", "권한 거부 · Edit"],
  ];
  for (const [line, label, title] of runningRows) {
    await replayStep(testInfo, line, label, async (deadlineMs) => {
      await expect(recentEventItems(page).first()).toContainText(title, { timeout: deadlineMs });
    });
    await expect(panelRowValue(page, "상태")).toHaveText("작업 중");
  }

  // 6줄 PreToolUse(AskUserQuestion) → 권한·입력 대기 + 주황 말풍선 `권한 요청`.
  await replayStep(testInfo, 6, "PreToolUse(AskUserQuestion) → 권한·입력 대기", async (deadlineMs) => {
    await expect(panelRowValue(page, "상태")).toHaveText("권한·입력 대기", { timeout: deadlineMs });
  });
  await expect(panelRowValue(page, "현재 도구")).toHaveText("AskUserQuestion · 이 방향으로 진행할까요?");
  await expect(spriteBox(page, "dev-lead").getByText("권한 요청", { exact: true })).toBeVisible();
  await expect(spriteBox(page, "dev-lead").getByText("권한 대기", { exact: true })).toBeVisible();
  expect(await spriteShirtFill(page, "dev-lead")).toBe(SHIRT_WAITING_FILL);
  await expect(headerChip(page, "권한 대기 1명")).toBeVisible();

  // 7·8줄 PermissionRequest / Notification(permission_prompt) → 권한·입력 대기 유지(전이표 6·7행).
  // 9줄 Notification(그 외) → 상태 변경 없음(전이표 8행): 이벤트는 처리되지만 상태는 그대로다.
  const waitingRows: [number, string, string][] = [
    [7, "PermissionRequest → 권한·입력 대기", "권한 요청 · Bash"],
    [8, "Notification(permission_prompt) → 권한·입력 대기", "알림 · permission_prompt"],
    [9, "Notification(그 외) → 상태 변경 없음", "알림 · idle_timeout"],
  ];
  for (const [line, label, title] of waitingRows) {
    await replayStep(testInfo, line, label, async (deadlineMs) => {
      await expect(recentEventItems(page).first()).toContainText(title, { timeout: deadlineMs });
    });
    await expect(panelRowValue(page, "상태")).toHaveText("권한·입력 대기");
  }

  // 10줄 Stop → 대기(세션은 유지되므로 세션 시작 값은 남는다).
  await replayStep(testInfo, 10, "Stop → 대기(세션 유지)", async (deadlineMs) => {
    await expect(panelRowValue(page, "상태")).toHaveText("대기", { timeout: deadlineMs });
  });
  await expect(panelRowValue(page, "현재 도구")).toHaveText("-");
  await expect(panelRowValue(page, "세션 시작")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(spriteBox(page, "dev-lead").getByText("대기", { exact: true })).toHaveCount(2);
  expect(await spriteShirtFill(page, "dev-lead")).toBe(PIXEL_FILL.shirtIdle);
  expect(await spriteScreenFill(page, "dev-lead")).toBe(PIXEL_FILL.screenIdle);
  await expect(recentEventItems(page).first()).toContainText("응답 종료");
  await expect(headerChip(page, "모두 대기")).toBeVisible();

  // FR-007-AC6: 최근 이벤트는 최신순 10개까지만 보인다(dev-lead 이벤트가 10건 쌓였다).
  await expect(recentEventItems(page)).toHaveCount(10);
});

test("[FR-004-AC2][FR-004-AC4][FR-004-AC6][FR-007-AC3][FR-007-AC5][E2E-04] states.jsonl 11~14줄 → 정의 있는 서브에이전트 `· 부모`, 정의 없는 서브에이전트 작은 캐릭터, SubagentStop·SessionEnd 제거", async ({
  page,
}, testInfo) => {
  await gotoReady(page, `/workflows/${DEV_TEAM}`);
  await expect(page.getByRole("heading", { level: 3, name: "dev-lead", exact: true })).toBeVisible();
  expect(await officeSpriteNames(page)).toEqual(["dev-lead", "dev-member"]);

  // 11줄 SubagentStart(agent_type=dev-member, 정의 있음) → 그 에이전트 캐릭터가 작업 중 + `· 부모 dev-lead`
  // (FR-004-AC4: agent_type이 정상 정의 파일이면 그 에이전트의 세션으로 합친다).
  await replayStep(testInfo, 11, "SubagentStart(정의 있음) → 작업 중 · 부모", async (deadlineMs) => {
    await expect(
      spriteBox(page, "dev-member").getByText("작업 중 · 부모 dev-lead", { exact: true }),
    ).toBeVisible({ timeout: deadlineMs });
  });
  expect(await spriteShirtFill(page, "dev-member")).toBe(PIXEL_FILL.shirtRunning);
  // 말풍선: running + 도구 없음 → `작업 중`(FR-007-AC2).
  await expect(spriteBox(page, "dev-member").getByText("작업 중", { exact: true })).toBeVisible();
  // 부모(dev-lead)의 패널 `서브에이전트` = 실행 중인 자식 수(FR-007-AC5).
  await expect(panelRowValue(page, "서브에이전트")).toHaveText("1");

  // 12줄 SubagentStart(agent_type=Explore, 정의 없음) → 부모 칸 바로 다음 칸에 작은 캐릭터(FR-007-AC3).
  await replayStep(testInfo, 12, "SubagentStart(정의 없음) → 작은 캐릭터", async (deadlineMs) => {
    await expect(spriteSvg(page, "Explore")).toBeVisible({ timeout: deadlineMs });
  });
  await expect(
    spriteBox(page, "Explore").getByText("작업 중 · 부모 dev-lead", { exact: true }),
  ).toBeVisible();
  expect(await spriteShirtFill(page, "Explore")).toBe(SUB_SHIRT_FILL);
  expect(await officeSpriteNames(page)).toEqual(["dev-lead", "Explore", "dev-member"]);
  await expect(panelRowValue(page, "서브에이전트")).toHaveText("2");

  // 13줄 SubagentStop → 그 서브에이전트 세션 제거 → dev-member는 다시 대기(부모 접미 없음).
  await replayStep(testInfo, 13, "SubagentStop → 제거", async (deadlineMs) => {
    await expect(spriteBox(page, "dev-member").getByText("대기", { exact: true })).toHaveCount(2, {
      timeout: deadlineMs,
    });
  });
  expect(await spriteShirtFill(page, "dev-member")).toBe(PIXEL_FILL.shirtIdle);
  await expect(panelRowValue(page, "서브에이전트")).toHaveText("1");

  // 14줄 SessionEnd → 같은 session_id의 서브 레코드(Explore)까지 함께 제거 + dev-lead 세션도 사라진다.
  await replayStep(testInfo, 14, "SessionEnd → 제거", async (deadlineMs) => {
    await expect(spriteSvg(page, "Explore")).toHaveCount(0, { timeout: deadlineMs });
  });
  expect(await officeSpriteNames(page)).toEqual(["dev-lead", "dev-member"]);
  await expect(panelRowValue(page, "상태")).toHaveText("대기");
  await expect(panelRowValue(page, "세션 시작")).toHaveText("-");
  await expect(panelRowValue(page, "서브에이전트")).toHaveText("0");
  await expect(panelRowValue(page, "작업 폴더")).toHaveText("-");
  // 마지막 줄의 남는 칸은 점선 `빈 자리`다(FR-007-AC1).
  await expect(page.locator(".office-grid").getByText("빈 자리", { exact: true })).toHaveCount(1);
});

test("[FR-004-AC3][FR-004-AC6][FR-007-AC2][FR-007-AC3][FR-006-AC5][E2E-04] states.jsonl 15~17줄 → 한 에이전트가 두 세션이면 `권한·입력 대기`가 `작업 중`보다 우선한다", async ({
  page,
}, testInfo) => {
  await gotoReady(page, `/workflows/${DEV_TEAM}?agent=dev-member`);
  await expect(page.getByRole("heading", { level: 3, name: "dev-member", exact: true })).toBeVisible();

  // 15줄 세션 A의 SubagentStart → 작업 중(부모는 SessionStart가 없던 세션이라 로비 세션 `[세션 1]`).
  await replayStep(testInfo, 15, "세션 A SubagentStart → 작업 중", async (deadlineMs) => {
    await expect(
      spriteBox(page, "dev-member").getByText("작업 중 · 부모 [세션 1]", { exact: true }),
    ).toBeVisible({ timeout: deadlineMs });
  });
  await expect(panelRowValue(page, "상태")).toHaveText("작업 중");

  // 16줄 세션 B의 SubagentStart → 둘 다 작업 중(동률이면 최신 세션을 보여준다).
  await replayStep(testInfo, 16, "세션 B SubagentStart → 작업 중", async (deadlineMs) => {
    await expect(
      spriteBox(page, "dev-member").getByText("작업 중 · 부모 [세션 2]", { exact: true }),
    ).toBeVisible({ timeout: deadlineMs });
  });

  // 17줄 세션 B만 AskUserQuestion → 집계는 권한·입력 대기(FR-004-AC3 최우선).
  await replayStep(testInfo, 17, "세션 B AskUserQuestion → 권한·입력 대기 우선", async (deadlineMs) => {
    await expect(panelRowValue(page, "상태")).toHaveText("권한·입력 대기", { timeout: deadlineMs });
  });
  await expect(panelRowValue(page, "현재 도구")).toHaveText("AskUserQuestion · 승인할까요?");
  await expect(spriteBox(page, "dev-member").getByText("권한 요청", { exact: true })).toBeVisible();
  await expect(
    spriteBox(page, "dev-member").getByText("권한 대기 · 부모 [세션 2]", { exact: true }),
  ).toBeVisible();
  await expect(headerChip(page, "권한 대기 1명")).toBeVisible();

  // 02에도 같은 집계가 보인다: 층 헤더 요약(FR-006-AC5)과 책상 상태 글자.
  await gotoReady(page, "/workflows");
  const devFloor = floorCardByName(page, DEV_TEAM);
  await expect(devFloor.getByText("권한 대기 1명", { exact: true })).toBeVisible();
  await expect(
    spriteBox(page, "dev-member").getByText("권한 대기 · 부모 [세션 2]", { exact: true }),
  ).toBeVisible();
  await expect(spriteBox(page, "dev-lead").getByText("대기", { exact: true })).toBeVisible();
});

test("[FR-004-AC3][FR-004-AC6][FR-007-AC3][FR-006-AC5][E2E-04] states.jsonl 18~20줄 → 두 세션 중 하나가 Stop이면 `작업 중`이 `대기`보다 우선한다", async ({
  page,
}, testInfo) => {
  await gotoReady(page, `/workflows/${OPS_TEAM}?agent=ops-lead`);
  await expect(page.getByRole("heading", { level: 3, name: "ops-lead", exact: true })).toBeVisible();

  await replayStep(testInfo, 18, "세션 A SubagentStart → 작업 중", async (deadlineMs) => {
    await expect(
      spriteBox(page, "ops-lead").getByText("작업 중 · 부모 [세션 3]", { exact: true }),
    ).toBeVisible({ timeout: deadlineMs });
  });
  await expect(panelRowValue(page, "상태")).toHaveText("작업 중");

  await replayStep(testInfo, 19, "세션 B SubagentStart → 작업 중", async (deadlineMs) => {
    await expect(
      spriteBox(page, "ops-lead").getByText("작업 중 · 부모 [세션 4]", { exact: true }),
    ).toBeVisible({ timeout: deadlineMs });
  });

  // 20줄 세션 B만 Stop → 세션 B는 대기, 표시는 여전히 작업 중이고 보여주는 세션이 A로 돌아간다.
  await replayStep(testInfo, 20, "세션 B Stop → 작업 중 우선", async (deadlineMs) => {
    await expect(
      spriteBox(page, "ops-lead").getByText("작업 중 · 부모 [세션 3]", { exact: true }),
    ).toBeVisible({ timeout: deadlineMs });
  });
  await expect(panelRowValue(page, "상태")).toHaveText("작업 중");
  await expect(recentEventItems(page).first()).toContainText("응답 종료");

  await gotoReady(page, "/workflows");
  await expect(floorCardByName(page, OPS_TEAM).getByText("실행 중 1명", { exact: true })).toBeVisible();
});

test("[FR-003-AC5][FR-006-AC9][FR-004-AC6][FR-004-E1][E2E-04] states.jsonl 21~24줄 → 02 로비에 메인 세션이 `[세션 N] · 상태`로 나타난다", async ({
  page,
}, testInfo) => {
  await gotoReady(page, "/workflows");
  const lobby = lobbyCard(page);
  await expect(lobby).toContainText("에이전트 지정 없이 실행 중인 Claude Code 세션");

  // 15~19줄의 서브에이전트 이벤트는 SessionStart 없이 왔으므로 부모 세션이 그 이벤트로 새로 만들어졌고
  // (FR-004-E1), agent_type이 없는 세션이라 로비 항목이 된다(FR-003-AC5). 번호는 만들어진 순서대로다.
  for (const label of ["[세션 1]", "[세션 2]", "[세션 3]", "[세션 4]"]) {
    await expect(lobby.getByText(`${label} · 대기`, { exact: true })).toBeVisible();
  }

  await replayStep(testInfo, 21, "SessionStart(agent_type 없음) → [세션 5] 대기", async (deadlineMs) => {
    await expect(lobby.getByText("[세션 5] · 대기", { exact: true })).toBeVisible({
      timeout: deadlineMs,
    });
  });

  await replayStep(testInfo, 22, "UserPromptSubmit → [세션 5] 작업 중", async (deadlineMs) => {
    await expect(lobby.getByText("[세션 5] · 작업 중", { exact: true })).toBeVisible({
      timeout: deadlineMs,
    });
  });

  await replayStep(testInfo, 23, "SessionStart(agent_type 없음) → [세션 6] 대기", async (deadlineMs) => {
    await expect(lobby.getByText("[세션 6] · 대기", { exact: true })).toBeVisible({
      timeout: deadlineMs,
    });
  });

  // 로비 waiting은 짧은 표기 `입력 대기`다(ui-spec SCR-02 로비 행, ADR-26).
  await replayStep(testInfo, 24, "PermissionRequest → [세션 6] 입력 대기", async (deadlineMs) => {
    await expect(lobby.getByText("[세션 6] · 입력 대기", { exact: true })).toBeVisible({
      timeout: deadlineMs,
    });
  });
  await expect(lobby.getByText("[세션 5] · 작업 중", { exact: true })).toBeVisible();
  await expect(lobby.getByText("실행 중인 메인 세션 없음", { exact: true })).toHaveCount(0);
});

test("[FR-003-AC4][FR-003-AC10][FR-003-E2][FR-004-AC6][FR-004-AC7][FR-005-AC1][FR-005-AC2][FR-005-AC3][FR-005-AC6][FR-005-AC7][FR-005-AC8][FR-015-AC1][FR-015-AC2][E2E-04] states.jsonl 25~28줄 → 01 KPI·상태 막대·실시간 이벤트·마스킹, 워크플로우 밖 에이전트는 로비에", async ({
  page,
}, testInfo) => {
  await gotoReady(page, "/");
  const home = page.locator("main").first();
  const rows = home.locator("table tbody tr");
  const firstRowCells = rows.first().locator("td");

  // 25줄 정의 없는 서브에이전트(부모가 로비 세션) → 03에는 안 보이지만 이벤트는 저장·표시된다(FR-003-E2).
  // 워크플로우 열은 `-`다(FR-005-AC7).
  await replayStep(testInfo, 25, "SubagentStart(정의 없음, 로비 부모) → 실시간 이벤트", async (deadlineMs) => {
    await expect(firstRowCells.nth(2)).toHaveText("UnknownAgent", { timeout: deadlineMs });
  });
  await expect(firstRowCells.nth(1)).toHaveText("-");
  await expect(firstRowCells.nth(3)).toHaveText("서브에이전트 시작");
  await expect(firstRowCells.nth(4)).toHaveText("UnknownAgent");

  // 26줄 SessionStart(ops-member) → agent_type으로 에이전트를 식별하고(FR-003-AC4) 요약은 cwd다(FR-003-AC10).
  await replayStep(testInfo, 26, "SessionStart(ops-member) → 실시간 이벤트", async (deadlineMs) => {
    await expect(firstRowCells.nth(3)).toHaveText("세션 시작", { timeout: deadlineMs });
  });
  await expect(firstRowCells.nth(1)).toHaveText(OPS_TEAM);
  await expect(firstRowCells.nth(2)).toHaveText("ops-member");
  await expect(firstRowCells.nth(4)).toHaveText("/workspace");
  await expect(firstRowCells.nth(0)).toHaveText(/^\d{2}:\d{2}:\d{2}$/);

  // 27줄 PreToolUse Bash(민감 값 포함) → 요약이 마스킹된 채로만 보인다(FR-015-AC1, FR-005-AC8).
  const maskedSummary =
    "export TOKEN=•••••••• && curl -H 'Authorization: •••••••• ••••••••' https://example.com";
  await replayStep(testInfo, 27, "PreToolUse(Bash, 민감 값) → 마스킹된 요약", async (deadlineMs) => {
    await expect(firstRowCells.nth(4)).toHaveText(maskedSummary, { timeout: deadlineMs });
  });
  await expect(firstRowCells.nth(3)).toHaveText("도구 실행 · Bash");

  // 28줄 SessionStart 없이 온 PreToolUse(freelancer) → 세션을 새로 만들어 작업 중으로 처리하고(FR-004-E1),
  // 워크플로우 밖 에이전트이므로 로비에 `name · 상태`로 표시한다(FR-004-AC7).
  await replayStep(testInfo, 28, "순서 어긋난 PreToolUse(freelancer) → 작업 중", async (deadlineMs) => {
    await expect(firstRowCells.nth(2)).toHaveText("freelancer", { timeout: deadlineMs });
  });
  await expect(firstRowCells.nth(1)).toHaveText("-");
  await expect(firstRowCells.nth(3)).toHaveText("도구 실행 · Grep");
  await expect(firstRowCells.nth(4)).toHaveText("TODO");

  // FR-005-AC1: 실행 중 = ops-lead·ops-member·freelancer 3명, 전체 = 정상 정의 파일 5개, 권한·입력 대기 = dev-member 1명.
  const kpiCard = (title: string) => home.getByText(title, { exact: true }).locator("xpath=..");
  await expect(kpiCard("실행 중 에이전트")).toContainText("3 / 5");
  await expect(kpiCard("실행 중 에이전트")).toContainText("hook 이벤트 기준 · 권한·입력 대기 1");
  await expect(kpiCard("에이전트 수")).toContainText("5");
  await expect(kpiCard("스킬 수")).toContainText("1");
  await expect(kpiCard("수집 상태")).toContainText("hook 설정됨");
  await expect(kpiCard("수집 상태")).toContainText(/마지막 수신 \d{2}:\d{2}:\d{2}/);

  // FR-005-AC2: 상태 막대 세 수의 합 = 정상 정의 파일 수(3 + 1 + 1 = 5).
  await expect(home.getByText("작업 중 3", { exact: true })).toBeVisible();
  await expect(home.getByText("입력·권한 대기 1", { exact: true })).toBeVisible();
  await expect(home.getByText("대기 1", { exact: true })).toBeVisible();

  // FR-005-AC6: 최신순, 재생한 28건 모두(50개 이하).
  await expect(home.getByText(`최근 ${SCENARIO_LINE_COUNT}개 · 전체 로그 화면 없음`, { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(SCENARIO_LINE_COUNT);
  await expect(
    home.getByText("token·key·password 등 기본 패턴은 ••••••••로 가림", { exact: true }),
  ).toBeVisible();

  // FR-005-AC3: 실행 중·권한 대기가 있는 워크플로우 먼저, 그다음 최근 활동 내림차순(ops-team이 27줄로 더 최신).
  // FR-005-AC4: 카드의 스킬 수는 전체 스킬 수와 같다.
  const cards = home.locator('a[href="/workflows"]').filter({ hasText: "워크플로우 보기 →" });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText(OPS_TEAM);
  await expect(cards.nth(0)).toContainText("실행 중 2명");
  await expect(cards.nth(0)).toContainText("에이전트 2 · 스킬 1");
  await expect(cards.nth(0)).toContainText(`최근 활동 · 도구 실행 · Bash · ${maskedSummary}`);
  await expect(cards.nth(1)).toContainText(DEV_TEAM);
  await expect(cards.nth(1)).toContainText("권한 대기 1명");

  // FR-015-AC2: 원문은 화면·API 응답·서버 로그 어디에도 없다.
  const rawSecrets = ["abcd1234efgh5678", "sk-liveSECRETvalue000", "Bearer sk-"];
  const pageText = (await home.textContent()) ?? "";
  const apiBodies = await page.evaluate(async () => {
    const snapshot = await fetch("/api/state");
    const agentEvents = await fetch("/api/agents/ops-member/events?limit=10");
    return `${await snapshot.text()}\n${await agentEvents.text()}`;
  });
  const logs = containerLogs();
  for (const secret of rawSecrets) {
    expect(pageText, `01 화면에 원문 ${secret}이 남았습니다`).not.toContain(secret);
    expect(apiBodies, `API 응답에 원문 ${secret}이 남았습니다`).not.toContain(secret);
    expect(logs, `서버 로그에 원문 ${secret}이 남았습니다`).not.toContain(secret);
  }
  expect(apiBodies, "API 응답에 마스킹된 요약이 없습니다").toContain("export TOKEN=••••••••");

  // FR-004-AC7: 워크플로우 밖 에이전트는 로비에 `name · 상태`로 보이고 어느 층 책상에도 없다.
  await gotoReady(page, "/workflows");
  await expect(lobbyCard(page).getByText("freelancer · 작업 중", { exact: true })).toBeVisible();
  await expect(page.getByText("워크플로우 밖 에이전트 1 · 가져오기", { exact: true })).toBeVisible();
  await expect(spriteSvg(page, "freelancer")).toHaveCount(0);
  await expect(floorCardByName(page, OPS_TEAM).getByText("실행 중 2명", { exact: true })).toBeVisible();
  testInfo.annotations.push({
    type: "E2E-04 재생 합계",
    description: `states.jsonl ${SCENARIO_LINE_COUNT}줄 재생 완료 · 01 실시간 이벤트 ${SCENARIO_LINE_COUNT}건`,
  });
});

test("[FR-004-AC5][E2E-04] 이벤트가 더 오지 않아도 시간 경과만으로 상태가 바뀌지 않는다(`멈춤 의심` 없음)", async ({
  page,
}, testInfo) => {
  // heartbeat(15초 간격, realtime-spec.md §3)를 한 번 기다려 "이벤트 없이 시간이 지났다"를 만든다.
  // 고정 대기가 아니라 실제 heartbeat 메시지를 기다리며, 그 사이 hook 이벤트는 하나도 보내지 않는다.
  test.setTimeout(90_000);

  await gotoReady(page, "/workflows");
  const statusesBefore = await page.evaluate(async () => {
    const snapshot = (await (await fetch("/api/state")).json()) as {
      live: { agents: Record<string, { status: string }> };
    };
    return Object.fromEntries(
      Object.entries(snapshot.live.agents).map(([name, agent]) => [name, agent.status]),
    );
  });
  expect(statusesBefore).toEqual({
    "dev-lead": "idle",
    "dev-member": "waiting",
    "ops-lead": "running",
    "ops-member": "running",
    freelancer: "running",
  });

  const waited = await page.evaluate(async () => {
    const startedAt = Date.now();
    const { token } = (await (await fetch("/api/auth/browser-token")).json()) as { token: string };
    const source = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    try {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        const timer = window.setTimeout(() => rejectPromise(new Error("heartbeat 미수신")), 60_000);
        source.addEventListener(
          "heartbeat",
          () => {
            window.clearTimeout(timer);
            resolvePromise();
          },
          { once: true },
        );
        source.addEventListener("error", () => {
          window.clearTimeout(timer);
          rejectPromise(new Error("SSE 오류"));
        });
      });
    } finally {
      source.close();
    }
    return Date.now() - startedAt;
  });
  testInfo.annotations.push({
    type: "FR-004-AC5 무이벤트 경과",
    description: `heartbeat 1회 수신까지 ${waited}ms 동안 hook 이벤트 0건`,
  });
  expect(waited, "heartbeat를 기다린 시간이 너무 짧습니다").toBeGreaterThan(1000);

  // 시간만 지났으므로 상태는 그대로다(FR-004-AC5: 시간 경과로 만드는 상태는 없다).
  const statusesAfter = await page.evaluate(async () => {
    const snapshot = (await (await fetch("/api/state")).json()) as {
      live: { agents: Record<string, { status: string }> };
    };
    return Object.fromEntries(
      Object.entries(snapshot.live.agents).map(([name, agent]) => [name, agent.status]),
    );
  });
  expect(statusesAfter).toEqual(statusesBefore);
  await expect(spriteBox(page, "ops-member").getByText("작업 중", { exact: true })).toBeVisible();
  await expect(
    spriteBox(page, "dev-member").getByText("권한 대기 · 부모 [세션 2]", { exact: true }),
  ).toBeVisible();
});

test("[FR-007-E1][FR-004-AC6][FR-001-AC3][E2E-04] 후반부 — running 상태에서 fixture settings.json의 hook 항목 제거 → 03 04-4 배너 + 캐릭터·패널 모두 `대기`(02 책상은 `작업 중` 유지) → 복구 → 03 실제 상태 복귀", async ({
  page,
}, testInfo) => {
  const configured = readFixtureFile(settingsFile());
  const runningAgents = ["ops-lead", "ops-member"];
  /**
   * 02 책상의 상태 글자. 02는 04-4 고정 대상이 아니므로 부모 접미(FR-007-AC3)까지 실제 값 그대로다
   * (ops-lead는 18~20줄에서 서브에이전트 세션으로 작업 중이 됐다).
   */
  const deskStatusTexts: [string, string][] = [
    ["ops-lead", "작업 중 · 부모 [세션 3]"],
    ["ops-member", "작업 중"],
  ];

  try {
    await gotoReady(page, `/workflows/${OPS_TEAM}?agent=ops-member`);
    const collectorBanner = page.getByRole("status").filter({ hasText: "hook 이벤트 수신 없음" });

    // 시작 상태: 배너 없음, 두 캐릭터 모두 작업 중.
    // 측정 대상이 아닌 준비 상태 확인이므로 기본값(5000)에 숨기지 않고 기한을 명시한다(ADR-50 A).
    await expect(collectorBanner).toHaveCount(0, { timeout: SETUP_REFLECT_TIMEOUT_MS });
    await expect(panelRowValue(page, "상태")).toHaveText("작업 중");
    await expect(spriteBox(page, "ops-member").getByText("Bash", { exact: true })).toBeVisible();
    for (const name of runningAgents) {
      expect(await spriteShirtFill(page, name), `${name} 셔츠 색`).toBe(PIXEL_FILL.shirtRunning);
    }

    // hook 항목 제거 → 04-4 조건(`!registry.hookConfigured`)이 되고 2초 이내에 배너가 뜬다.
    await measureFileChangeReflection(
      testInfo,
      "settings.json hook 제거 → 03 04-4 배너",
      () => writeFixtureFile(settingsFile(), "{}\n"),
      () => collectorBanner.isVisible(),
    );
    // 측정 뒤 상태 확인(예산 밖): 반영된 화면이 실제로 그 상태인지 web-first 단언으로 다시 본다.
    await expect(collectorBanner).toBeVisible();
    // 배너 첫 줄 = `hook 이벤트 수신 없음 · 마지막 수신 <yyyy-mm-dd hh:mm>`(ui-spec.md SCR-04-4).
    // 이번에는 수신 이력이 있으므로 `없음`이 아니라 시각이 들어간다.
    await expect(collectorBanner.locator("p").first()).toHaveText(
      /^hook 이벤트 수신 없음 · 마지막 수신 \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
    await expect(collectorBanner).toContainText(
      "Claude Code 미실행 또는 컨테이너 재시작 · 캐릭터는 모두 회색 대기",
    );

    // 고정 대상(ADR-17): 캐릭터 셔츠·모니터 색, 말풍선, 상태 글자(부모 접미 없음), 패널 `상태`·`현재 도구`.
    for (const name of runningAgents) {
      expect(await spriteShirtFill(page, name), `${name} 셔츠 색`).toBe(PIXEL_FILL.shirtIdle);
      expect(await spriteScreenFill(page, name), `${name} 모니터 색`).toBe(PIXEL_FILL.screenIdle);
      // 측정 대상이 아닌 사후 상태 확인이므로 기본값(5000)에 숨기지 않고 기한을 명시한다(ADR-50 A).
      await expect(spriteBox(page, name).getByText("대기", { exact: true })).toHaveCount(2, {
        timeout: SETUP_REFLECT_TIMEOUT_MS,
      });
    }
    await expect(panelRowValue(page, "상태")).toHaveText("대기");
    await expect(panelRowValue(page, "현재 도구")).toHaveText("-");
    // 고정 대상이 아닌 것(ADR-27): 헤더 칩·패널 세션 시작·작업 폴더·버튼 비활성 판정은 실제 live 값이다.
    await expect(headerChip(page, "실행 중 2명")).toBeVisible();
    await expect(panelRowValue(page, "세션 시작")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(panelRowValue(page, "작업 폴더")).toHaveText("/workspace");
    await expect(page.getByRole("button", { name: "정의 수정", exact: true })).toBeDisabled();
    await expect(page.getByText("작업 중에는 수정할 수 없습니다", { exact: true })).toBeVisible();

    // 02는 고정 대상이 아니다: 책상은 그대로 `작업 중`이고 층 요약도 실제 집계다.
    await gotoReady(page, "/workflows");
    for (const [name, statusText] of deskStatusTexts) {
      await expect(spriteBox(page, name).getByText(statusText, { exact: true })).toBeVisible();
      expect(await spriteShirtFill(page, name), `02 ${name} 셔츠 색`).toBe(PIXEL_FILL.shirtRunning);
    }
    await expect(floorCardByName(page, OPS_TEAM).getByText("실행 중 2명", { exact: true })).toBeVisible();
    const sidebar = page.locator("aside").filter({ hasText: "Jay Studio" });
    await expect(sidebar.getByText("hook 설정 안 됨", { exact: true })).toBeVisible();

    // 복구 = "03 실제 상태 복귀": 새 이벤트 없이 같은 스냅샷에서 배너가 사라지고 실제 상태가 다시 보인다.
    await gotoReady(page, `/workflows/${OPS_TEAM}?agent=ops-member`);
    await expect(collectorBanner).toBeVisible();
    await measureFileChangeReflection(
      testInfo,
      "settings.json hook 복구 → 03 04-4 배너 사라짐",
      () => writeFixtureFile(settingsFile(), configured),
      async () => (await collectorBanner.count()) === 0,
    );
    // 측정 뒤 상태 확인(예산 밖).
    await expect(collectorBanner).toHaveCount(0);
    expect(readFixtureFile(settingsFile()), "fixture settings.json이 복구되지 않았습니다").toBe(
      configured,
    );
    await expect(panelRowValue(page, "상태")).toHaveText("작업 중");
    await expect(panelRowValue(page, "현재 도구")).toHaveText(
      "Bash · export TOKEN=•••••••• && curl -H 'Authorization: •••••••• ••••••••' https://example.com",
    );
    for (const name of runningAgents) {
      expect(await spriteShirtFill(page, name), `${name} 셔츠 색`).toBe(PIXEL_FILL.shirtRunning);
    }
    await expect(spriteBox(page, "ops-member").getByText("Bash", { exact: true })).toBeVisible();
    await expect(
      spriteBox(page, "ops-lead").getByText("작업 중 · 부모 [세션 3]", { exact: true }),
    ).toBeVisible();
  } finally {
    // 위에서 실패해 복구 단계까지 가지 못했어도 fixture를 hook 설정됨 상태로 되돌린다
    // (내용이 이미 같으면 아무것도 바뀌지 않는다).
    writeFixtureFile(settingsFile(), configured);
  }
});
