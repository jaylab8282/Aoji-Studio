// E2E-22: 상태줄 연동(T-R4-18, 배치 13). fixture: `project-usage` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-basic`(architecture §8.2 배치 13).
// 검증 ID: FR-027-AC1(토큰 없는 전송 401)·AC2(서버 정지 상태 실행 시간 < 500ms·같은 값은 60초 안에 다시 보내지 않음)·AC3(쓰던 명령 출력 그대로·없으면 출력 없음)·
// AC4(한도 캐시가 더 최근이면 `한도 캐시`)·AC8(2초 반영), FR-027-E2(한도 필드 없음 → `값 없음`)·E3(형식 오류 → 저장 안 함·204·로그 사유만), FR-014-AC6(07 예시 명령으로 실행 → 수집).
//
// **컨테이너가 기동 때 배치한 `<fixture>/.aojistudio/statusline.mjs`를 그대로 실행한다**(스크립트 사본을 따로 두지 않는다). 입력은 `tools/fixtures/statusline/*.json`.
// 스크립트의 마지막-전송 상태 파일은 `os.tmpdir()`(= `TMPDIR`) 아래에 있어 실행마다 새 임시 폴더를 `TMPDIR`로 줘 서로의 60초 중복 판정에 영향을 주지 않는다
// (같은 값 재전송 테스트만 폴더를 공유한다).
// e2e-21(비용)이 파일 이름순으로 먼저 돈다(한도 카드는 그때 한도 캐시 값). 이 spec의 마지막 테스트가 컨테이너를 `pause`했다 `unpause`한다(finally) — 배치 13의 마지막 파일이다.
// 목킹 없음(conventions §8).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { FIXTURES_DIR, readE2eState } from "../lib/e2e-state";
import { containerLogs, ensureUnpaused, pauseContainer } from "./container-helpers";
import { limitSegments, limitsText, percentPattern, readLimitSegments } from "./cost-helpers";
import { gotoReady, measureFileChangeReflection } from "./ui-helpers";

test.describe.configure({ mode: "serial" });

// ── 상태줄 입력 fixture·실행 도우미 ──────────────────────────────────────────────

const STATUSLINE_DIR = join(FIXTURES_DIR, "statusline");
const readInputText = (name: string): string => readFileSync(join(STATUSLINE_DIR, name), "utf8");
const FULL_INPUT = readInputText("full.json");
const FULL = JSON.parse(FULL_INPUT) as {
  workspace: { current_dir: string };
  rate_limits: { five_hour: { used_percentage: number; resets_at: number }; seven_day: { used_percentage: number; resets_at: number } };
};
/** `AOJI-MARKER-STATUS-3b1e`: 전송 대상이 아닌 입력 값에 심은 표지(ADR-83 — 세 가지 값만 보낸다). */
const STATUS_MARKER = "AOJI-MARKER-STATUS-3b1e";
/** 2099-01-01·2099-01-08(에포크 초) — 초기화 시각이 지나지 않은 값. */
const RESETS_FIVE = FULL.rate_limits.five_hour.resets_at;
const RESETS_WEEK = FULL.rate_limits.seven_day.resets_at;

/** 쓰던 상태줄 명령 대역: 입력을 끝까지 읽은 뒤 고정 글자를 낸다. */
const FIXED_OUTPUT = "E2E-22 쓰던 상태줄 출력";
const FIXED_OUTPUT_SCRIPT = `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(FIXED_OUTPUT)}));`;
/** 쓰던 상태줄 명령 대역: 받은 입력의 `workspace.current_dir`를 그대로 낸다(같은 입력이 넘어갔는지 확인). */
const CURRENT_DIR_SCRIPT =
  "let d='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).workspace.current_dir));";

const tempDirs: string[] = [];

function newTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "aojistudio-e2e-22-"));
  tempDirs.push(dir);
  return dir;
}

function scriptPath(): string {
  return join(readE2eState().fixtureDir, ".aojistudio", "statusline.mjs");
}

function statuslineUrl(): string {
  return `${readE2eState().baseUrl}/hooks/statusline`;
}

interface RunResult {
  stdout: string;
  stderr: string;
  status: number | null;
  elapsedMs: number;
}

/** 상태줄 입력을 stdin으로 주고 배치된 스크립트를 실제로 실행한다. `command`가 있으면 `--` 뒤 인자 배열(쓰던 명령)이다. */
function runStatusline(options: { input: string; command?: string[]; tmp?: string }): RunResult {
  const args = [scriptPath(), "--url", statuslineUrl()];
  if (options.command !== undefined) {
    args.push("--", ...options.command);
  }
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, args, {
    input: options.input,
    encoding: "utf8",
    env: { ...process.env, TMPDIR: options.tmp ?? newTmp() },
    timeout: 15_000,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
    elapsedMs: performance.now() - startedAt,
  };
}

/** 구독 플랜·5시간·주간 사용률(초기화는 먼 미래)만 가진 상태줄 입력 JSON. */
function statuslineInput(plan: string | null, five: number | null, week: number | null): string {
  const limits: Record<string, unknown> = {};
  if (five !== null) limits.five_hour = { used_percentage: five, resets_at: RESETS_FIVE };
  if (week !== null) limits.seven_day = { used_percentage: week, resets_at: RESETS_WEEK };
  const input: Record<string, unknown> = { session_id: "fixture-statusline-session", cwd: FULL.workspace.current_dir };
  if (plan !== null) input.subscription_type = plan;
  if (Object.keys(limits).length > 0) input.rate_limits = limits;
  return JSON.stringify(input);
}

// ── API 도우미 ───────────────────────────────────────────────────────────────────

interface LimitValue {
  state: "ok" | "missing" | "never";
  usedPercent: number | null;
  resetsAt: string | null;
  source: "statusline" | "cache" | null;
  receivedAt: string | null;
}

interface Limits {
  plan: { value: string | null; receivedAt: string | null };
  fiveHour: LimitValue;
  sevenDay: LimitValue;
  statuslineLastReceivedAt: string | null;
}

async function getText(request: APIRequestContext, path: string): Promise<string> {
  const { baseUrl } = readE2eState();
  const response = await request.get(`${baseUrl}${path}`, { headers: { Origin: baseUrl } });
  const text = await response.text();
  expect(response.status(), `${path}: ${text}`).toBe(200);
  return text;
}

async function getLimits(request: APIRequestContext): Promise<Limits> {
  return JSON.parse(await getText(request, "/api/limits")) as Limits;
}

async function postStatusline(
  request: APIRequestContext,
  body: unknown,
  headers: Record<string, string>,
): Promise<number> {
  const response = await request.post(statuslineUrl(), {
    headers: { "Content-Type": "application/json", ...headers },
    data: body,
  });
  return response.status();
}

/** 상태줄 값을 보내고(스크립트 실행) 서버가 그 사용률을 받을 때까지 기다린다. */
async function sendAndWait(request: APIRequestContext, plan: string, five: number, week: number): Promise<void> {
  runStatusline({ input: statuslineInput(plan, five, week) });
  await expect
    .poll(async () => {
      const limits = await getLimits(request);
      return `${limits.plan.value}|${limits.fiveHour.source}:${limits.fiveHour.usedPercent}|${limits.sevenDay.source}:${limits.sevenDay.usedPercent}`;
    })
    .toBe(`${plan}|statusline:${five}|statusline:${week}`);
}

function countOf(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** 10 한도 카드가 (플랜, 5시간 %, 주간 %)를 `상태줄`/`한도 캐시` 출처와 함께 보일 때까지 기다린다. */
async function expectCard(
  page: Page,
  expected: { plan: string; five: number; week: number; source: "상태줄" | "한도 캐시" },
): Promise<void> {
  await expect
    .poll(async () => {
      const segments = limitSegments(await limitsText(page));
      return (
        segments.plan.includes(expected.plan) &&
        percentPattern(expected.five).test(segments.five) &&
        segments.five.includes(expected.source) &&
        percentPattern(expected.week).test(segments.week) &&
        segments.week.includes(expected.source)
      );
    }, { timeout: 10_000, message: `한도 카드가 ${JSON.stringify(expected)}가 되지 않았습니다` })
    .toBe(true);
}

test.afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 테스트 ───────────────────────────────────────────────────────────────────────

test("[FR-027-AC1] 수집 토큰이 없거나 다른 전송은 401이고 저장하지 않는다", async ({ request }) => {
  expect(existsSync(scriptPath()), `서버가 기동 때 상태줄 스크립트를 배치해야 합니다: ${scriptPath()}`).toBe(true);
  const body = JSON.parse(statuslineInput("max", 37.5, 12.25));
  const before = await getText(request, "/api/limits");

  expect(await postStatusline(request, body, {}), "토큰 헤더 없음").toBe(401);
  expect(await postStatusline(request, body, { "X-AojiStudio-Collect-Token": "0".repeat(64) }), "다른 토큰").toBe(401);
  expect(await postStatusline(request, body, { "X-AojiStudio-Collect-Token": "" }), "빈 토큰").toBe(401);

  // 저장되지 않았다: 응답이 그대로(플랜·마지막 수신 시각 포함)
  expect(await getText(request, "/api/limits")).toBe(before);
  const limits = JSON.parse(before) as Limits;
  expect(limits.statuslineLastReceivedAt).toBeNull();
  expect(limits.plan.value).toBeNull();
});

test("[FR-014-AC6][FR-027-AC3] 07 설정 예시의 명령(`<쓰던 상태줄 명령>` 자리에 `cat`)을 그대로 실행하면 입력이 그대로 출력되고 값이 수집된다", async ({
  request,
}) => {
  const settings = JSON.parse(await getText(request, "/api/settings")) as {
    statusline: { settingsExample: string; lastReceivedAt: string | null };
  };
  const state = readE2eState();

  // 예시 = 바깥 `{}` 없는 조각. `{`·`}`로 감싸 JSON으로 파싱한다
  const parsed = JSON.parse(`{${settings.statusline.settingsExample}}`) as { statusLine: { type: string; command: string } };
  expect(parsed.statusLine.type).toBe("command");
  const command = parsed.statusLine.command;
  const match = /^node "([^"]+)" --url (\S+) -- (<쓰던 상태줄 명령>)$/.exec(command);
  expect(match, `예시 명령 형식: ${command}`).not.toBeNull();
  const [, examplePath, exampleUrl] = match as RegExpExecArray;
  expect(basename(examplePath)).toBe("statusline.mjs");
  expect(basename(dirname(examplePath))).toBe(".aojistudio");
  expect(realpathSync(examplePath), "예시 경로 = 컨테이너가 배치한 스크립트").toBe(realpathSync(scriptPath()));
  expect(exampleUrl).toBe(`${state.baseUrl}/hooks/statusline`);
  expect(settings.statusline.settingsExample, "예시에 수집 토큰이 없다").not.toContain(state.collectToken);

  // 사용자가 자리표시를 쓰던 명령으로 바꾼다 → 셸이 실행하는 그대로 돌린다
  const shellCommand = command.replace("<쓰던 상태줄 명령>", "cat");
  const startedAt = Date.now();
  const result = spawnSync("sh", ["-c", shellCommand], {
    input: FULL_INPUT,
    encoding: "utf8",
    env: { ...process.env, TMPDIR: newTmp() },
    timeout: 15_000,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout, "쓰던 명령(cat)의 출력이 그대로").toBe(FULL_INPUT);
  expect(result.stderr).toBe("");

  // 서버가 받은 값: fixture full.json의 세 가지(플랜·5시간·주간)
  await expect
    .poll(async () => (await getLimits(request)).plan.value, { message: "07 예시 명령으로 보낸 플랜이 수집되어야 합니다" })
    .toBe("max");
  const limits = await getLimits(request);
  expect(limits.fiveHour).toMatchObject({ state: "ok", usedPercent: FULL.rate_limits.five_hour.used_percentage, source: "statusline" });
  expect(limits.sevenDay).toMatchObject({ state: "ok", usedPercent: FULL.rate_limits.seven_day.used_percentage, source: "statusline" });
  expect(new Date(limits.fiveHour.resetsAt as string).getTime()).toBe(RESETS_FIVE * 1000);
  expect(new Date(limits.sevenDay.resetsAt as string).getTime()).toBe(RESETS_WEEK * 1000);
  expect(new Date(limits.statuslineLastReceivedAt as string).getTime()).toBeGreaterThanOrEqual(startedAt - 1000);
  // 07이 보여 줄 마지막 수신 시각도 같은 값
  const after = JSON.parse(await getText(request, "/api/settings")) as { statusline: { lastReceivedAt: string | null } };
  expect(after.statusline.lastReceivedAt).toBe(limits.statuslineLastReceivedAt);
});

test("[FR-027-AC3] 쓰던 명령이 있으면 같은 입력을 넘기고 출력을 그대로 내보내며, 없으면 아무것도 출력하지 않는다 · 전송은 세 가지 값만(표지 0)", async ({
  request,
}) => {
  const withCommand = runStatusline({ input: FULL_INPUT, command: [process.execPath, "-e", CURRENT_DIR_SCRIPT] });
  expect(withCommand.status).toBe(0);
  expect(withCommand.stdout, "같은 입력이 쓰던 명령에 넘어갔다").toBe(FULL.workspace.current_dir);
  expect(withCommand.stdout).toContain(STATUS_MARKER);
  expect(withCommand.stderr).toBe("");

  const fixed = runStatusline({ input: FULL_INPUT, command: [process.execPath, "-e", FIXED_OUTPUT_SCRIPT] });
  expect(fixed.stdout).toBe(FIXED_OUTPUT);

  const none = runStatusline({ input: FULL_INPUT });
  expect(none.status).toBe(0);
  expect(none.stdout, "쓰던 명령이 없으면 출력 없음").toBe("");
  expect(none.stderr).toBe("");

  // 입력의 다른 값(작업 폴더·표지)은 서버에 가지 않는다
  for (const path of ["/api/limits", "/api/settings", "/api/state"]) {
    const text = await getText(request, path);
    expect(text, `${path}에 상태줄 입력의 다른 값`).not.toContain(STATUS_MARKER);
    expect(text, `${path}에 transcript_path`).not.toContain("fixture-statusline-session");
  }
  expect(containerLogs()).not.toContain(STATUS_MARKER);
});

test("[FR-027-AC8] 상태줄 값을 받으면 2초 안에 10에 반영된다(플랜·5시간·주간, 출처 `상태줄`·받은 시각)", async ({ page, request }, testInfo) => {
  await gotoReady(page, "/cost");
  await expect(page.locator('[data-wf="10-6"]')).toBeVisible();
  // 지금 값(앞 테스트의 max/37.5/12.25)이 먼저 보인다
  await expectCard(page, { plan: "max", five: 37.5, week: 12.25, source: "상태줄" });

  const input = statuslineInput("pro", 40, 63);
  await measureFileChangeReflection(
    testInfo,
    "상태줄 전송 → 10 한도 카드",
    () => {
      const result = runStatusline({ input });
      expect(result.status).toBe(0);
    },
    async () => {
      const segments = limitSegments(await limitsText(page));
      return (
        segments.plan.includes("pro") &&
        percentPattern(40).test(segments.five) &&
        percentPattern(63).test(segments.week)
      );
    },
  );

  const segments = await readLimitSegments(page);
  expect(segments.plan).toContain("상태줄");
  expect(segments.five).toContain("상태줄");
  expect(segments.week).toContain("상태줄");
  // 받은 시각 hh:mm:ss
  expect(segments.five).toMatch(/\d{2}:\d{2}:\d{2}/);
  const limits = await getLimits(request);
  expect(limits.fiveHour.receivedAt).not.toBeNull();
  await expect(page.getByRole("meter", { name: "5시간 한도 사용률 40%", exact: true })).toBeVisible();
  await expect(page.getByRole("meter", { name: "주간 한도 사용률 63%", exact: true })).toBeVisible();
});

test("[FR-027-AC2] 값이 바뀌었거나 마지막 전송에서 60초가 지났을 때만 보낸다: 같은 값을 연달아 실행해도 서버는 한 번만 받는다", async ({ request }) => {
  const tmp = newTmp();
  const input = statuslineInput("pro", 41, 64);
  const lastReceived = async (): Promise<string | null> => (await getLimits(request)).statuslineLastReceivedAt;
  const t0 = await lastReceived();

  expect(runStatusline({ input, tmp }).status).toBe(0);
  await expect.poll(lastReceived, { message: "첫 실행은 전송한다" }).not.toBe(t0);
  const t1 = await lastReceived();

  // 같은 본문, 같은 상태 폴더, 60초 안 → 보내지 않는다(전송은 비동기라 넉넉히 기다린 뒤 확인한다)
  expect(runStatusline({ input, tmp }).status).toBe(0);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(await lastReceived(), "같은 값은 60초 안에 다시 보내지 않는다").toBe(t1);

  // 값이 바뀌면 바로 보낸다
  expect(runStatusline({ input: statuslineInput("pro", 42, 64), tmp }).status).toBe(0);
  await expect.poll(lastReceived, { message: "값이 바뀌면 전송한다" }).not.toBe(t1);
  await expect.poll(async () => (await getLimits(request)).fiveHour.usedPercent).toBe(42);
});

test("[FR-027-AC4] 한도 캐시의 받은 시각이 상태줄보다 더 최근이면 5시간·주간 모두 `한도 캐시`로 보이고, 플랜은 상태줄 값 그대로다", async ({
  page,
  request,
}) => {
  const cacheFile = join(readE2eState().claudeHomeDir ?? "", ".claude.json");
  expect(existsSync(cacheFile), `전역 설정 사본 ${cacheFile}(E2E_CLAUDE_HOME_FIXTURE=claude-home-basic)`).toBe(true);
  const original = readFileSync(cacheFile, "utf8");

  await sendAndWait(request, "pro", 40, 63);
  await gotoReady(page, "/cost");
  await expectCard(page, { plan: "pro", five: 40, week: 63, source: "상태줄" });

  try {
    // 캐시를 지금 시각(상태줄을 받은 뒤)으로 새로 쓴 것처럼 바꾼다. 쓰기는 호스트 쪽 사본이고 컨테이너는 읽기만 한다.
    const parsed = JSON.parse(original) as {
      cachedUsageUtilization: { fetchedAtMs: number; utilization: Record<"five_hour" | "seven_day", { utilization: number; resets_at: string }> };
    };
    parsed.cachedUsageUtilization.fetchedAtMs = Date.now();
    parsed.cachedUsageUtilization.utilization.five_hour.utilization = 55;
    parsed.cachedUsageUtilization.utilization.seven_day.utilization = 70;
    writeFileSync(cacheFile, `${JSON.stringify(parsed, null, 2)}\n`);

    await expectCard(page, { plan: "pro", five: 55, week: 70, source: "한도 캐시" });
    const segments = await readLimitSegments(page);
    expect(segments.plan, "플랜은 상태줄 값만 쓴다").toContain("상태줄");
    expect(segments.plan).not.toContain("한도 캐시");
    const limits = await getLimits(request);
    expect(limits.fiveHour).toMatchObject({ state: "ok", usedPercent: 55, source: "cache" });
    expect(limits.sevenDay).toMatchObject({ state: "ok", usedPercent: 70, source: "cache" });
    expect(limits.plan.value).toBe("pro");
  } finally {
    writeFileSync(cacheFile, original);
  }

  // 원래(더 오래된) 캐시로 돌리면 다시 상태줄 값
  await expectCard(page, { plan: "pro", five: 40, week: 63, source: "상태줄" });
  expect(readFileSync(cacheFile, "utf8")).toBe(original);
});

test("[FR-027-E2][D-178] 상태줄에 한도 필드가 없고 한도 캐시에도 그 창 값이 없으면 그 항목만 `값 없음`(플랜은 상태줄 값만, 없으면 `알 수 없음`) · 캐시 값이 있으면 상태줄에 없는 창은 캐시 값으로 채운다", async ({ page, request }) => {
  const cacheFile = join(readE2eState().claudeHomeDir ?? "", ".claude.json");
  expect(existsSync(cacheFile), `전역 설정 사본 ${cacheFile}(E2E_CLAUDE_HOME_FIXTURE=claude-home-basic)`).toBe(true);
  const original = readFileSync(cacheFile, "utf8");
  await gotoReady(page, "/cost");
  await expect(page.locator('[data-wf="10-6"]')).toBeVisible();

  try {
    // 0) 현재 규칙(ADR-83 결정 6): 캐시에 값이 있으면 상태줄에 없는 창은 캐시 값으로 채워진다(`값 없음`이 아니다)
    expect(runStatusline({ input: readInputText("no-limits.json") }).status).toBe(0);
    await expect.poll(async () => (await getLimits(request)).fiveHour.source, { message: "한도 없는 입력 → 캐시 값으로 채움" }).toBe("cache");
    expect(await getLimits(request)).toMatchObject({
      fiveHour: { state: "ok", source: "cache" },
      sevenDay: { state: "ok", source: "cache" },
    });

    // 한도 캐시에서 두 창 값을 없앤다(쓰기는 호스트 쪽 사본, 컨테이너는 읽기만 한다)
    const parsed = JSON.parse(original) as Record<string, unknown>;
    delete parsed.cachedUsageUtilization;
    writeFileSync(cacheFile, `${JSON.stringify(parsed, null, 2)}\n`);

    // 1) 한도 필드가 전혀 없는 입력(no-limits.json: 플랜 pro만) → 두 한도 모두 `값 없음`
    await expect.poll(async () => (await getLimits(request)).fiveHour.state, { message: "캐시 값 없음 반영" }).toBe("missing");
    let limits = await getLimits(request);
    expect(limits.plan.value).toBe("pro");
    expect(limits.sevenDay.state).toBe("missing");
    await expect
      .poll(async () => {
        const segments = limitSegments(await limitsText(page));
        return segments.five.includes("값 없음") && segments.week.includes("값 없음") && segments.plan.includes("pro");
      })
      .toBe(true);

    // 2) 주간만 있고 플랜·5시간이 없는 입력 → 주간만 값, 5시간 `값 없음`, 플랜 `알 수 없음`
    runStatusline({ input: statuslineInput(null, null, 20) });
    await expect.poll(async () => (await getLimits(request)).sevenDay.usedPercent).toBe(20);
    limits = await getLimits(request);
    expect(limits.plan.value).toBeNull();
    expect(limits.fiveHour.state).toBe("missing");
    await expect
      .poll(async () => {
        const segments = limitSegments(await limitsText(page));
        return (
          segments.plan.includes("알 수 없음") &&
          segments.five.includes("값 없음") &&
          percentPattern(20).test(segments.week) &&
          !segments.week.includes("값 없음")
        );
      })
      .toBe(true);
  } finally {
    writeFileSync(cacheFile, original);
  }
});

test("[FR-027-E3] 형식이 틀린 전송은 저장하지 않고 2xx로 응답하며 서버 로그에는 사유만 남는다(스크립트로 보낸 경우와 직접 보낸 경우)", async ({
  request,
}) => {
  // 앞 테스트가 남긴 값(pro/40/63)과 다른 값으로 보낸다: 같은 값이면 `sendAndWait`의 확인이 보내기 전에 이미 참이 되어, 분리된 전송이 나중에 도착해 `before` 뒤에 값을 바꾼다.
  await sendAndWait(request, "pro", 44, 66);
  const before = await getText(request, "/api/limits");
  const rejectedBefore = countOf(containerLogs(), "statusline rejected");

  // 직접: 올바른 토큰 + 형식 오류(플랜 숫자, 사용률 문자열·범위 밖) → 204, 저장 없음
  const status = await postStatusline(
    request,
    { subscription_type: 7, rate_limits: { five_hour: { used_percentage: "not-a-number" }, seven_day: { used_percentage: 5000 } } },
    { "X-AojiStudio-Collect-Token": readE2eState().collectToken },
  );
  expect(status, "형식 오류도 2xx").toBe(204);

  // 스크립트로: bad-type.json(표지 포함)을 그대로 넣는다
  const result = runStatusline({ input: readInputText("bad-type.json") });
  expect(result.status).toBe(0);
  expect(result.stderr, "스크립트는 실패를 stderr에 쓰지 않는다").toBe("");

  await expect
    .poll(() => countOf(containerLogs(), "statusline rejected"), { message: "서버 로그에 `statusline rejected: reason=` 줄이 남아야 합니다" })
    .toBeGreaterThanOrEqual(rejectedBefore + 2);
  const logs = containerLogs();
  expect(logs).toMatch(/statusline rejected: reason=\S+/);
  // 로그에는 사유만: 보낸 값·표지가 없다
  expect(logs).not.toContain("not-a-number");
  expect(logs).not.toContain(STATUS_MARKER);

  // 저장하지 않았다: 앞 값 그대로
  expect(await getText(request, "/api/limits")).toBe(before);
});

test("[FR-027-AC2] 서버가 정지(`pause`)된 상태에서도 스크립트는 500ms 안에 끝나고 쓰던 명령 출력이 그대로다 (finally에서 반드시 unpause)", async ({
  request,
}) => {
  test.setTimeout(90_000);
  // 정지 전 기준: 서버가 살아 있을 때 같은 실행이 얼마나 걸리는지(참고용 annotation)
  const baseline = runStatusline({ input: FULL_INPUT, command: [process.execPath, "-e", FIXED_OUTPUT_SCRIPT] });
  expect(baseline.stdout).toBe(FIXED_OUTPUT);

  pauseContainer();
  try {
    // 값이 바뀐 입력이라 스크립트는 전송을 시도한다(받아 줄 서버가 얼어 있다)
    const run = runStatusline({
      input: statuslineInput("max", 37.5, 12.25),
      command: [process.execPath, "-e", FIXED_OUTPUT_SCRIPT],
    });
    process.stdout.write(`[FR-027-AC2 실행 시간] 서버 정지 ${Math.round(run.elapsedMs)}ms · 정상 ${Math.round(baseline.elapsedMs)}ms\n`);
    expect(run.status).toBe(0);
    expect(run.elapsedMs, `서버 정지 상태 실행 시간 ${Math.round(run.elapsedMs)}ms`).toBeLessThan(500);
    expect(run.stdout, "쓰던 명령 출력이 그대로").toBe(FIXED_OUTPUT);
    expect(run.stderr, "실패를 상태줄에 쓰지 않는다").toBe("");

    // 분리된 전송 프로세스가 2초 제한으로 끝날 때까지 정지를 유지한다(풀자마자 늦게 도착하는 요청이 뒤 상태를 건드리지 않게)
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } finally {
    ensureUnpaused();
  }

  // 서버가 다시 응답하고, 다음 spec이 쓸 수 있다
  await expect.poll(async () => (await request.get(`${readE2eState().baseUrl}/`)).status()).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const limits = await getLimits(request);
  expect(["ok", "missing"]).toContain(limits.fiveHour.state);
});
