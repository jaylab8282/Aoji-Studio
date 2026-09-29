// E2E-11 07 설정 (architecture.md §8.2 E2E-11 행).
// fixture: `project-configured`.
// 검증 ID: FR-014-AC1~AC5, FR-013-AC5 (+ `테스트로 열기`의 동작 경로 FR-013-AC10).
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
import { statSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { helperDryRunLines, readE2eState } from "../lib/e2e-state";
import {
  SETUP_REFLECT_TIMEOUT_MS,
  fixturePath,
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

const COLLECT_TOKEN_HEADER = "X-JayStudio-Collect-Token";

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
const TEST_OPEN_LABEL = "테스트로 열기 (도우미 설치 후)";
const RESCAN_LABEL = "다시 읽기";
const LEAD_SESSION_HINT = "도우미가 받는 값은 팀장 name 하나 · 소문자·숫자·하이픈만 허용";
const HOOK_CONFIGURED_TEXT = "설정됨";
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
  return page.locator("aside").filter({ hasText: "Jay Studio" });
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
async function copyViaButton(page: Page, label: string): Promise<string> {
  const button = page.getByRole("button", { name: label, exact: true });
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
  await expect(page.getByRole("heading", { level: 1, name: SETTINGS_TITLE, exact: true })).toBeVisible();

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
    "✓ agents 추가·수정·삭제 가능",
  );
  await expect(page.getByTestId("settings-row-format-errors")).toContainText("없음");
  await expect(page.getByText("읽기 전용", { exact: true })).toBeVisible();
  await expect(
    page.getByText("폴더는 컨테이너 실행 시 마운트로 고정 · 웹에서 변경 불가", { exact: true }),
  ).toBeVisible();

  // 카드 2 Claude 열기 — FR-013-AC5: 두 명령이 07에 있다.
  await expect(
    page.getByText(
      "02의 Claude 열기 · 기본 세션과 03의 팀장 호출 · 터미널 열기를 누르면 맥북 터미널이 열리고 프로젝트 폴더에서 claude가 실행됩니다.",
      { exact: true },
    ),
  ).toBeVisible();
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
    /설치됨 · 응답 확인 \d{2}:\d{2}:\d{2}/,
  );

  // 카드 3 수집 — 수집 주소는 이 컨테이너의 공개 주소다(ADR-45로 포트가 `4185`다).
  await expect(page.getByTestId("settings-row-collect-url")).toContainText(
    `${state.baseUrl}/hooks/events`,
  );
  await expect(page.getByTestId("settings-row-teams")).toContainText(
    ".jaystudio/teams/*.json · 팀장·팀원 목록",
  );
  await expect(page.getByTestId("settings-row-trash")).toContainText(
    ".jaystudio/trash/ · 제거한 에이전트 보관",
  );
  await expect(page.getByTestId("settings-row-retention")).toContainText("30일");
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
  await copyViaButton(page, COPY_HOOK_EXAMPLE_LABEL);
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
  const example = await copyViaButton(page, COPY_HOOK_EXAMPLE_LABEL);
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
    /설치됨 · 응답 확인 \d{2}:\d{2}:\d{2}/,
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
