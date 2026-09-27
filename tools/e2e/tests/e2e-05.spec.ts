// E2E-05 04-3 재연결 (architecture.md §8.2 E2E-05 행).
// fixture: `project-configured`. 검증 ID: FR-016-AC1·AC2·AC3·AC4.
//
// 방법: 실제 컨테이너를 `docker compose pause`로 얼려 SSE를 끊고(프론트는 realtime-spec.md §4대로
// "마지막 메시지 후 45초 무수신"으로 끊김을 판정한다), 04-3 배너·카운트다운·`지금 재연결`·`unpause` 후
// 스냅샷 갱신을 관찰한다. 목킹 없음 — `page.route` 가로채기도, EventSource 가짜 오류도 쓰지 않는다
// (conventions.md §8). 주소·포트 literal 없음(`.e2e-state.json`만 읽는다).
//
// **반드시 단독 배치로 돌린다**: `pause`는 같은 컨테이너를 쓰는 다른 spec을 모두 깨뜨린다.
// 컨테이너는 실패 경로에서도 `finally` + `afterAll`에서 `unpause`로 되돌린다 — pause 상태가 남으면
// globalTeardown의 `down -v`가 지저분해지고 다음 실행의 4185 선점 검사에 걸린다.
//
// 시간: 끊김 판정에 45초(realtime-spec.md §4)가 걸리고 백오프 5초 → 10초를 두 번 관찰해야 하므로
// 한 테스트가 playwright.config.ts의 30초 기한을 넘는다. 설정을 바꾸지 않고 이 테스트에만
// `test.setTimeout()`을 쓴다(아래 TEST_TIMEOUT_MS).
import { execFileSync } from "node:child_process";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { E2E_DIR, composeEnv, readE2eState } from "../lib/e2e-state";
import { delay } from "../lib/harness-utils";
import {
  SETUP_REFLECT_TIMEOUT_MS,
  agentFile,
  agentFileContent,
  fixturePathExists,
  gotoReady,
  readFixtureFile,
  removeFixturePath,
  spriteSvg,
  teamFile,
  writeFixtureFile,
} from "./ui-helpers";

/**
 * 45초(끊김 판정) × 2 + 백오프 5·10초 + 여유. `playwright.config.ts`(30초)는 그대로 두고
 * 이 테스트에만 늘린다.
 */
const TEST_TIMEOUT_MS = 240_000;

/** realtime-spec.md §4: 끊김 판정 = 마지막 메시지(heartbeat 포함) 후 45초 무수신. */
const HEARTBEAT_TIMEOUT_MS = 45_000;
/** realtime-spec.md §2: heartbeat는 15초마다. pause 직전 마지막 메시지가 최대 이만큼 과거일 수 있다. */
const HEARTBEAT_INTERVAL_MS = 15_000;
/** 컨테이너 freeze·docker 명령 지연을 감안한 여유. */
const DETECT_SLACK_MS = 12_000;

/** FR-016-AC3: 백오프는 5초에서 시작해 두 배씩(5 → 10 → 20 → 30 → 30). */
const FIRST_BACKOFF_SEC = 5;
const SECOND_BACKOFF_SEC = 10;

/** `지금 재연결`은 "즉시 시도"여야 한다(FR-016-AC3). 남은 카운트다운과 구분되는 상한을 둔다. */
const IMMEDIATE_RECONNECT_BUDGET_MS = 1500;

/** ui-spec.md SCR-04-3 배너 첫 줄 문구(확정 문구. `lib/text.ts` disconnectBannerMessage와 같다). */
const BANNER_PATTERN = /^실시간 연결이 끊겼습니다 · (\d+)초 후 재연결$/;
/** ui-spec.md SCR-04-3 아래 줄 문구. */
const LAST_UPDATED_PATTERN = /^마지막 갱신 (\d{2}):(\d{2}):(\d{2}) 기준 화면 유지$/;

const DEV_TEAM = "dev-team";
/** 끊긴 동안 fixture에 추가하는 에이전트. 재연결 후에야 화면에 나타나야 한다(FR-016-AC2·AC4). */
const PROBE_AGENT = "probe-agent";

// ── docker compose 조작 (pause/unpause. 주소·포트 literal 없이 상태 파일 값만 쓴다) ──────────────

function compose(args: string[]): string {
  const state = readE2eState();
  return execFileSync("docker", ["compose", "-f", state.composeFile, ...args], {
    cwd: E2E_DIR,
    env: composeEnv(state.fixtureDir),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function containerId(): string {
  const state = readE2eState();
  const id = compose(["ps", "-q", state.composeService]).trim();
  expect(id, "e2e 컨테이너를 찾을 수 없습니다").not.toBe("");
  return id;
}

/** `running` / `paused` 등 docker가 보고하는 컨테이너 상태. */
function containerStatus(): string {
  return execFileSync("docker", ["inspect", "--format", "{{.State.Status}}", containerId()], {
    encoding: "utf8",
  }).trim();
}

function pauseContainer(): void {
  compose(["pause", readE2eState().composeService]);
  expect(containerStatus(), "컨테이너가 paused 상태가 되지 않았습니다").toBe("paused");
}

/** 이미 running이면 아무것도 하지 않는다(실패 경로에서 여러 번 불려도 안전하다). */
function ensureUnpaused(): void {
  if (containerStatus() !== "paused") {
    return;
  }
  compose(["unpause", readE2eState().composeService]);
  expect(containerStatus(), "컨테이너를 running으로 되돌리지 못했습니다").toBe("running");
}

// ── 04-3 배너 읽기 ────────────────────────────────────────────────────────────────

function disconnectBanner(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: "실시간 연결이 끊겼습니다" });
}

/** 배너 첫 줄의 남은 재연결 초. 배너가 없으면 null. */
async function currentRetryInSec(page: Page): Promise<number | null> {
  const banner = disconnectBanner(page);
  if ((await banner.count()) === 0) {
    return null;
  }
  const text = (await banner.locator("p").first().textContent())?.trim() ?? "";
  const matched = BANNER_PATTERN.exec(text);
  if (matched === null) {
    return null;
  }
  return Number(matched[1]);
}

interface CountdownSample {
  /** 관찰 시각(Date.now()). */
  at: number;
  retryInSec: number;
}

/**
 * 04-3 배너의 카운트다운을 100ms 간격으로 표본 추출한다. 값이 바뀔 때마다 한 번씩 기록하고,
 * 서로 다른 값을 `minDistinct`개 모으면 즉시 끝낸다(조건 충족 시 바로 반환하므로 고정 대기가 아니다).
 * 카운트다운은 1초마다 1씩 줄어들므로 100ms 표본이면 모든 단계를 놓치지 않는다.
 */
async function sampleCountdown(
  page: Page,
  options: { timeoutMs: number; minDistinct: number },
): Promise<CountdownSample[]> {
  const deadline = Date.now() + options.timeoutMs;
  const samples: CountdownSample[] = [];
  while (Date.now() < deadline) {
    const retryInSec = await currentRetryInSec(page);
    if (retryInSec !== null) {
      const last = samples[samples.length - 1];
      if (last === undefined || last.retryInSec !== retryInSec) {
        samples.push({ at: Date.now(), retryInSec });
      }
      if (samples.length >= options.minDistinct) {
        return samples;
      }
    }
    await delay(100);
  }
  return samples;
}

/** hh:mm:ss → 자정 기준 초. 날짜가 바뀌어도 비교할 수 있게 초 단위로만 다룬다. */
function secondsOfDay(hours: number, minutes: number, seconds: number): number {
  return hours * 3600 + minutes * 60 + seconds;
}

function nowSecondsOfDay(): number {
  const now = new Date();
  return secondsOfDay(now.getHours(), now.getMinutes(), now.getSeconds());
}

// ── fixture 조작 (항상 임시 사본 안. architecture.md §8.1 "파일 변경") ─────────────────────────

function addProbeAgentToFixture(): void {
  writeFixtureFile(
    agentFile(PROBE_AGENT),
    agentFileContent({
      name: PROBE_AGENT,
      description: "E2E-05 재연결 후 전체 상태 재수신 확인용",
      body: "재연결 뒤에만 화면에 나타나야 한다.",
    }),
  );
  const team = JSON.parse(readFixtureFile(teamFile(DEV_TEAM))) as { members: string[] };
  team.members = [...team.members, PROBE_AGENT];
  writeFixtureFile(teamFile(DEV_TEAM), `${JSON.stringify(team, null, 2)}\n`);
}

function removeProbeAgentFromFixture(originalTeamJson: string): void {
  removeFixturePath(agentFile(PROBE_AGENT));
  writeFixtureFile(teamFile(DEV_TEAM), originalTeamJson);
}

test.describe.configure({ mode: "serial" });

// 시간 요건(FR-016-AC3)의 실측치는 리뷰 근거이므로 성공·실패와 무관하게 실행 로그에 남긴다.
test.afterEach(({}, testInfo) => {
  // Playwright가 자동으로 붙이는 주석(예: `serial`)은 설명이 없으므로 걸러낸다.
  for (const annotation of testInfo.annotations) {
    if (annotation.description === undefined) continue;
    process.stdout.write(`[E2E-05 실측] ${annotation.type}: ${annotation.description}\n`);
  }
});

test.afterAll(() => {
  // 테스트가 어디서 실패했더라도 컨테이너는 반드시 running으로 남긴다.
  ensureUnpaused();
  expect(containerStatus(), "테스트 종료 시 컨테이너가 running이 아닙니다").toBe("running");
});

test("[FR-016-AC1][FR-016-AC2][FR-016-AC3][FR-016-AC4][E2E-05] 컨테이너 pause → 04-3 배너·카운트다운 5초 → `지금 재연결` 즉시 시도 → 재끊김 10초 → unpause → 배너 사라지고 스냅샷 갱신", async ({
  page,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);

  const originalTeamJson = readFixtureFile(teamFile(DEV_TEAM));
  // EventSource 연결 시도를 관찰한다(가로채지 않고 기록만 한다 — 목킹이 아니다).
  const streamRequests: number[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/stream")) {
      streamRequests.push(Date.now());
    }
  });

  try {
    await gotoReady(page, "/workflows");
    await expect(page.getByRole("heading", { level: 3, name: DEV_TEAM, exact: true })).toBeVisible();
    await expect(spriteSvg(page, "dev-lead")).toBeVisible();
    await expect(spriteSvg(page, PROBE_AGENT)).toHaveCount(0);
    expect(streamRequests.length, "첫 SSE 연결 시도가 관찰되지 않았습니다").toBeGreaterThanOrEqual(1);
    await expect(disconnectBanner(page)).toHaveCount(0);

    // ── ① pause: 프론트에는 "메시지가 오지 않는 연결"만 남는다 ────────────────────────────
    const pausedAt = Date.now();
    const pausedAtSecondsOfDay = nowSecondsOfDay();
    pauseContainer();

    // 끊긴 동안 fixture를 바꿔 둔다. 컨테이너가 얼어 있으므로 재연결 전까지는 화면에 반영될 수 없다.
    addProbeAgentToFixture();

    // ── ② 04-3 배너 + 카운트다운 5초 (FR-016-AC1·AC3) ─────────────────────────────────
    // realtime-spec.md §4: 마지막 메시지 후 45초. heartbeat가 15초마다이므로 pause 기준 30~45초 뒤다.
    const firstSamples = await sampleCountdown(page, {
      timeoutMs: HEARTBEAT_TIMEOUT_MS + DETECT_SLACK_MS,
      minDistinct: 2,
    });
    const firstSample = firstSamples[0];
    expect(firstSample, "pause 후 04-3 배너가 나타나지 않았습니다").toBeDefined();
    const detectElapsedMs = (firstSample as CountdownSample).at - pausedAt;
    // realtime-spec.md §4는 끊김 판정 경로를 두 가지로 둔다: `EventSource.onerror` 또는 45초 무수신.
    // `pause`는 소켓을 끊지 않고 응답만 멈추므로 보통 무수신 경로(30~45초)지만, 전송 계층이 연결을
    // 끊으면 onerror 경로로 즉시 판정될 수도 있다. 둘 다 규격이므로 상한만 단언하고 실측 경로를 남긴다.
    testInfo.annotations.push({
      type: "FR-016-AC1 끊김 판정 실측",
      description:
        `pause → 04-3 배너 ${detectElapsedMs}ms ` +
        `(판정 경로: ${
          detectElapsedMs >= HEARTBEAT_TIMEOUT_MS - HEARTBEAT_INTERVAL_MS - 2000
            ? `heartbeat ${HEARTBEAT_TIMEOUT_MS / 1000}초 무수신`
            : "EventSource onerror"
        }) / 카운트다운 표본 ${firstSamples.map((sample) => sample.retryInSec).join(" → ")}`,
    });
    expect(detectElapsedMs, "끊김 판정이 45초 + 여유를 넘겼습니다").toBeLessThanOrEqual(
      HEARTBEAT_TIMEOUT_MS + DETECT_SLACK_MS,
    );

    // 백오프 시작값 5초, 그리고 1초마다 줄어드는 카운트다운.
    expect((firstSample as CountdownSample).retryInSec, "백오프 시작값이 5초가 아닙니다").toBe(
      FIRST_BACKOFF_SEC,
    );
    const secondSample = firstSamples[1] as CountdownSample;
    expect(secondSample.retryInSec).toBe(FIRST_BACKOFF_SEC - 1);
    const tickMs = secondSample.at - (firstSample as CountdownSample).at;
    testInfo.annotations.push({
      type: "FR-016-AC3 카운트다운 간격 실측",
      description: `${FIRST_BACKOFF_SEC}초 → ${FIRST_BACKOFF_SEC - 1}초 사이 ${tickMs}ms`,
    });
    expect(tickMs, "카운트다운이 1초 간격이 아닙니다").toBeGreaterThanOrEqual(600);
    expect(tickMs).toBeLessThanOrEqual(2500);

    // 배너 문구·버튼·아래 줄(ui-spec.md SCR-04-3 요소 표).
    const banner = disconnectBanner(page);
    await expect(banner.locator("p").first()).toHaveText(BANNER_PATTERN);
    const reconnectNowButton = banner.getByRole("button", { name: "지금 재연결", exact: true });
    await expect(reconnectNowButton).toBeVisible();
    await expect(reconnectNowButton).toBeEnabled();

    const lastUpdatedText = (await banner.locator("p").nth(1).textContent())?.trim() ?? "";
    const lastUpdatedMatch = LAST_UPDATED_PATTERN.exec(lastUpdatedText);
    expect(
      lastUpdatedMatch,
      `04-3 아래 줄 문구가 ui-spec SCR-04-3과 다릅니다: ${lastUpdatedText}`,
    ).not.toBeNull();
    const shown = lastUpdatedMatch as RegExpExecArray;
    const lastUpdatedSecondsOfDay = secondsOfDay(
      Number(shown[1]),
      Number(shown[2]),
      Number(shown[3]),
    );
    // FR-016-AC2: 마지막 갱신 시각은 pause 직전(heartbeat 간격 안)이어야 한다.
    const staleForSec = (pausedAtSecondsOfDay - lastUpdatedSecondsOfDay + 86_400) % 86_400;
    testInfo.annotations.push({
      type: "FR-016-AC2 마지막 갱신 시각 실측",
      description: `배너 표시 ${shown[0]} → pause 시점보다 ${staleForSec}초 과거`,
    });
    expect(staleForSec, "마지막 갱신 시각이 pause 시점보다 미래입니다").toBeLessThanOrEqual(
      HEARTBEAT_INTERVAL_MS / 1000 + 5,
    );

    // FR-016-AC2 "그 시점 화면을 유지한다": 층·책상은 그대로고, 끊긴 뒤 바꾼 fixture는 보이지 않는다.
    await expect(page.getByRole("heading", { level: 3, name: DEV_TEAM, exact: true })).toBeVisible();
    await expect(spriteSvg(page, "dev-lead")).toBeVisible();
    await expect(spriteSvg(page, PROBE_AGENT)).toHaveCount(0);

    // FR-016-AC1 "모든 화면 상단에": 화면을 옮겨도 배너가 그대로 있고 01은 `연결 끊김`으로 표시한다.
    await page.getByRole("link", { name: "홈", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "에이전트 관제", exact: true })).toBeVisible();
    await expect(disconnectBanner(page)).toBeVisible();
    await expect(page.getByText("연결 끊김", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "에이전트 워크플로우", exact: true }).click();
    await expect(page.getByRole("heading", { level: 3, name: DEV_TEAM, exact: true })).toBeVisible();
    await expect(disconnectBanner(page)).toBeVisible();

    // ── ③ `지금 재연결` = 즉시 시도 (FR-016-AC3) ──────────────────────────────────────
    const remainingBeforeClick = await currentRetryInSec(page);
    expect(remainingBeforeClick, "클릭 전 카운트다운을 읽지 못했습니다").not.toBeNull();
    const streamCountBeforeClick = streamRequests.length;
    const clickedAt = Date.now();
    await disconnectBanner(page).getByRole("button", { name: "지금 재연결", exact: true }).click();

    // 즉시 `connecting`으로 바뀌므로 배너가 사라진다(ui-spec SCR-04-3: disconnected일 때만 표시).
    await expect(disconnectBanner(page)).toHaveCount(0, { timeout: IMMEDIATE_RECONNECT_BUDGET_MS });
    const bannerGoneMs = Date.now() - clickedAt;
    // 새 EventSource 연결 시도가 실제로 나갔다.
    const deadline = Date.now() + IMMEDIATE_RECONNECT_BUDGET_MS;
    while (streamRequests.length === streamCountBeforeClick && Date.now() < deadline) {
      await delay(50);
    }
    const newAttemptMs = (streamRequests[streamCountBeforeClick] ?? Number.NaN) - clickedAt;
    testInfo.annotations.push({
      type: "FR-016-AC3 `지금 재연결` 즉시 시도 실측",
      description:
        `클릭 시점 남은 카운트다운 ${remainingBeforeClick}초 / 배너 사라짐 ${bannerGoneMs}ms / ` +
        `새 /api/stream 시도 ${newAttemptMs}ms`,
    });
    expect(
      streamRequests.length,
      "`지금 재연결`을 눌렀는데 새 SSE 연결 시도가 없습니다",
    ).toBeGreaterThan(streamCountBeforeClick);
    expect(newAttemptMs, "`지금 재연결`이 즉시 시도하지 않았습니다").toBeLessThanOrEqual(
      IMMEDIATE_RECONNECT_BUDGET_MS,
    );
    // 남은 카운트다운을 기다리지 않았다 = 즉시다.
    expect(newAttemptMs).toBeLessThan((remainingBeforeClick as number) * 1000);

    // ── ④ 다시 끊기면 백오프가 두 배(10초) (FR-016-AC3) ────────────────────────────────
    const secondSamples = await sampleCountdown(page, {
      timeoutMs: HEARTBEAT_TIMEOUT_MS + DETECT_SLACK_MS,
      minDistinct: 2,
    });
    const secondFirst = secondSamples[0];
    expect(secondFirst, "재연결 실패 후 04-3 배너가 다시 나타나지 않았습니다").toBeDefined();
    testInfo.annotations.push({
      type: "FR-016-AC3 백오프 두 배 실측",
      description:
        `두 번째 끊김 판정 ${(secondFirst as CountdownSample).at - clickedAt}ms 뒤 / ` +
        `카운트다운 표본 ${secondSamples.map((sample) => sample.retryInSec).join(" → ")}`,
    });
    expect(
      (secondFirst as CountdownSample).retryInSec,
      "두 번째 백오프가 10초가 아닙니다(5 → 10 두 배 규칙)",
    ).toBe(SECOND_BACKOFF_SEC);
    expect((secondSamples[1] as CountdownSample).retryInSec).toBe(SECOND_BACKOFF_SEC - 1);

    // ── ⑤ unpause → 배너 사라지고 전체 상태 재수신 (FR-016-AC4) ──────────────────────────
    // 남은 카운트다운(약 8초)이 0이 되면 프론트가 스스로 다시 연결한다 — 자동 재연결 경로다.
    const unpausedAt = Date.now();
    ensureUnpaused();
    await expect(disconnectBanner(page)).toHaveCount(0, {
      timeout: SECOND_BACKOFF_SEC * 1000 + SETUP_REFLECT_TIMEOUT_MS,
    });
    // 끊긴 동안 바뀐 fixture가 이제 보인다 = 스냅샷을 다시 받아 현재 상태로 갱신했다.
    await expect(spriteSvg(page, PROBE_AGENT)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
    const recoveredMs = Date.now() - unpausedAt;
    testInfo.annotations.push({
      type: "FR-016-AC4 재연결·갱신 실측",
      description: `unpause → 배너 사라지고 새 에이전트 표시까지 ${recoveredMs}ms`,
    });

    // 01의 연결 표시도 `실시간 연결됨`으로 돌아온다(ui-spec SCR-01 실시간 이벤트 카드 행).
    await page.getByRole("link", { name: "홈", exact: true }).click();
    await expect(page.getByText("실시간 연결됨", { exact: true })).toBeVisible();
    await expect(disconnectBanner(page)).toHaveCount(0);
  } finally {
    // 실패해도 컨테이너와 fixture를 원래대로 돌린다(afterAll이 한 번 더 확인한다).
    ensureUnpaused();
    removeProbeAgentFromFixture(originalTeamJson);
  }

  expect(fixturePathExists(agentFile(PROBE_AGENT)), "probe 정의 파일이 남았습니다").toBe(false);
  expect(readFixtureFile(teamFile(DEV_TEAM)), "dev-team 구성 파일이 복구되지 않았습니다").toBe(
    originalTeamJson,
  );
});
