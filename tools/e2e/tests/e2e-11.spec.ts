// E2E-11 07 설정 (architecture.md §8.2 E2E-11 행).
// fixture: `project-configured`.
// 검증 ID: FR-014-AC1~AC7, FR-013-AC5, FR-027-E1 (+ `테스트로 열기`의 동작 경로 FR-013-AC10).
// v1.2.0(T-R4-19): 07 카드 5개(프로젝트 폴더·수집·전역 Claude 설정 연결 / Claude 열기·상태줄 연동). `설정 예시 복사`가
// 수집 카드와 상태줄 연동 카드에 둘이므로 복사 버튼은 카드(`aria-label` region)로 좁혀 찾는다.
//
// 확인하는 것
//  1. 07 카드 3개의 값 행이 모두 실제 값을 보여준다. 마운트 폴더는 컨테이너 경로가 아니라 맥북 경로다
//     (FR-014-AC4). 기본 세션·팀장으로 열기 두 명령이 07에 있다(FR-013-AC5).
//  2. 07을 쓰는 동안 웹이 `.claude/settings.json`을 쓰지 않는다(FR-014-AC1).
//  3. `명령 복사`는 기본 세션 명령을 복사하고, 팀장 명령 복사 버튼은 07에 없다(FR-014-AC5).
//  4. `설정 예시 복사`로 얻은 JSON을 **손으로 고치지 않고 그대로** fixture `.claude/settings.json`에 쓰면
//     `hook 설정` 행이 `설정됨`으로 바뀌고(FR-014-AC3) 그 값으로 실제 이벤트가 수집된다(FR-014-AC2).
//     같은 JSON의 스키마(12개 이벤트 · `type`·`url`·`headers`·`timeout`)도 함께 검증한다(FR-014-AC2 후단).
//  5. `테스트로 열기`가 dry-run 도우미로 기본 세션 명령을 보낸다.
//
// fixture 원본의 `.claude/settings.json`은 운영 포트(`4180`)와 placeholder 수집 토큰을 하드코딩하고 있어
// E2E 컨테이너(ADR-45의 `4185` + 하네스 수집 토큰)에서는 `hook 설정 안 됨`이다. 이것이 fixture의 성질이고
// 제품 결함이 아니다(D-052). E2E-11은 그 상태에서 시작해 **07이 주는 예시가 실제로 동작하는 값인지**를
// 확인한다 — 그래서 예시 JSON을 고쳐 쓰지 않고 클립보드 값을 그대로 파일에 넣는다.
//
// 목킹 없음(conventions.md §8): 실제 컨테이너·실제 도우미·실제 파일만 쓴다. `page.route` 가로채기 없음.
// 주소·포트 literal 없음 — 모두 `.e2e-state.json`(`readE2eState()`)에서 읽는다.
// 파일 조작은 `state.fixtureDir` 아래에서만 한다.
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { helperDryRunLines, readE2eState } from "../lib/e2e-state";
import { expectRegionsVisible, expectSettingsLayout, SCREENSHOT_DIR, settle, sizeLabel } from "./screen-helpers";
import {
  SETUP_REFLECT_TIMEOUT_MS,
  fixturePath,
  helperInstalledPattern,
  gotoReady,
  listFixtureDir,
  measureFileChangeReflection,
  readFixtureFile,
  writeFixtureFile,
} from "./ui-helpers";

/** FR-003-AC9 12종. 07 `설정 예시 복사`가 등록해야 하는 이벤트와 순서(architecture.md §7.1). */
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

const COLLECT_TOKEN_HEADER = "X-AojiStudio-Collect-Token";

/** `설정 예시 복사`가 주는 JSON 구조(architecture.md §7.1, `HookSettingsExampleBuilder`). */
type HookSettingsExample = {
  hooks: Record<string, HookEntry[] | undefined>;
};
type HookEntry = { hooks: HookDefinition[] };
type HookDefinition = {
  type: string;
  url: string;
  headers: Record<string, string>;
  timeout: number;
};

/** 이벤트 하나에 등록된 항목이 정확히 하나인지 확인하고 그 하나를 돌려준다. */
function onlyHookEntry(example: HookSettingsExample, eventName: string): HookEntry {
  const entries = example.hooks[eventName] ?? [];
  expect(entries, `${eventName} 항목이 하나가 아닙니다`).toHaveLength(1);
  const [entry] = entries;
  if (entry === undefined) {
    throw new Error(`${eventName} 항목이 없습니다`);
  }
  return entry;
}

/** 항목 안의 hook이 정확히 하나인지 확인하고 그 하나를 돌려준다. */
function onlyHook(entry: HookEntry, eventName: string): HookDefinition {
  expect(entry.hooks, `${eventName} hook이 하나가 아닙니다`).toHaveLength(1);
  const [hook] = entry.hooks;
  if (hook === undefined) {
    throw new Error(`${eventName} hook이 없습니다`);
  }
  return hook;
}

// ui-spec.md SCR-07 / §공통 확정 문구.
const SETTINGS_TITLE = "설정";
const COPY_COMMAND_LABEL = "명령 복사";
const COPY_HOOK_EXAMPLE_LABEL = "설정 예시 복사";
const COPIED_LABEL = "복사됨";
const TEST_OPEN_LABEL = "테스트로 열기";
const RESCAN_LABEL = "다시 읽기";
const LEAD_SESSION_HINT = "도우미가 받는 값은 팀장 name 하나 · 소문자·숫자·하이픈만 허용";
const CAPTURE_SIZE = { width: 1920, height: 1080 } as const;
const HOOK_CONFIGURED_TEXT = "있음";
const HOOK_MISSING_TEXT = "없음";
const SIDEBAR_HOOK_CONFIGURED_TEXT = "hook 설정됨";
const SIDEBAR_HOOK_NOT_CONFIGURED_TEXT = "hook 설정 안 됨";

// `설정 예시 복사` → 파일 쓰기 → 화면 갱신이 한 줄로 이어진다. 실행 순서를 고정한다.
test.describe.configure({ mode: "serial" });

function settingsFile(): string {
  return fixturePath(".claude", "settings.json");
}

/** 사이드바(`Sidebar`) — `CollectorStatus`의 hook 설정 표시를 읽는다. */
function sidebar(page: Page) {
  return page.getByRole("complementary", { name: "주 메뉴" });
}

/** 카드(`<section aria-label="…">` = role region). 같은 이름의 버튼이 카드마다 있어 카드로 좁힌다. */
function card(page: Page, name: string): Locator {
  return page.getByRole("region", { name, exact: true });
}

/** 카드 안 값 표(`<dl>`)의 `dt` 라벨 바로 뒤 `dd`. */
function rowValue(scope: Locator, label: string): Locator {
  return scope
    .locator("dt")
    .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) })
    .locator("xpath=following-sibling::dd[1]");
}

/** fixture의 정의 파일 수(서버 `agentCount`와 같아야 한다). */
function fixtureAgentCount(): number {
  return listFixtureDir(fixturePath(".claude", "agents")).filter((name) => name.endsWith(".md"))
    .length;
}

/** fixture의 스킬 수(`ProjectFolderScanner.scanSkills`와 같은 규칙: `SKILL.md`를 가진 하위 폴더). */
function fixtureSkillCount(): number {
  return listFixtureDir(fixturePath(".claude", "skills")).filter((name) =>
    listFixtureDir(fixturePath(".claude", "skills", name)).includes("SKILL.md"),
  ).length;
}

/** 클립보드를 읽으려면 권한이 필요하다(`navigator.clipboard.readText`). */
async function grantClipboard(page: Page): Promise<void> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
}

/**
 * 버튼을 누르고 `복사됨` 표시를 확인한 뒤 클립보드 값을 그대로 돌려준다.
 * ui-spec §공통 `CopyButton`은 복사에 성공했을 때만 라벨을 `복사됨`으로 바꾸므로(실패 시 그대로),
 * "원래 라벨로 더는 잡히지 않는다"가 복사 성공의 관찰 가능한 신호다. 복사 버튼이 화면에 둘 있어
 * `복사됨` 이름으로 찾으면 어느 버튼인지 가려낼 수 없으므로 이 방식을 쓴다.
 */
async function copyViaButton(page: Page, label: string, scope: Locator | Page = page): Promise<string> {
  const button = scope.getByRole("button", { name: label, exact: true });
  await expect(button).toHaveCount(1);
  await expect(button).toBeEnabled();
  await button.click();
  await expect(button, `${label} 버튼이 ${COPIED_LABEL}으로 바뀌지 않았습니다(복사 실패)`).toHaveCount(0);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // 1.5초 뒤 라벨이 원래대로 돌아온다(ADR-34). 다음 복사 버튼과 이름이 겹치지 않게 여기서 기다린다.
  await expect(button).toHaveCount(1);
  return copied;
}

// 이 spec이 settings.json을 바꾸므로, 파일을 원래 내용으로 되돌려 둔다(배치 안 다른 spec·재실행 대비).
let originalSettingsJson: string | null = null;

test.beforeAll(() => {
  originalSettingsJson = readFixtureFile(settingsFile());
});

test.afterAll(() => {
  if (originalSettingsJson !== null) {
    writeFixtureFile(settingsFile(), originalSettingsJson);
  }
});

test("[FR-014-AC4][FR-013-AC5][E2E-11] 07 카드 3개의 값 행이 실제 값을 보여준다(마운트 폴더는 맥북 경로, 두 명령 표시)", async ({
  page,
}) => {
  const state = readE2eState();

  await gotoReady(page, "/settings");
  await expect(page.locator("header[data-wf]").getByRole("heading", { level: 1, name: SETTINGS_TITLE, exact: true })).toBeVisible();

  // 카드 1 프로젝트 폴더 — FR-014-AC4: 컨테이너 경로(`/workspace`)가 아니라 맥북 경로다.
  const mountRow = page.getByTestId("settings-row-mount-path");
  await expect(mountRow).toContainText(state.fixtureDir);
  await expect(mountRow).not.toContainText("/workspace");
  await expect(page.getByTestId("settings-row-agents")).toContainText(
    `.claude/agents/ · 정의 ${fixtureAgentCount()}개`,
  );
  await expect(page.getByTestId("settings-row-skills")).toContainText(
    `.claude/skills/ · ${fixtureSkillCount()}개`,
  );
  await expect(page.getByTestId("settings-row-writable")).toContainText(
    // v1.2.0: 스킬도 쓸 수 있다(ui-spec SCR-07 행 `쓰기 권한`, 화면 원본 — FR-014 Output).
    "있음 · 에이전트·스킬 추가·수정·삭제 가능",
  );
  await expect(page.getByTestId("settings-row-format-errors")).toContainText("읽지 못한 정의 파일 0개");
  // v1.2.0: `읽기 전용` 칩이 프로젝트 폴더·전역 연결 카드에 둘이므로 프로젝트 폴더 카드로 좁힌다(SCR-07 카드 칩).
  await expect(card(page, "프로젝트 폴더").getByText("읽기 전용", { exact: true })).toBeVisible();
  await expect(
    page.getByText("폴더는 컨테이너를 실행할 때 마운트로 정해지며 웹에서 바꿀 수 없습니다", { exact: true }),
  ).toBeVisible();

  // 카드 2 Claude 열기 — FR-013-AC5: 두 명령이 07에 있다.
  await expect(
    page.getByText(
      "에이전트 워크플로우의 Claude 열기 · 기본 세션은 claude를, 워크플로우 상세의 팀장 호출은 그 워크플로우 팀장 세션을 macOS 기본 터미널에서 AojiStudio 폴더 기준으로 엽니다.",
      { exact: true },
    ),
  ).toBeVisible();
  // v1.2.0 새 행 `실행 환경`(FR-014 Output): `E2E_HOST_OS`가 비면 macOS 호스트 = `맥북`.
  await expect(rowValue(card(page, "Claude 열기"), "실행 환경")).toHaveText("맥북");
  await expect(page.getByTestId("settings-row-terminal-app")).toContainText("macOS 기본 터미널");
  await expect(page.getByTestId("settings-row-default-session")).toContainText(
    `cd "${state.fixtureDir}" && claude`,
  );
  // 템플릿의 `<팀장 name>`은 서버가 주는 문자열의 일부이므로 화면에 그대로 나온다(ADR-33 (a)).
  await expect(page.getByTestId("settings-row-lead-session")).toContainText(
    `cd "${state.fixtureDir}" && claude --agent <팀장 name>`,
  );
  await expect(page.getByTestId("settings-row-lead-session")).toContainText(LEAD_SESSION_HINT);
  await expect(page.getByTestId("settings-row-helper")).toContainText(
    helperInstalledPattern(),
  );

  // 카드 3 수집 — 수집 주소는 이 컨테이너의 공개 주소다(ADR-45로 포트가 `4185`다).
  await expect(page.getByTestId("settings-row-collect-url")).toContainText(
    `${state.baseUrl}/hooks/events`,
  );
  await expect(page.getByTestId("settings-row-teams")).toContainText(
    ".aojistudio/teams/*.json · 팀장·팀원 목록",
  );
  await expect(page.getByTestId("settings-row-trash")).toContainText(
    ".aojistudio/trash/ · 제거한 정의 파일·스킬 보관",
  );
  await expect(page.getByTestId("settings-row-retention")).toContainText(
    "30일 · 일별 집계(스킬 사용·MCP 호출·토큰 수)는 계속 보관",
  );
  await expect(
    page.getByText("allowedHttpHookUrls가 설정되어 있으면 수집 주소를 허용 목록에 추가하세요", {
      exact: true,
    }),
  ).toBeVisible();

  // fixture 원본 settings.json은 운영 포트·placeholder 토큰이라 이 컨테이너 기준으로는 미설정이다(D-052).
  await expect(page.getByTestId("settings-row-hook")).toContainText(
    `.claude/settings.json · ${HOOK_MISSING_TEXT}`,
  );
  await expect(sidebar(page).getByText(SIDEBAR_HOOK_NOT_CONFIGURED_TEXT, { exact: true })).toBeVisible();
});

test("[FR-014-AC1][E2E-11] 07의 복사 버튼·`다시 읽기`를 눌러도 웹은 `.claude/settings.json`을 쓰지 않는다", async ({
  page,
}) => {
  const before = readFixtureFile(settingsFile());
  const beforeMtimeMs = statSync(settingsFile()).mtimeMs;

  await grantClipboard(page);
  await gotoReady(page, "/settings");
  await copyViaButton(page, COPY_COMMAND_LABEL);
  await copyViaButton(page, COPY_HOOK_EXAMPLE_LABEL, card(page, "수집"));
  await copyViaButton(page, COPY_HOOK_EXAMPLE_LABEL, card(page, "상태줄 연동"));
  await page.getByRole("button", { name: RESCAN_LABEL, exact: true }).click();
  // rescan이 끝나면 값 행이 그대로 다시 채워진다(버튼 라벨이 원래대로 돌아온다).
  await expect(page.getByRole("button", { name: RESCAN_LABEL, exact: true })).toBeEnabled();
  await expect(page.getByTestId("settings-row-mount-path")).toContainText(readE2eState().fixtureDir);

  expect(readFixtureFile(settingsFile()), "웹이 settings.json 내용을 바꿨습니다(FR-014-AC1)").toBe(before);
  expect(statSync(settingsFile()).mtimeMs, "웹이 settings.json을 다시 썼습니다(FR-014-AC1)").toBe(
    beforeMtimeMs,
  );
});

test("[FR-014-AC5][FR-013-AC5][E2E-11] 07 `명령 복사` → 클립보드 = 기본 세션 명령 · 팀장 명령 복사 버튼은 07에 없다", async ({
  page,
}) => {
  const state = readE2eState();
  const defaultSessionCommand = `cd "${state.fixtureDir}" && claude`;

  await grantClipboard(page);
  await gotoReady(page, "/settings");

  // FR-014-AC5: 07의 `명령 복사`는 기본 세션 명령 하나뿐이다(팀장 명령은 03에서만 복사한다).
  await expect(page.getByRole("button", { name: COPY_COMMAND_LABEL, exact: true })).toHaveCount(1);
  const copied = await copyViaButton(page, COPY_COMMAND_LABEL);
  expect(copied).toBe(defaultSessionCommand);
  expect(copied, "07 `명령 복사`가 팀장 명령을 복사했습니다(FR-014-AC5)").not.toContain("--agent");
});

test("[FR-014-AC6][FR-027-E1][E2E-11] 07 상태줄 연동 카드: 설정 예시 형식(서버 값 그대로) · `설정 예시 복사` = 그 값 · `받은 적 없음` → 캡처 `07-settings@1920x1080`", async ({
  page,
  request,
}) => {
  const state = readE2eState();

  await grantClipboard(page);
  await gotoReady(page, "/settings");
  const statusline = card(page, "상태줄 연동");
  await expect(statusline).toBeVisible();
  await expect(statusline).toHaveAttribute("data-wf", "07-6");
  await expect(
    statusline.getByText(
      "Claude Code 상태줄 입력에서 구독 플랜과 5시간·주간 한도를 Aoji Studio로 보냅니다. 비용 화면의 한도 값이 여기서 옵니다.",
      { exact: true },
    ),
  ).toBeVisible();

  // 기준값: 서버가 주는 예시(`GET /api/settings`, 읽기). 화면은 이 값을 가공 없이 보여주고 복사해야 한다.
  const response = await request.get(`${state.baseUrl}/api/settings`, { headers: { Origin: state.baseUrl } });
  expect(response.status()).toBe(200);
  const settings = (await response.json()) as { statusline: { settingsExample: string; lastReceivedAt: string | null } };
  const example = settings.statusline.settingsExample;
  expect(settings.statusline.lastReceivedAt, "배치 6 07은 상태줄을 받은 적 없는 상태여야 합니다").toBeNull();

  // FR-014-AC6 형식: 바깥 `{}` 없는 `"statusLine": {…}` 조각 → `{}`로 감싸 JSON으로 파싱된다.
  expect(example.startsWith('"statusLine": {'), "예시가 `\"statusLine\": {` 조각으로 시작하지 않습니다").toBe(true);
  const parsed = JSON.parse(`{${example}}`) as { statusLine: { type: string; command: string } };
  expect(Object.keys(parsed)).toEqual(["statusLine"]);
  expect(Object.keys(parsed.statusLine).sort()).toEqual(["command", "type"]);
  expect(parsed.statusLine.type).toBe("command");
  expect(parsed.statusLine.command).toBe(
    `node "${state.fixtureDir}/.aojistudio/statusline.mjs" --url ${state.baseUrl}/hooks/statusline -- <쓰던 상태줄 명령>`,
  );
  // 수집 토큰은 예시에 없다(스크립트가 옆 `collect-token`을 읽는다 — ADR-83).
  expect(example, "예시에 수집 토큰이 들어 있습니다").not.toContain(state.collectToken);

  // 화면 블록 = 서버 값(공백 정규화 후 비교 — 블록은 `pre-wrap`).
  await expect(statusline).toContainText(example.replace(/\s+/g, " ").trim());
  await expect(statusline).toContainText("<쓰던 상태줄 명령>");

  // `설정 예시 복사` → 클립보드 = 서버 값 그대로(손대지 않음), 버튼은 `복사됨`을 거쳐 돌아온다.
  const copied = await copyViaButton(page, COPY_HOOK_EXAMPLE_LABEL, statusline);
  expect(copied, "상태줄 `설정 예시 복사`가 서버 값과 다릅니다").toBe(example);
  await expect(statusline.getByText("Claude Code 설정 파일에 직접 넣습니다 · 웹은 쓰지 않습니다", { exact: true })).toBeVisible();

  // FR-027-E1: 받은 적 없는 상태.
  await expect(rowValue(statusline, "마지막 수신")).toHaveText("받은 적 없음");
  await expect(rowValue(statusline, "쓰던 상태줄")).toContainText(
    "이미 쓰던 상태줄 명령이 있으면 <쓰던 상태줄 명령> 자리에 넣으세요. 그 명령의 출력이 그대로 상태줄에 보입니다. 없으면 이 자리를 지웁니다",
  );
  await expect(
    statusline.getByText("Claude Code CLI 세션이 돌 때만 값이 들어옵니다. 데스크톱 앱 세션에서는 상태줄이 돌지 않을 수 있습니다.", {
      exact: true,
    }),
  ).toBeVisible();

  // 전역 Claude 설정 연결 카드: 대역(연결 안 됨) 상태 — 캡처에 함께 담긴다.
  const global = card(page, "전역 Claude 설정 연결");
  await expect(global).toBeVisible();
  for (const item of ["~/.claude.json", "~/.claude/settings.json", "~/.claude/plugins/", "~/.claude/projects/"]) {
    await expect(global.getByText(item, { exact: true })).toBeVisible();
  }
  await expect(global.getByText("연결 안 됨", { exact: true })).toHaveCount(4);
  await expect(global.getByText(/^연결됨 · 읽기 전용$/)).toHaveCount(0);
  await expect(
    global.getByText("연결 방법 · .env에 홈 경로를 넣고 컨테이너를 다시 시작하면 4개 항목이 읽기 전용으로 연결됩니다. 웹은 이 파일들을 쓰지 않습니다.", {
      exact: true,
    }),
  ).toBeVisible();

  // 캡처: 배치 6 상태(연결 안 됨 · 받은 적 없음). 시안 상태 대조는 T-R4-22 배치 13.
  await page.setViewportSize(CAPTURE_SIZE);
  await settle(page);
  await expectRegionsVisible(page, ["07-1", "07-2", "07-3", "07-4", "07-5", "07-6", "07-7"], `07 ${sizeLabel(CAPTURE_SIZE)}`);
  await expectSettingsLayout(page, CAPTURE_SIZE);
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `07-settings@${sizeLabel(CAPTURE_SIZE)}.png`),
    caret: "hide",
    animations: "disabled",
  });
});

test("[FR-014-AC7][E2E-11] 07에는 입력 요소가 0개이고 변경 요청을 보내지 않는다(버튼은 보조 동작뿐)", async ({ page }) => {
  const state = readE2eState();
  const writes: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.origin === state.baseUrl && !["GET", "HEAD", "OPTIONS"].includes(req.method())) {
      writes.push(`${req.method()} ${url.pathname}`);
    }
  });

  await grantClipboard(page);
  await gotoReady(page, "/settings");
  await expect(card(page, "상태줄 연동")).toBeVisible();
  await expect(card(page, "전역 Claude 설정 연결")).toBeVisible();

  const main = page.locator("main").first();
  for (const role of ["textbox", "searchbox", "checkbox", "radio", "combobox", "spinbutton", "slider", "switch", "listbox"] as const) {
    await expect(main.getByRole(role), `07에 ${role} 요소가 있습니다(FR-014-AC7)`).toHaveCount(0);
  }
  await expect(main.locator("input, textarea, select, [contenteditable='true']")).toHaveCount(0);
  await expect(page.locator("header[data-wf]").locator("input, textarea, select")).toHaveCount(0);

  // 버튼은 모두 보조 동작: 다시 읽기 · 설정 예시 복사(수집·상태줄) · 테스트로 열기 · 명령 복사. 저장·변경 버튼은 없다.
  const names = (await main.getByRole("button").allInnerTexts()).map((text) => text.replace(/\s+/g, " ").trim()).sort();
  expect(names).toEqual([COPY_COMMAND_LABEL, COPY_HOOK_EXAMPLE_LABEL, COPY_HOOK_EXAMPLE_LABEL, RESCAN_LABEL, TEST_OPEN_LABEL].sort());

  // 복사 버튼을 눌러도 변경 요청(PUT·PATCH·DELETE·POST)이 서버로 가지 않는다. `다시 읽기`의 rescan은 제외하고 누르지 않는다.
  await copyViaButton(page, COPY_HOOK_EXAMPLE_LABEL, card(page, "상태줄 연동"));
  await copyViaButton(page, COPY_COMMAND_LABEL);
  expect(writes, "07이 서버에 변경 요청을 보냈습니다(FR-014-AC7)").toEqual([]);
});

test("[FR-014-AC2][FR-014-AC3][E2E-11] `설정 예시 복사` JSON(12종 스키마)을 그대로 fixture settings.json에 쓰면 `hook 설정됨`이 되고 실제로 이벤트가 수집된다", async ({
  page,
  request,
}, testInfo) => {
  const state = readE2eState();

  await grantClipboard(page);
  await gotoReady(page, "/settings");
  const hookRow = page.getByTestId("settings-row-hook");
  const hookConfiguredText = `.claude/settings.json · ${HOOK_CONFIGURED_TEXT}`;
  await expect(hookRow).toContainText(HOOK_MISSING_TEXT);

  // 클립보드 값을 그대로 받는다(손으로 고치지 않는다 — FR-014-AC2의 "그대로").
  const example = await copyViaButton(page, COPY_HOOK_EXAMPLE_LABEL, card(page, "수집"));
  expect(example.trim(), "`설정 예시 복사`가 빈 값을 복사했습니다").not.toBe("");

  // FR-014-AC2 후단: 예시 JSON 스키마를 자동 검증한다(architecture.md §7.1).
  const parsed = JSON.parse(example) as HookSettingsExample;
  expect(Object.keys(parsed.hooks)).toEqual(HOOK_EVENT_NAMES);
  const collectUrl = `${state.baseUrl}/hooks/events`;
  for (const eventName of HOOK_EVENT_NAMES) {
    const entry = onlyHookEntry(parsed, eventName);
    // `matcher`는 두지 않는다(architecture.md §7.1).
    expect(Object.keys(entry), `${eventName} 항목에 hooks 밖의 키가 있습니다`).toEqual(["hooks"]);
    const hook = onlyHook(entry, eventName);
    expect(hook.type).toBe("http");
    expect(hook.url).toBe(collectUrl);
    expect(hook.timeout).toBe(3);
    expect(Object.keys(hook.headers)).toEqual([COLLECT_TOKEN_HEADER]);
    expect(hook.headers[COLLECT_TOKEN_HEADER]).toBe(state.collectToken);
  }

  // 복사한 문자열을 **가공 없이** 파일에 쓴다. FR-001-AC3 기한(2초) 안에 화면이 갱신되는지 실측한다.
  await measureFileChangeReflection(
    testInfo,
    "설정 예시 JSON을 settings.json에 그대로 쓰기 → 07 `hook 설정: 설정됨`",
    () => writeFixtureFile(settingsFile(), example),
    // `toContainText`와 같은 판정(공백 정규화 후 부분 문자열)을 자체 대기 없는 조회로만 한다.
    async () =>
      (await hookRow.allTextContents()).some((text) =>
        text.replace(/\s+/g, " ").trim().includes(hookConfiguredText),
      ),
  );
  // 측정 뒤 상태 확인(예산 밖): 반영된 화면이 실제로 그 상태인지 web-first 단언으로 다시 본다.
  await expect(hookRow).toContainText(hookConfiguredText);
  expect(readFixtureFile(settingsFile()), "파일에 쓴 내용이 복사한 예시와 다릅니다").toBe(example);
  await expect(sidebar(page).getByText(SIDEBAR_HOOK_CONFIGURED_TEXT, { exact: true })).toBeVisible();

  // FR-014-AC2 전단 "그대로 넣으면 이벤트가 수집된다": 예시가 지정한 주소·헤더로 실제 hook을 보낸다
  // (Claude Code의 http hook이 하는 것과 같은 요청. 주소·토큰은 예시에서 읽은 값만 쓴다).
  const exampleHook = onlyHook(onlyHookEntry(parsed, "SessionStart"), "SessionStart");
  const sessionId = `e2e-11-${Date.now()}`;
  const response = await request.post(exampleHook.url, {
    headers: { "Content-Type": "application/json", ...exampleHook.headers },
    data: {
      session_id: sessionId,
      agent_type: "dev-lead",
      cwd: "/workspace",
      hook_event_name: "SessionStart",
      permission_mode: "default",
    },
  });
  expect(response.status(), "예시 설정의 주소·토큰으로 보낸 hook이 거부됐습니다").toBe(204);

  // 수집됐는지는 화면으로 확인한다(01 실시간 이벤트 + 사이드바 마지막 수신 시각).
  await gotoReady(page, "/");
  const firstRowCells = page.locator("main").first().locator("table tbody tr").first().locator("td");
  await expect(firstRowCells.nth(3)).toHaveText("세션 시작", { timeout: SETUP_REFLECT_TIMEOUT_MS });
  await expect(firstRowCells.nth(2)).toHaveText("dev-lead");
  await expect(sidebar(page).getByText(/마지막 수신 \d{2}:\d{2}:\d{2}/)).toBeVisible();
});

test("[FR-013-AC10][E2E-11] 07 `테스트로 열기` → dry-run 도우미가 기본 세션 명령을 받는다", async ({
  page,
}) => {
  const state = readE2eState();
  const command = `cd "${state.fixtureDir}" && claude`;

  await gotoReady(page, "/settings");
  // 도우미가 응답하므로 버튼이 활성이다(FR-013-AC10: 진입 시 확인).
  await expect(page.getByTestId("settings-row-helper")).toContainText(
    helperInstalledPattern(),
  );
  const button = page.getByRole("button", { name: TEST_OPEN_LABEL, exact: true });
  await expect(button).toBeEnabled();

  const baseline = helperDryRunLines().length;
  await button.click();

  await expect
    .poll(() => helperDryRunLines().slice(baseline), {
      message: `도우미 stdout에 'DRY-RUN ${command}' 한 줄이 추가되지 않았습니다`,
      timeout: SETUP_REFLECT_TIMEOUT_MS,
    })
    .toEqual([`DRY-RUN ${command}`]);

  // 204이므로 안내·에러 표시가 없다(ui-spec SCR-07 클릭 시 동작).
  await expect(page.getByRole("dialog", { name: "열기 도우미가 응답하지 않습니다" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
