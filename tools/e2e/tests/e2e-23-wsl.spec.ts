// E2E-23 WSL 실행 환경 (architecture.md §8.2 E2E-23 행, 배치 14).
// fixture: `project-configured` (워크플로우 dev-team[팀장 dev-lead]).
// 배치 환경: `E2E_HOST_OS=wsl` · `E2E_WSL_DISTRO=Ubuntu-24.04` · `E2E_HELPER_PLATFORM=windows`
//   (서버는 wsl 실행 환경, 도우미는 `--platform windows --dry-run` — `wt.exe` 실행만 dry-run이다).
// 검증 ID: FR-013-AC1·AC2·AC5·AC6·AC9·AC12, FR-013-E1, FR-014-AC4(WSL 경로).
//
// 확인하는 것
//  1. 서버 설정이 wsl·배포판이다(`GET /api/state` config) — 하네스 환경 변수가 실제로 적용된 배치인지 먼저 본다.
//  2. 02 `Claude 열기 · 기본 세션` → 도우미 stdout `DRY-RUN wt.exe -w 0 new-tab --title Aoji Studio wsl.exe -d Ubuntu-24.04
//     --cd <fixture> -- bash -lic 'exec claude "$@"' claude` 1줄, 본문은 `{target:'default'}`뿐(FR-013-AC1·AC6·AC12).
//  3. 03 `팀장 호출 · 터미널 열기` → 같은 줄 끝에 `--agent dev-lead`(FR-013-AC2·AC6·AC12).
//  4. 07 실행 환경 `WSL · Ubuntu-24.04`·`Windows Terminal`·WSL 기본 세션·팀장 명령·`Windows 도우미 설치됨`,
//     `명령 복사` = WSL 기본 세션 명령, `테스트로 열기` → 위와 같은 Windows dry-run 줄(FR-013-AC5·AC12, FR-014-AC4).
//  5. 도우미 정지 → 02·03·07 미설치 안내가 `helper/windows/install.ps1`을 가리키고 선택한 항목의 WSL 명령이 보이며
//     `명령 복사` = 그 WSL 명령(FR-013-AC9·E1). 도우미에는 아무 줄도 가지 않는다.
//
// 목킹 없음(conventions.md §8): 실제 컨테이너·실제 Windows 분기 dry-run 도우미·실제 fixture 파일만 쓴다.
// `page.route` 가로채기 없음. 주소·포트·경로 literal 없음 — 모두 `.e2e-state.json`에서 읽는다.
// 이 spec은 fixture 파일을 쓰지 않는다. 도우미 정지는 SIGSTOP→SIGCONT이고 `finally`에서 되돌려 단언한다.
import { execFileSync } from "node:child_process";

import { expect, test, type Locator, type Page, type Request } from "@playwright/test";

import { helperDryRunLines, readE2eState } from "../lib/e2e-state";
import { delay, httpGet, isProcessAlive, listPortListeners } from "../lib/harness-utils";
import { SETUP_REFLECT_TIMEOUT_MS, gotoReady, helperInstalledPattern } from "./ui-helpers";

const WSL_DISTRO = "Ubuntu-24.04";
const DEV_TEAM = "dev-team";
const DEV_LEAD = "dev-lead";

/** `frontend/src/api/helper.ts` 무응답 판정 한도(FR-013-AC9·AC10). */
const HELPER_TIMEOUT_MS = 2000;
const HELPER_TIMEOUT_BUDGET_MS = 6000;
const NO_CALL_WINDOW_MS = 500;

// ui-spec 확정 문구 (SCR-02·03·07, §공통 HelperMissingDialog — wsl 문장은 ADR-91).
const OPEN_DEFAULT_SESSION_LABEL = "Claude 열기 · 기본 세션";
const LEAD_TERMINAL_LABEL = "팀장 호출 · 터미널 열기";
const TEST_OPEN_LABEL = "테스트로 열기";
const COPY_COMMAND_LABEL = "명령 복사";
const CLOSE_LABEL = "닫기";
const HELPER_MISSING_TITLE = "열기 도우미가 응답하지 않습니다";
const HELPER_MISSING_BODY_WSL = "helper/windows/install.ps1로 설치한 뒤 다시 시도하세요";
const HELPER_MISSING_ROW_TEXT_WSL = "미설치 · helper/windows/install.ps1로 설치";
const HELPER_MISSING_REASON = "도우미 미설치";
const CLAUDE_DESC_WSL =
  "에이전트 워크플로우의 Claude 열기 · 기본 세션은 claude를, 워크플로우 상세의 팀장 호출은 그 워크플로우 팀장 세션을 Windows Terminal 새 탭에서 WSL AojiStudio 폴더 기준으로 엽니다.";
const LEAD_SESSION_HINT = "도우미가 받는 값은 팀장 name 하나 · 소문자·숫자·하이픈만 허용";

test.describe.configure({ mode: "serial" });

// ── 기대 문자열 (FR-013-AC1·AC2·AC12. 서버 `CommandStrings`·도우미 `buildWtArgs`와 같은 형식) ──────────

/** 서버가 주는 WSL 기본 세션 명령 (FR-013-AC1 wsl). */
function wslDefaultCommand(projectDir: string): string {
  return `wsl -d ${WSL_DISTRO} --cd ${projectDir} -- bash -lic 'exec claude "$@"' claude`;
}

function wslLeadCommand(projectDir: string, leadName: string): string {
  return `${wslDefaultCommand(projectDir)} --agent ${leadName}`;
}

/** Windows dry-run 도우미 stdout 한 줄 (FR-013-AC12). 인자 사이는 공백 하나(`--title Aoji Studio`도 그대로 이어진다). */
function wtDryRunLine(projectDir: string, leadName: string | null): string {
  const tail = leadName === null ? "" : ` --agent ${leadName}`;
  return `DRY-RUN wt.exe -w 0 new-tab --title Aoji Studio wsl.exe -d ${WSL_DISTRO} --cd ${projectDir} -- bash -lic 'exec claude "$@"' claude${tail}`;
}

// ── 화면 도우미 ──────────────────────────────────────────────────────────────────────────

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

async function grantClipboard(page: Page): Promise<void> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
}

// ── 도우미 stdout(`DRY-RUN …`) ────────────────────────────────────────────────────────────

function dryRunCount(): number {
  return helperDryRunLines().length;
}

async function expectDryRunLineAdded(baseline: number, line: string): Promise<void> {
  await expect
    .poll(() => helperDryRunLines().slice(baseline), {
      message: `도우미 stdout에 '${line}' 한 줄이 추가되지 않았습니다`,
      timeout: SETUP_REFLECT_TIMEOUT_MS,
    })
    .toEqual([line]);
}

async function expectNoDryRunLine(baseline: number): Promise<void> {
  await delay(NO_CALL_WINDOW_MS);
  expect(helperDryRunLines().slice(baseline), "도우미가 호출되지 않아야 하는데 DRY-RUN 줄이 생겼습니다").toEqual([]);
}

// ── 도우미 `POST /open` 요청 관찰 (FR-013-AC6) ─────────────────────────────────────────────

type OpenRequestLog = { origin: string; path: string; body: string | null; headerNames: Promise<string[]> };

function recordOpenRequests(page: Page, helperUrl: string): OpenRequestLog[] {
  const logs: OpenRequestLog[] = [];
  page.on("request", (request: Request) => {
    const url = new URL(request.url());
    if (url.origin === helperUrl && request.method() === "POST") {
      logs.push({
        origin: url.origin,
        path: url.pathname,
        body: request.postData(),
        headerNames: request.allHeaders().then((headers) => Object.keys(headers)),
      });
    }
  });
  return logs;
}

/** 본문이 `target`(+`leadName`)뿐이고 경로·배포판·명령 조각이 없는지 확인한다(FR-013-AC6, Windows 분기도 같다). */
async function expectOpenRequest(
  logs: OpenRequestLog[],
  helperUrl: string,
  expected: { target: "default" } | { target: "lead"; leadName: string },
  projectDir: string,
): Promise<void> {
  expect(logs, "브라우저가 도우미 /open을 직접 호출한 기록이 하나가 아닙니다").toHaveLength(1);
  const [log] = logs;
  if (log === undefined) {
    throw new Error("도우미 /open 요청 기록이 없습니다");
  }
  expect(log.origin).toBe(helperUrl);
  expect(log.path).toBe("/open");
  const raw = log.body ?? "";
  expect(JSON.parse(raw) as Record<string, unknown>).toEqual(expected);
  expect(raw, "요청 본문에 프로젝트 경로가 들어 있습니다(FR-013-AC6)").not.toContain(projectDir);
  expect(raw, "요청 본문에 배포판 이름이 들어 있습니다(FR-013-AC6)").not.toContain(WSL_DISTRO);
  expect(raw, "요청 본문에 명령 문자열이 들어 있습니다(FR-013-AC6)").not.toContain("claude");
  expect(raw, "요청 본문에 옵션이 들어 있습니다(FR-013-AC6)").not.toContain("--agent");
  const names = await log.headerNames;
  expect(names.filter((name) => name.endsWith("-helper-token"))).toEqual(["x-aojistudio-helper-token"]);
}

// ── 도우미 프로세스 제어 (하네스가 띄운 pid를 잠시 멈췄다 되돌린다 — e2e-09와 같은 방식) ─────────────

function signalProcessGroup(pid: number, signalName: "SIGSTOP" | "SIGCONT"): void {
  try {
    process.kill(-pid, signalName);
  } catch {
    process.kill(pid, signalName);
  }
}

function processState(pid: number): string {
  try {
    return execFileSync("ps", ["-o", "state=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

async function stopHelper(pid: number): Promise<void> {
  expect(isProcessAlive(pid), `도우미 pid ${pid}가 살아 있지 않습니다`).toBe(true);
  signalProcessGroup(pid, "SIGSTOP");
  await expect
    .poll(() => processState(pid), { message: "도우미가 정지 상태(T)로 바뀌지 않았습니다", timeout: 5000 })
    .toMatch(/^T/);
}

async function resumeHelper(pid: number, helperUrl: string, baseUrl: string): Promise<void> {
  signalProcessGroup(pid, "SIGCONT");
  await expect
    .poll(() => processState(pid), { message: "도우미가 실행 상태로 돌아오지 않았습니다", timeout: 5000 })
    .not.toMatch(/^T/);
  await expect
    .poll(
      async () => {
        try {
          return (await httpGet(`${helperUrl}/health`, { Origin: baseUrl })).status;
        } catch {
          return 0;
        }
      },
      { message: "도우미 /health가 200을 돌려주지 않습니다(복구 실패)", timeout: 10_000 },
    )
    .toBe(200);
  const port = Number(new URL(helperUrl).port);
  expect(listPortListeners(port), `도우미 포트(${port}) 리스너가 하네스가 띄운 pid ${pid} 하나가 아닙니다`).toEqual([pid]);
}

/** 버튼을 누른 순간부터 무응답 안내가 뜰 때까지 실제 경과 시간을 재고 WSL 문구·명령·버튼을 단언한다(FR-013-AC9·E1). */
async function clickAndExpectHelperMissingDialog(page: Page, buttonName: string, command: string, label: string): Promise<void> {
  const startedAt = Date.now();
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: HELPER_MISSING_TITLE });
  await expect(dialog).toBeVisible({ timeout: HELPER_TIMEOUT_BUDGET_MS });
  const elapsedMs = Date.now() - startedAt;

  await expect(dialog.getByRole("heading", { name: HELPER_MISSING_TITLE, exact: true })).toBeVisible();
  // Windows 도우미 안내: 맥북 설치 스크립트 문장이 아니라 `helper/windows/install.ps1` 문장이다.
  await expect(dialog.getByText(HELPER_MISSING_BODY_WSL, { exact: true })).toBeVisible();
  await expect(dialog.getByText("helper/install.sh로 설치한 뒤 다시 시도하세요", { exact: true })).toHaveCount(0);
  await expect(dialog).toContainText(command);
  await expect(dialog.getByRole("button", { name: COPY_COMMAND_LABEL, exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: CLOSE_LABEL, exact: true })).toBeEnabled();

  test.info().annotations.push({
    type: "FR-013-AC9 무응답 판정 시간",
    description: `${label}: ${elapsedMs}ms (도우미 타임아웃 ${HELPER_TIMEOUT_MS}ms, 상한 ${HELPER_TIMEOUT_BUDGET_MS}ms)`,
  });
  expect(elapsedMs, `${label}: 2초 전에 안내가 떴습니다(${elapsedMs}ms)`).toBeGreaterThanOrEqual(HELPER_TIMEOUT_MS);
  expect(elapsedMs, `${label}: 안내가 ${HELPER_TIMEOUT_BUDGET_MS}ms 안에 뜨지 않았습니다(${elapsedMs}ms)`).toBeLessThanOrEqual(
    HELPER_TIMEOUT_BUDGET_MS,
  );
}

/** 안내의 `명령 복사` → 클립보드 = 선택한 항목의 WSL 명령, 그 뒤 `닫기`. */
async function copyFromDialogAndClose(page: Page, command: string): Promise<void> {
  await grantClipboard(page);
  const dialog = page.getByRole("dialog", { name: HELPER_MISSING_TITLE });
  await dialog.getByRole("button", { name: COPY_COMMAND_LABEL, exact: true }).click();
  await expect(dialog.getByRole("button", { name: "복사됨", exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
  await dialog.getByRole("button", { name: CLOSE_LABEL, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

// ── 테스트 ────────────────────────────────────────────────────────────────────────────────

test("[FR-013-AC1][E2E-23] 배치 14 전제: 서버 설정이 WSL 실행 환경(Ubuntu-24.04)이고 fixture 경로가 WSL 경로 규칙을 만족한다", async ({
  request,
}) => {
  const state = readE2eState();
  const response = await request.get(`${state.baseUrl}/api/state`, { headers: { Origin: state.baseUrl } });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    config: { hostOs: string; wslDistro: string | null; defaultSessionCommand: string };
  };
  expect(body.config.hostOs).toBe("wsl");
  expect(body.config.wslDistro).toBe(WSL_DISTRO);
  expect(body.config.defaultSessionCommand).toBe(wslDefaultCommand(state.fixtureDir));
  // Windows 도우미는 WSL 경로(영숫자·점·밑줄·슬래시·하이픈)만 받는다(ADR-78). 임시 fixture 경로가 이를 만족해야 이 배치가 성립한다.
  expect(state.fixtureDir).toMatch(/^\/[A-Za-z0-9._/-]+$/);
});

test('[FR-013-AC1][FR-013-AC6][FR-013-AC12][E2E-23] 02 `Claude 열기 · 기본 세션` → 도우미에 {target:"default"}만 보내고 stdout에 `DRY-RUN wt.exe … wsl.exe -d Ubuntu-24.04 --cd <경로> -- bash -lic \'exec claude "$@"\' claude` 1줄이 남는다', async ({
  page,
}) => {
  const state = readE2eState();
  const openRequests = recordOpenRequests(page, state.helperUrl);

  await gotoReady(page, "/workflows");
  const button = page.getByRole("button", { name: OPEN_DEFAULT_SESSION_LABEL, exact: true });
  await expect(button).toBeEnabled();

  const baseline = dryRunCount();
  await button.click();

  const line = wtDryRunLine(state.fixtureDir, null);
  await expectDryRunLineAdded(baseline, line);
  expect(line, "맥북 형식 명령이 섞였습니다").not.toContain("&& claude");

  await expect(page.getByRole("dialog", { name: HELPER_MISSING_TITLE })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/workflows");
  await expectOpenRequest(openRequests, state.helperUrl, { target: "default" }, state.fixtureDir);
});

test('[FR-013-AC2][FR-013-AC6][FR-013-AC12][E2E-23] 03 `팀장 호출 · 터미널 열기` → {target:"lead",leadName}만 보내고 stdout에 `… -- bash -lic \'exec claude "$@"\' claude --agent <lead>` 1줄이 남는다', async ({
  page,
}) => {
  const state = readE2eState();
  const openRequests = recordOpenRequests(page, state.helperUrl);

  await gotoReady(page, `/workflows/${DEV_TEAM}`);
  const button = page.getByRole("button", { name: LEAD_TERMINAL_LABEL, exact: true });
  await expect(button).toBeEnabled();

  const baseline = dryRunCount();
  await button.click();

  await expectDryRunLineAdded(baseline, wtDryRunLine(state.fixtureDir, DEV_LEAD));
  await expect(page.getByRole("dialog", { name: HELPER_MISSING_TITLE })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(`/workflows/${DEV_TEAM}`);
  await expectOpenRequest(openRequests, state.helperUrl, { target: "lead", leadName: DEV_LEAD }, state.fixtureDir);
});

test("[FR-013-AC5][FR-014-AC4][E2E-23] 07 Claude 열기 카드: 실행 환경 `WSL · Ubuntu-24.04` · `Windows Terminal` · WSL 두 명령 · `Windows 도우미 설치됨`", async ({
  page,
}) => {
  const state = readE2eState();

  await gotoReady(page, "/settings");
  const claude = card(page, "Claude 열기");
  await expect(claude).toBeVisible();

  // FR-014-AC4: 마운트 폴더는 WSL 경로 그대로(컨테이너 경로 `/workspace`가 아니다).
  const folder = card(page, "프로젝트 폴더");
  await expect(rowValue(folder, "마운트 폴더")).toHaveText(state.fixtureDir);

  await expect(claude.getByText(CLAUDE_DESC_WSL, { exact: true })).toBeVisible();
  await expect(rowValue(claude, "실행 환경")).toHaveText(`WSL · ${WSL_DISTRO}`);
  await expect(rowValue(claude, "터미널 앱")).toHaveText("Windows Terminal");
  await expect(rowValue(claude, "기본 세션")).toHaveText(wslDefaultCommand(state.fixtureDir));
  // 팀장 명령은 `<팀장 name>` 템플릿 그대로(ADR-33) + 도움말.
  await expect(rowValue(claude, "팀장으로 열기")).toContainText(`${wslDefaultCommand(state.fixtureDir)} --agent <팀장 name>`);
  await expect(rowValue(claude, "팀장으로 열기")).toContainText(LEAD_SESSION_HINT);
  await expect(claude).not.toContainText("&& claude");
  await expect(claude).not.toContainText("macOS 기본 터미널");

  // 열기 도우미: Windows 분기 도우미가 응답하므로 `Windows 도우미 설치됨 · <host:port>`.
  const helperRow = rowValue(claude, "열기 도우미");
  await expect(helperRow).toContainText("Windows 도우미 설치됨");
  await expect(helperRow).toContainText(helperInstalledPattern());
  await expect(page.getByRole("button", { name: TEST_OPEN_LABEL, exact: true })).toBeEnabled();
});

test("[FR-013-AC5][FR-014-AC5][E2E-23] 07 `명령 복사` → 클립보드 = WSL 기본 세션 명령(팀장 명령 아님)", async ({ page }) => {
  const state = readE2eState();
  await grantClipboard(page);
  await gotoReady(page, "/settings");

  const button = page.getByRole("button", { name: COPY_COMMAND_LABEL, exact: true });
  await expect(button).toHaveCount(1);
  await expect(button).toBeEnabled();
  await button.click();
  await expect(button, "`명령 복사`가 복사됨으로 바뀌지 않았습니다(복사 실패)").toHaveCount(0);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(wslDefaultCommand(state.fixtureDir));
  expect(copied).not.toContain("--agent");
  expect(copied, "맥북 형식 명령이 복사됐습니다").not.toContain("&& claude");
});

test("[FR-013-AC12][FR-013-AC5][E2E-23] 07 `테스트로 열기` → Windows dry-run 도우미가 기본 세션 `wt.exe … -- bash -lic 'exec claude \"$@\"' claude` 1줄을 받는다", async ({
  page,
}) => {
  const state = readE2eState();
  await gotoReady(page, "/settings");
  await expect(rowValue(card(page, "Claude 열기"), "열기 도우미")).toContainText(helperInstalledPattern());
  const button = page.getByRole("button", { name: TEST_OPEN_LABEL, exact: true });
  await expect(button).toBeEnabled();

  const baseline = dryRunCount();
  await button.click();
  await expectDryRunLineAdded(baseline, wtDryRunLine(state.fixtureDir, null));
  await expect(page.getByRole("dialog", { name: HELPER_MISSING_TITLE })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("[FR-013-AC9][FR-013-E1][E2E-23] 도우미 정지 → 02 `Claude 열기 · 기본 세션`이 2초 뒤 Windows 도우미 설치 안내 + WSL 기본 세션 명령 + `명령 복사`", async ({
  page,
}) => {
  const state = readE2eState();
  const command = wslDefaultCommand(state.fixtureDir);
  const pid = state.helperPid;
  expect(pid, ".e2e-state.json에 helperPid가 없습니다").not.toBeNull();

  await gotoReady(page, "/workflows");
  const baseline = dryRunCount();
  try {
    await stopHelper(pid as number);
    await clickAndExpectHelperMissingDialog(page, OPEN_DEFAULT_SESSION_LABEL, command, "02 Claude 열기");
    await expectNoDryRunLine(baseline);
    await copyFromDialogAndClose(page, command);
    expect(new URL(page.url()).pathname).toBe("/workflows");
  } finally {
    await resumeHelper(pid as number, state.helperUrl, state.baseUrl);
  }

  // 원복 확인: 다시 누르면 Windows 도우미가 줄을 남긴다.
  const afterResume = dryRunCount();
  await page.getByRole("button", { name: OPEN_DEFAULT_SESSION_LABEL, exact: true }).click();
  await expectDryRunLineAdded(afterResume, wtDryRunLine(state.fixtureDir, null));
});

test("[FR-013-AC9][FR-013-E1][E2E-23] 도우미 정지 → 03 `팀장 호출 · 터미널 열기`가 Windows 도우미 설치 안내 + WSL 팀장 명령(`--agent dev-lead`) + `명령 복사`", async ({
  page,
}) => {
  const state = readE2eState();
  const command = wslLeadCommand(state.fixtureDir, DEV_LEAD);
  const pid = state.helperPid;
  expect(pid, ".e2e-state.json에 helperPid가 없습니다").not.toBeNull();

  await gotoReady(page, `/workflows/${DEV_TEAM}`);
  const baseline = dryRunCount();
  try {
    await stopHelper(pid as number);
    await clickAndExpectHelperMissingDialog(page, LEAD_TERMINAL_LABEL, command, "03 팀장 호출");
    await expectNoDryRunLine(baseline);
    await copyFromDialogAndClose(page, command);
  } finally {
    await resumeHelper(pid as number, state.helperUrl, state.baseUrl);
  }

  const afterResume = dryRunCount();
  await page.getByRole("button", { name: LEAD_TERMINAL_LABEL, exact: true }).click();
  await expectDryRunLineAdded(afterResume, wtDryRunLine(state.fixtureDir, DEV_LEAD));
});

test("[FR-013-AC9][FR-013-AC10][FR-013-E1][E2E-23] 도우미 정지 → 07 `열기 도우미` `미설치 · helper/windows/install.ps1로 설치`, `테스트로 열기`는 안내 후 비활성 `도우미 미설치`", async ({
  page,
}) => {
  const state = readE2eState();
  const command = wslDefaultCommand(state.fixtureDir);
  const pid = state.helperPid;
  expect(pid, ".e2e-state.json에 helperPid가 없습니다").not.toBeNull();

  await gotoReady(page, "/settings");
  const helperRow = rowValue(card(page, "Claude 열기"), "열기 도우미");
  await expect(helperRow).toContainText(helperInstalledPattern());
  const testOpen = page.getByRole("button", { name: TEST_OPEN_LABEL, exact: true });
  await expect(testOpen).toBeEnabled();

  const baseline = dryRunCount();
  try {
    await stopHelper(pid as number);
    await clickAndExpectHelperMissingDialog(page, TEST_OPEN_LABEL, command, "07 테스트로 열기");
    await expectNoDryRunLine(baseline);
    await copyFromDialogAndClose(page, command);

    await expect(helperRow).toContainText(HELPER_MISSING_ROW_TEXT_WSL);
    await expect(helperRow).not.toContainText("helper/install.sh");
    await expect(testOpen).toBeDisabled();
    await expect(testOpen.locator("xpath=..").getByText(HELPER_MISSING_REASON, { exact: true })).toBeVisible();

    // 07을 다시 열어도(정지 유지) 같은 안내다.
    await gotoReady(page, "/settings");
    await expect(rowValue(card(page, "Claude 열기"), "열기 도우미")).toContainText(HELPER_MISSING_ROW_TEXT_WSL, {
      timeout: HELPER_TIMEOUT_BUDGET_MS,
    });
    await expect(page.getByRole("button", { name: TEST_OPEN_LABEL, exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: COPY_COMMAND_LABEL, exact: true })).toBeEnabled();
  } finally {
    await resumeHelper(pid as number, state.helperUrl, state.baseUrl);
  }

  // 원복 확인: 설치됨으로 돌아오고 `테스트로 열기`가 Windows dry-run 줄을 남긴다.
  await gotoReady(page, "/settings");
  await expect(rowValue(card(page, "Claude 열기"), "열기 도우미")).toContainText(helperInstalledPattern(), {
    timeout: HELPER_TIMEOUT_BUDGET_MS,
  });
  const afterResume = dryRunCount();
  await page.getByRole("button", { name: TEST_OPEN_LABEL, exact: true }).click();
  await expectDryRunLineAdded(afterResume, wtDryRunLine(state.fixtureDir, null));
});
