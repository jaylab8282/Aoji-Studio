// E2E-09 터미널 열기 (architecture.md §8.2 E2E-09 행).
// fixture: `project-configured` (워크플로우 dev-team[팀장 dev-lead]·ops-team[팀장 ops-lead]).
// 검증 ID: FR-013-AC1·AC2·AC4·AC6·AC9·AC10·E1·E2·E4.
//
// 확인하는 것
//  1. 02 `Claude 열기 · 기본 세션` → dry-run 도우미 stdout에 `DRY-RUN cd "<fixture>" && claude` 1줄(FR-013-AC1).
//  2. 03 `팀장 호출 · 터미널 열기` → `… && claude --agent <lead>` 1줄(FR-013-AC2).
//  3. 두 호출이 브라우저 → 도우미 직접 호출이고 본문이 `target`(+`leadName`)뿐이다(FR-013-AC6).
//  4. 도우미가 2초 안에 응답하지 않으면 02·07에 미설치 안내 + 명령 + `명령 복사`(FR-013-AC9·E1),
//     07 `테스트로 열기`는 진입 시·누를 때 확인해 비활성 `도우미 미설치`가 된다(FR-013-AC10).
//  5. 브라우저가 받는 도우미 토큰이 도우미의 토큰과 다르면 403 → 인라인 확정 문구(FR-013-E2).
//  6. 팀장 없는 워크플로우의 03은 `팀장 호출`이 비활성 + `팀장 없음`(FR-013-AC4).
//  7. 팀장 정의 파일이 사라지면 도우미를 호출하지 않고 화면이 갱신된다(FR-013-E4. 아래 "E4의 범위" 참고).
//
// 목킹 없음(conventions.md §8): 실제 컨테이너·실제 dry-run 도우미(터미널만 dry-run)·실제 fixture 파일만 쓴다.
// `page.route` 가로채기 없음. 주소·포트 literal 없음 — 모두 `.e2e-state.json`(`readE2eState()`)에서 읽는다.
//
// ── 하네스 소유 자원을 건드리는 두 케이스 (globalSetup이 도우미를 소유한다) ─────────────────────
// (a) "도우미 정지": `state.helperPid`에 **SIGSTOP → SIGCONT**를 보낸다. 프로세스가 살아 있어 4191
//     리스너와 로그 파일(`helperDryRunLines()`의 근거)이 그대로 유지되므로, 재기동 없이 원상 복구된다.
//     `startBackgroundProcess`는 로그를 `"w"`(잘라내기)로 열기 때문에 종료 후 재기동하면 이전 `DRY-RUN`
//     줄이 사라져 앞 테스트의 근거가 깨진다 — 그래서 재기동 방식을 쓰지 않는다.
//     SIGSTOP은 연결은 되지만 응답이 없는 상태이고, 이것이 FR-013-AC9가 값까지 확정한
//     "2초 안에 응답하지 않으면"·FR-013-AC10 "응답하지 않으면"에 그대로 해당한다. 프론트 판정 코드도
//     연결 거부와 타임아웃을 구분하지 않는다(`frontend/src/api/helper.ts` `fetchWithTimeout`: 예외·타임아웃
//     모두 `null` → `no-response`). ui-spec.md SCR-02 에러 열도 `도우미 무응답(2초)`로 적는다.
// (b) "잘못된 토큰 파일": 도우미는 토큰 파일을 **기동 시 1회만** 읽는다(`helper/aojistudio-helper.mjs`의
//     `main()` → `ensureTokenFile`). 반면 서버는 요청마다 파일을 읽어 브라우저에 준다
//     (`backend/.../api/HelperTokenController.java`의 `getToken`). 그래서 토큰 파일만 바꾸면
//     **브라우저가 보내는 토큰이 도우미의 토큰과 달라져** 도우미가 403 `UNAUTHORIZED_TOKEN`을 낸다.
//     도우미를 다시 띄우지 않아도 되고, 파일을 되돌리면 그대로 복구된다.
//
// 두 케이스 모두 `try/finally`로 원복하고, 원복됐음을 **그 테스트 안에서 단언**한다(뒤 spec·다음 배치가
// 같은 도우미·같은 토큰 파일을 쓴다).
//
// ── E4의 범위 (구현을 읽고 확인한 사실) ────────────────────────────────────────────────────
// FR-013-E4의 인라인 문구 `팀장이 없습니다`는 `workflow.lead !== null`인데 `registry.agents`에 그 팀장이
// 없을 때만 나온다(`screens/workflow-detail/Header.tsx:48-53`). 그런데 두 값은 **같은 스냅샷**에서 오고
// (`WorkflowDetailScreen.tsx:55-60`), 서버는 정의 파일이 없는 lead를 깨진 참조로 보고 `lead`를 null로
// 내린다(`backend/.../registry/WorkflowConfigStore.java:385-392`). 따라서 화면을 거쳐서는 그 분기에 닿을 수
// 없고, 실제로 일어나는 일은 "호출하지 않고 화면이 갱신된다"다. 이 spec은 그 관찰 가능한 결과(도우미 호출 0건
// + 버튼 비활성 + `팀장 없음`)를 단언한다. 인라인 문구 자체는 프론트 단위 테스트가 덮는다
// (`frontend/src/screens/workflow-detail/Header.test.tsx:246`).
import { execFileSync } from "node:child_process";

import { expect, test, type Page, type Request } from "@playwright/test";

import { helperDryRunLines, readE2eState } from "../lib/e2e-state";
import { delay, httpGet, isProcessAlive, listPortListeners } from "../lib/harness-utils";
import {
  SETUP_REFLECT_TIMEOUT_MS,
  addWorkflowViaUi,
  agentFile,
  fixturePathExists,
  gotoReady,
  readFixtureFile,
  removeFixturePath,
  writeFixtureFile,
} from "./ui-helpers";

/** `frontend/src/api/helper.ts` `HELPER_TIMEOUT_MS`. FR-013-AC9·AC10이 값까지 확정한 대기 한도. */
const HELPER_TIMEOUT_MS = 2000;

/**
 * 무응답 안내가 나타나기까지 허용하는 상한. 2초 타임아웃 + 렌더 여유이며, 타임아웃이 걸리지 않고
 * 무한정 기다리는 회귀를 잡기 위한 값이다(고정 대기가 아니라 실측값에 대한 단언이다).
 */
const HELPER_TIMEOUT_BUDGET_MS = 6000;

/** "도우미를 호출하지 않았다"를 확인하는 창(루프백 왕복 수 ms보다 충분히 길다). */
const NO_CALL_WINDOW_MS = 500;

/** fixture `project-configured`의 워크플로우·팀장(정의 파일과 구성 파일에 들어 있는 값). */
const DEV_TEAM = "dev-team";
const DEV_LEAD = "dev-lead";

/** 이 spec이 UI로 만드는 팀장 없는 워크플로우(FR-008-AC2 이름 규칙 `^[가-힣A-Za-z0-9 _-]+$`). */
const NO_LEAD_WORKFLOW = "e2e09-팀장없음";

/**
 * 도우미 토큰 파일에 잠시 써 넣는 다른 토큰(hex 64자). 하네스 placeholder(`e2e0fee1`×8)와 다른 값이라
 * 도우미가 기동 시 읽은 토큰과 불일치한다. 난수를 쓰지 않아 실패 로그가 재현 가능하다.
 */
const MISMATCHED_HELPER_TOKEN = "e2e09bad".repeat(8);

// ui-spec.md §공통 `HelperMissingDialog` / SCR-02·SCR-03·SCR-07 확정 문구.
const HELPER_MISSING_TITLE = "열기 도우미가 응답하지 않습니다";
const HELPER_MISSING_BODY = "helper/install.sh로 설치한 뒤 다시 시도하세요";
const COPY_COMMAND_LABEL = "명령 복사";
const CLOSE_LABEL = "닫기";
const HELPER_AUTH_FAILED_TEXT = "도우미 인증 실패 · 도우미를 다시 설치하세요";
const HELPER_MISSING_REASON = "도우미 미설치";
const HELPER_MISSING_ROW_TEXT = "미설치 · helper/install.sh로 설치";
const NO_LEAD_TEXT = "팀장 없음";
const OPEN_DEFAULT_SESSION_LABEL = "Claude 열기 · 기본 세션";
const LEAD_TERMINAL_LABEL = "팀장 호출 · 터미널 열기";
const TEST_OPEN_LABEL = "테스트로 열기 (도우미 설치 후)";

// 도우미 정지·토큰 교체는 프로세스·파일 상태를 공유한다. 파일 안 실행 순서를 고정해 원복 순서를 보장한다.
test.describe.configure({ mode: "serial" });

// ── 명령 문자열 (FR-013-AC1·AC2. 도우미 `buildCommand`와 같은 형식) ─────────────────────────

function defaultSessionCommand(projectDir: string): string {
  return `cd "${projectDir}" && claude`;
}

function leadSessionCommand(projectDir: string, leadName: string): string {
  return `${defaultSessionCommand(projectDir)} --agent ${leadName}`;
}

// ── 도우미 stdout(`DRY-RUN …`) ────────────────────────────────────────────────────────────

/** 지금까지 쌓인 `DRY-RUN` 줄 수. 테스트는 이 값 기준으로 증분만 본다. */
function dryRunCount(): number {
  return helperDryRunLines().length;
}

/** `DRY-RUN` 줄이 정확히 1줄 늘고 그 줄이 기대한 명령인지 확인한다(폴링. 고정 대기 없음). */
async function expectDryRunLineAdded(baseline: number, command: string): Promise<void> {
  await expect
    .poll(() => helperDryRunLines().slice(baseline), {
      message: `도우미 stdout에 'DRY-RUN ${command}' 한 줄이 추가되지 않았습니다`,
      timeout: SETUP_REFLECT_TIMEOUT_MS,
    })
    .toEqual([`DRY-RUN ${command}`]);
}

/**
 * 도우미 호출이 아예 없었음을 확인한다(FR-013-AC4·E2·E4: 실행하지 않는다).
 * "일어나지 않았다"는 단언이므로 폴링할 조건이 없다. 도우미 왕복은 루프백에서 수 ms이므로
 * 그보다 충분히 긴 확인 창을 둔 뒤 증분 0을 본다. 각 테스트는 이어서 **실제 호출 한 번**을
 * `expectDryRunLineAdded`로 확인해, 늦게 도착한 줄이 있으면 그 단언에서 드러나게 한다.
 */
async function expectNoDryRunLine(baseline: number): Promise<void> {
  await delay(NO_CALL_WINDOW_MS);
  expect(helperDryRunLines().slice(baseline), "도우미가 호출되지 않아야 하는데 DRY-RUN 줄이 생겼습니다").toEqual(
    [],
  );
}

// ── 도우미 `POST /open` 요청 관찰 (FR-013-AC6) ─────────────────────────────────────────────

type OpenRequestLog = { origin: string; path: string; body: string | null };

/** 브라우저가 도우미로 보낸 `POST /open` 요청을 모은다(가로채지 않고 관찰만 한다). */
function recordOpenRequests(page: Page, helperUrl: string): OpenRequestLog[] {
  const logs: OpenRequestLog[] = [];
  page.on("request", (request: Request) => {
    const url = new URL(request.url());
    if (url.origin === helperUrl && request.method() === "POST") {
      logs.push({ origin: url.origin, path: url.pathname, body: request.postData() });
    }
  });
  return logs;
}

/** 기록된 `POST /open` 요청이 정확히 하나인지 확인하고 그 하나를 돌려준다. */
function onlyOpenRequest(logs: OpenRequestLog[]): OpenRequestLog {
  expect(logs, "브라우저가 도우미 /open을 직접 호출한 기록이 하나가 아닙니다").toHaveLength(1);
  const [log] = logs;
  if (log === undefined) {
    throw new Error("도우미 /open 요청 기록이 없습니다");
  }
  return log;
}

/**
 * 본문이 `target`(+`leadName`)뿐인지 확인한다 — 경로·명령·옵션을 보내지 않는다(FR-013-AC6).
 * 키 집합과 값을 모두 보고, 원문 문자열에 경로·명령 조각이 없는지도 확인한다.
 */
function expectOpenRequestBody(
  log: OpenRequestLog,
  expected: { target: "default" } | { target: "lead"; leadName: string },
  projectDir: string,
): void {
  expect(log.path).toBe("/open");
  expect(log.body, "도우미 POST 본문이 비어 있습니다").not.toBeNull();
  const raw = log.body ?? "";
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  expect(parsed).toEqual(expected);
  expect(Object.keys(parsed).sort()).toEqual(Object.keys(expected).sort());
  expect(raw, "요청 본문에 프로젝트 경로가 들어 있습니다(FR-013-AC6)").not.toContain(projectDir);
  expect(raw, "요청 본문에 명령 문자열이 들어 있습니다(FR-013-AC6)").not.toContain("claude");
  expect(raw, "요청 본문에 옵션이 들어 있습니다(FR-013-AC6)").not.toContain("--agent");
}

// ── 도우미 프로세스 제어 (하네스가 띄운 pid를 잠시 멈췄다 되돌린다) ──────────────────────────

function signalProcessGroup(pid: number, signalName: "SIGSTOP" | "SIGCONT"): void {
  try {
    // globalSetup이 detached로 띄웠으므로 그룹에 보낸다(실패하면 프로세스 하나에).
    process.kill(-pid, signalName);
  } catch {
    process.kill(pid, signalName);
  }
}

/** `ps`가 보고하는 프로세스 상태 문자(정지 = `T`로 시작). */
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

/** 도우미를 정지시키고 실제로 정지됐는지 확인한다(응답이 오지 않는 상태). */
async function stopHelper(pid: number): Promise<void> {
  expect(isProcessAlive(pid), `도우미 pid ${pid}가 살아 있지 않습니다`).toBe(true);
  signalProcessGroup(pid, "SIGSTOP");
  await expect
    .poll(() => processState(pid), { message: "도우미가 정지 상태(T)로 바뀌지 않았습니다", timeout: 5000 })
    .toMatch(/^T/);
}

/** 도우미를 되돌리고 같은 포트에서 다시 응답하는지·리스너가 같은 pid인지 확인한다. */
async function resumeHelper(pid: number, helperUrl: string, baseUrl: string): Promise<void> {
  signalProcessGroup(pid, "SIGCONT");
  await expect
    .poll(() => processState(pid), { message: "도우미가 실행 상태로 돌아오지 않았습니다", timeout: 5000 })
    .not.toMatch(/^T/);
  await expect
    .poll(
      async () => {
        try {
          // 도우미 `/health`는 Origin 검사를 하므로 허용 Origin을 붙인다(FR-013-AC7).
          return (await httpGet(`${helperUrl}/health`, { Origin: baseUrl })).status;
        } catch {
          return 0;
        }
      },
      { message: "도우미 /health가 200을 돌려주지 않습니다(복구 실패)", timeout: 10_000 },
    )
    .toBe(200);
  // 되돌린 뒤에도 그 포트를 듣고 있는 프로세스가 하네스가 띄운 도우미 하나뿐이어야 한다.
  const port = Number(new URL(helperUrl).port);
  expect(
    listPortListeners(port),
    `도우미 포트(${port}) 리스너가 하네스가 띄운 pid ${pid} 하나가 아닙니다`,
  ).toEqual([pid]);
}

// ── 무응답 안내(`HelperMissingDialog`) ─────────────────────────────────────────────────────

/**
 * 버튼을 누른 순간부터 무응답 안내가 뜰 때까지 **실제 경과 시간**을 재고 문구·명령·버튼을 단언한다
 * (FR-013-AC9·E1). 고정 대기 없이 `expect` 폴링만 쓴다.
 */
async function clickAndExpectHelperMissingDialog(
  page: Page,
  buttonName: string,
  command: string,
  label: string,
): Promise<number> {
  const startedAt = Date.now();
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: HELPER_MISSING_TITLE });
  await expect(dialog).toBeVisible({ timeout: HELPER_TIMEOUT_BUDGET_MS });
  const elapsedMs = Date.now() - startedAt;

  await expect(dialog.getByRole("heading", { name: HELPER_MISSING_TITLE, exact: true })).toBeVisible();
  await expect(dialog.getByText(HELPER_MISSING_BODY, { exact: true })).toBeVisible();
  // 선택한 항목의 명령이 그대로 보인다(FR-013-AC9 "선택한 항목의 명령과 함께").
  await expect(dialog).toContainText(command);
  await expect(dialog.getByRole("button", { name: COPY_COMMAND_LABEL, exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: CLOSE_LABEL, exact: true })).toBeEnabled();

  test.info().annotations.push({
    type: "FR-013-AC9 무응답 판정 시간",
    description: `${label}: ${elapsedMs}ms (도우미 타임아웃 ${HELPER_TIMEOUT_MS}ms, 상한 ${HELPER_TIMEOUT_BUDGET_MS}ms)`,
  });
  expect(
    elapsedMs,
    `${label}: 2초 타임아웃 전에 안내가 떴습니다(${elapsedMs}ms). 도우미 응답을 기다리지 않았습니다`,
  ).toBeGreaterThanOrEqual(HELPER_TIMEOUT_MS);
  expect(
    elapsedMs,
    `${label}: 무응답 안내가 ${HELPER_TIMEOUT_BUDGET_MS}ms 안에 뜨지 않았습니다(${elapsedMs}ms)`,
  ).toBeLessThanOrEqual(HELPER_TIMEOUT_BUDGET_MS);
  return elapsedMs;
}

// ── 테스트 ────────────────────────────────────────────────────────────────────────────────

test('[FR-013-AC1][FR-013-AC6][E2E-09] 02 `Claude 열기 · 기본 세션` → 도우미에 {target:"default"}만 보내고 stdout에 `DRY-RUN cd "<fixture>" && claude` 1줄이 남는다', async ({
  page,
}) => {
  const state = readE2eState();
  const command = defaultSessionCommand(state.fixtureDir);
  const openRequests = recordOpenRequests(page, state.helperUrl);

  await gotoReady(page, "/workflows");
  const button = page.getByRole("button", { name: OPEN_DEFAULT_SESSION_LABEL, exact: true });
  // 첫 스냅샷을 받은 뒤이므로 활성이다(ADR-44: 값이 오기 전에는 비활성).
  await expect(button).toBeEnabled();

  const baseline = dryRunCount();
  await button.click();

  await expectDryRunLineAdded(baseline, command);

  // 204이므로 안내·에러 표시가 없고 화면도 이동하지 않는다(ui-spec SCR-02 클릭 시 동작).
  await expect(page.getByRole("dialog", { name: HELPER_MISSING_TITLE })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/workflows");

  // FR-013-AC6: 브라우저가 도우미를 직접 호출하고, 본문은 `target`뿐이다.
  const openRequest = onlyOpenRequest(openRequests);
  expect(openRequest.origin).toBe(state.helperUrl);
  expectOpenRequestBody(openRequest, { target: "default" }, state.fixtureDir);
});

test('[FR-013-AC2][FR-013-AC6][E2E-09] 03 `팀장 호출 · 터미널 열기` → {target:"lead",leadName}만 보내고 stdout에 `--agent <lead>`가 붙은 명령이 남는다', async ({
  page,
}) => {
  const state = readE2eState();
  const command = leadSessionCommand(state.fixtureDir, DEV_LEAD);
  const openRequests = recordOpenRequests(page, state.helperUrl);

  await gotoReady(page, `/workflows/${DEV_TEAM}`);
  const button = page.getByRole("button", { name: LEAD_TERMINAL_LABEL, exact: true });
  await expect(button).toBeEnabled();

  const baseline = dryRunCount();
  await button.click();

  await expectDryRunLineAdded(baseline, command);
  await expect(page.getByRole("dialog", { name: HELPER_MISSING_TITLE })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(`/workflows/${DEV_TEAM}`);

  const openRequest = onlyOpenRequest(openRequests);
  expect(openRequest.origin).toBe(state.helperUrl);
  expectOpenRequestBody(openRequest, { target: "lead", leadName: DEV_LEAD }, state.fixtureDir);
});

test("[FR-013-AC4][E2E-09] 팀장 없는 워크플로우의 03 → `팀장 호출 · 터미널 열기` 비활성 + `팀장 없음`, 도우미 호출 0건", async ({
  page,
}) => {
  const state = readE2eState();

  await gotoReady(page, "/workflows");
  await addWorkflowViaUi(page, NO_LEAD_WORKFLOW);

  await gotoReady(page, `/workflows/${encodeURIComponent(NO_LEAD_WORKFLOW)}`);
  const baseline = dryRunCount();

  const button = page.getByRole("button", { name: LEAD_TERMINAL_LABEL, exact: true });
  await expect(button).toBeDisabled();
  // 비활성 이유가 버튼 옆에 보인다(ui-spec SCR-03 `lead === null` → 비활성 + `팀장 없음`, ADR-35).
  await expect(button.locator("xpath=..").getByText(NO_LEAD_TEXT, { exact: true })).toBeVisible();

  // 비활성이므로 눌러도 도우미가 호출되지 않는다(force click으로 확인한다).
  await button.click({ force: true });
  await expectNoDryRunLine(baseline);
  await expect(page.getByRole("dialog", { name: HELPER_MISSING_TITLE })).toHaveCount(0);

  // 배리어: 같은 브라우저·같은 도우미로 팀장이 있는 03에서 한 번 호출하면, baseline 이후의 줄은
  // 그 호출 한 줄뿐이어야 한다(위 force click이 아무 것도 보내지 않았다는 증거).
  await gotoReady(page, `/workflows/${DEV_TEAM}`);
  await page.getByRole("button", { name: LEAD_TERMINAL_LABEL, exact: true }).click();
  await expectDryRunLineAdded(baseline, leadSessionCommand(state.fixtureDir, DEV_LEAD));
});

test("[FR-013-AC9][FR-013-AC10][FR-013-E1][E2E-09] 도우미 정지 → 07 `열기 도우미` 미설치 표시, `테스트로 열기`는 누를 때 확인해 안내 후 비활성 `도우미 미설치`", async ({
  page,
}) => {
  const state = readE2eState();
  const command = defaultSessionCommand(state.fixtureDir);
  const helperPid = state.helperPid;
  expect(helperPid, ".e2e-state.json에 helperPid가 없습니다").not.toBeNull();
  const pid = helperPid as number;

  // 정지 전: 응답하는 도우미이므로 `설치됨 · 응답 확인 hh:mm:ss` + `테스트로 열기` 활성(FR-013-AC10 진입 확인).
  await gotoReady(page, "/settings");
  const helperRow = page.getByTestId("settings-row-helper");
  await expect(helperRow).toContainText(/설치됨 · 응답 확인 \d{2}:\d{2}:\d{2}/);
  const testOpenButton = page.getByRole("button", { name: TEST_OPEN_LABEL, exact: true });
  await expect(testOpenButton).toBeEnabled();

  const baseline = dryRunCount();
  try {
    await stopHelper(pid);

    // FR-013-AC10 "버튼을 누를 때 확인": 누른 시점의 `GET /health`가 2초 안에 응답하지 않으므로
    // 도우미를 호출하지 않고 미설치 안내를 띄운다(FR-013-AC9·E1).
    await clickAndExpectHelperMissingDialog(page, TEST_OPEN_LABEL, command, "07 테스트로 열기");
    await expectNoDryRunLine(baseline);

    // `명령 복사`가 기본 세션 명령을 그대로 복사한다(FR-013-AC9 "명령 복사").
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const dialog = page.getByRole("dialog", { name: HELPER_MISSING_TITLE });
    await dialog.getByRole("button", { name: COPY_COMMAND_LABEL, exact: true }).click();
    await expect(dialog.getByRole("button", { name: "복사됨", exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);

    await dialog.getByRole("button", { name: CLOSE_LABEL, exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // 결과가 무응답이므로 행이 미설치로 바뀌고 버튼이 비활성 + `도우미 미설치`가 된다(ui-spec SCR-07 에러 열).
    await expect(helperRow).toContainText(HELPER_MISSING_ROW_TEXT);
    await expect(testOpenButton).toBeDisabled();
    await expect(
      testOpenButton.locator("xpath=..").getByText(HELPER_MISSING_REASON, { exact: true }),
    ).toBeVisible();

    // FR-013-AC10 "07을 열 때 확인": 정지된 상태로 다시 들어가도 미설치 + 비활성이다.
    await gotoReady(page, "/settings");
    await expect(page.getByTestId("settings-row-helper")).toContainText(HELPER_MISSING_ROW_TEXT, {
      timeout: HELPER_TIMEOUT_BUDGET_MS,
    });
    const reopened = page.getByRole("button", { name: TEST_OPEN_LABEL, exact: true });
    await expect(reopened).toBeDisabled();
    await expect(
      reopened.locator("xpath=..").getByText(HELPER_MISSING_REASON, { exact: true }),
    ).toBeVisible();
    // `명령 복사`는 `GET /api/settings` 값이 왔으므로 활성이다(비활성 조건은 값 미수신뿐, ADR-44).
    await expect(page.getByRole("button", { name: COPY_COMMAND_LABEL, exact: true })).toBeEnabled();
  } finally {
    await resumeHelper(pid, state.helperUrl, state.baseUrl);
  }

  // 원복 확인: 07을 다시 열면 설치됨으로 돌아오고 `테스트로 열기`가 실제로 도우미를 호출한다.
  await gotoReady(page, "/settings");
  await expect(page.getByTestId("settings-row-helper")).toContainText(
    /설치됨 · 응답 확인 \d{2}:\d{2}:\d{2}/,
    { timeout: HELPER_TIMEOUT_BUDGET_MS },
  );
  const afterResume = dryRunCount();
  await page.getByRole("button", { name: TEST_OPEN_LABEL, exact: true }).click();
  await expectDryRunLineAdded(afterResume, command);
});

test("[FR-013-AC9][FR-013-E1][E2E-09] 도우미 정지 → 02 `Claude 열기 · 기본 세션`이 2초 뒤 미설치 안내 + 기본 세션 명령 + `명령 복사`", async ({
  page,
}) => {
  const state = readE2eState();
  const command = defaultSessionCommand(state.fixtureDir);
  const pid = state.helperPid as number;
  expect(pid, ".e2e-state.json에 helperPid가 없습니다").not.toBeNull();

  await gotoReady(page, "/workflows");
  const baseline = dryRunCount();

  try {
    await stopHelper(pid);
    await clickAndExpectHelperMissingDialog(page, OPEN_DEFAULT_SESSION_LABEL, command, "02 Claude 열기");
    // 도우미가 명령을 받지 못했다(정지 중이므로 stdout에 줄이 없다).
    await expectNoDryRunLine(baseline);
    // 화면은 이동하지 않는다(ui-spec SCR-02).
    expect(new URL(page.url()).pathname).toBe("/workflows");
  } finally {
    await resumeHelper(pid, state.helperUrl, state.baseUrl);
  }

  // 원복 확인: 안내를 닫고 다시 누르면 도우미가 명령을 받는다.
  await page
    .getByRole("dialog", { name: HELPER_MISSING_TITLE })
    .getByRole("button", { name: CLOSE_LABEL, exact: true })
    .click();
  const afterResume = dryRunCount();
  await page.getByRole("button", { name: OPEN_DEFAULT_SESSION_LABEL, exact: true }).click();
  await expectDryRunLineAdded(afterResume, command);
});

test("[FR-013-E2][E2E-09] 잘못된 토큰 파일 → 도우미가 403으로 거부, 02에 `도우미 인증 실패 · 도우미를 다시 설치하세요`", async ({
  page,
}) => {
  const state = readE2eState();
  const command = defaultSessionCommand(state.fixtureDir);
  const originalToken = readFixtureFile(state.helperTokenFile);
  expect(originalToken.trim(), "하네스 토큰과 교체 토큰이 같으면 403이 나지 않습니다").not.toBe(
    MISMATCHED_HELPER_TOKEN,
  );

  const openStatuses: number[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === state.helperUrl && url.pathname === "/open") {
      openStatuses.push(response.status());
    }
  });

  await gotoReady(page, "/workflows");
  const button = page.getByRole("button", { name: OPEN_DEFAULT_SESSION_LABEL, exact: true });
  const baseline = dryRunCount();

  try {
    // 서버는 요청마다 토큰 파일을 읽어 브라우저에 준다. 도우미는 기동 시 읽은 토큰과 비교한다.
    writeFixtureFile(state.helperTokenFile, MISMATCHED_HELPER_TOKEN);

    await button.click();
    // FR-013-E2 확정 문구가 버튼 옆 인라인으로 나온다(ui-spec SCR-02 에러 열).
    await expect(page.getByRole("alert")).toHaveText(HELPER_AUTH_FAILED_TEXT);
    // 미설치 안내(무응답)로 처리하지 않는다 — 도우미는 응답했다.
    await expect(page.getByRole("dialog", { name: HELPER_MISSING_TITLE })).toHaveCount(0);
    await expectNoDryRunLine(baseline);
    expect(openStatuses, "도우미 /open이 403을 돌려주지 않았습니다").toContain(403);
  } finally {
    writeFixtureFile(state.helperTokenFile, originalToken);
  }

  // 원복 확인: 같은 버튼이 다시 성공해 도우미가 명령을 받는다.
  const afterRestore = dryRunCount();
  await button.click();
  await expectDryRunLineAdded(afterRestore, command);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("[FR-013-E4][E2E-09] 팀장 정의 파일이 사라지면 도우미를 호출하지 않고 03이 갱신된다(`팀장 호출` 비활성 + `팀장 없음`)", async ({
  page,
}) => {
  const state = readE2eState();
  const leadFile = agentFile(DEV_LEAD);
  const originalDefinition = readFixtureFile(leadFile);

  await gotoReady(page, `/workflows/${DEV_TEAM}`);
  const button = page.getByRole("button", { name: LEAD_TERMINAL_LABEL, exact: true });
  await expect(button).toBeEnabled();
  const baseline = dryRunCount();

  try {
    // 정의 파일이 사라지면 서버가 깨진 참조로 보고 `lead`를 null로 내리므로, 화면이 갱신되어
    // 버튼이 비활성 + `팀장 없음`이 된다(FR-013-E4 "실행하지 않고 … 화면 갱신").
    removeFixturePath(leadFile);
    expect(fixturePathExists(leadFile)).toBe(false);

    await expect(button).toBeDisabled({ timeout: SETUP_REFLECT_TIMEOUT_MS });
    await expect(button.locator("xpath=..").getByText(NO_LEAD_TEXT, { exact: true })).toBeVisible();

    // 이 상태에서 눌러도 도우미를 호출하지 않는다.
    await button.click({ force: true });
    await expectNoDryRunLine(baseline);
    await expect(page.getByRole("dialog", { name: HELPER_MISSING_TITLE })).toHaveCount(0);
  } finally {
    writeFixtureFile(leadFile, originalDefinition);
  }

  // 원복 확인: 정의 파일이 돌아오면 버튼이 다시 활성이 되고 팀장 명령이 도우미로 간다.
  await expect(button).toBeEnabled({ timeout: SETUP_REFLECT_TIMEOUT_MS });
  const afterRestore = dryRunCount();
  await button.click();
  await expectDryRunLineAdded(afterRestore, leadSessionCommand(state.fixtureDir, DEV_LEAD));
});
