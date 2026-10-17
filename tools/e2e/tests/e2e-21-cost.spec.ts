// E2E-21: 10 비용 화면(T-R4-18, 배치 13). fixture: `project-usage` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-basic`(architecture §8.2 배치 13).
// 검증 ID: FR-025-AC1~AC4·AC6·AC7·E2(+ AC5 화면·응답에 대화 본문 표지 0), FR-026-AC1~AC4·AC6(+ AC2 항상 문구), FR-027-AC4·AC6(한도 캐시 값 — 상태줄을 받기 전),
// 캡처 `10-cost@1920x1080`·`10-1-price-panel@1920x1080`(D-172). 기대값 = `claude-home-basic/expected.json`(기간 `전체`).
//
// 파일 이름순으로 e2e-19a(`usage.jsonl` 재생 → `기본 세션`이 에이전트 나눔에 생김)·e2e-19b·e2e-20 뒤, e2e-22(상태줄) 앞에서 돈다.
// 상태줄을 아직 받지 않은 새 컨테이너가 전제다: 한도 카드는 한도 캐시 값(21%·48%)과 `알 수 없음` 플랜을 보인다.
// **맨 마지막 describe(`FR-025-AC6`)가 fixture 대화 기록에 줄을 덧붙인다.** 한 번 반영된 집계는 되돌릴 수 없으므로(`transcript_msg` 키 유지) 그 describe 앞의 테스트만 expected.json과 같다.
// 목킹 없음(conventions §8).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
import {
  comma,
  CONVO_MARKER,
  costExpected,
  EMAIL_MARKER,
  entrypointLabel,
  limitSegments,
  limitsText,
  millions,
  monthDay,
  monthDayTime,
  numberOf,
  percentPattern,
  priceText,
  readingStrip,
  regExpEscape,
  selectSplitTab,
  splitCard,
  splitRows,
  tokenTile,
  usd2,
  weekdayKo,
} from "./cost-helpers";
import { mcpPeriodButton } from "./mcp-helpers";
import {
  COST_REGIONS,
  captureBaseSizesAndRestore,
  expectCostLayout,
  expectDialogWidth,
  expectRegionsVisible,
  settle,
  sizeLabel,
} from "./screen-helpers";
import { check } from "./showcase-helpers";
import { gotoReady } from "./ui-helpers";

test.describe.configure({ mode: "serial" });
// 3크기 캡처의 전환 완료 판정(ADR-75 5)을 위해 전환을 줄인다.
test.use({ reducedMotion: "reduce" });

const CAPTURE_SIZE = { width: 1920, height: 1080 } as const;
const SEOUL = "Asia/Seoul";

// ── 도우미 ───────────────────────────────────────────────────────────────────────

/** 10 화면을 열고 기간을 `전체`로 바꾼다(FR-025-AC7 — 기본 `7일`은 fixture 날짜와 실행 날짜에 따라 비어 보일 수 있다). */
async function openCostAll(page: Page): Promise<void> {
  await gotoReady(page, "/cost");
  const all = mcpPeriodButton(page, "전체");
  await expect(all).toBeVisible();
  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
}

async function apiHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const { baseUrl } = readE2eState();
  const response = await request.get(`${baseUrl}/api/auth/browser-token`, { headers: { Origin: baseUrl } });
  expect(response.status(), await response.text()).toBe(200);
  const { token } = (await response.json()) as { token: string };
  return { Origin: baseUrl, "X-AojiStudio-Browser-Token": token };
}

async function getJson<T>(request: APIRequestContext, path: string): Promise<{ text: string; json: T }> {
  const { baseUrl } = readE2eState();
  const response = await request.get(`${baseUrl}${path}`, { headers: { Origin: baseUrl } });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
  const text = await response.text();
  return { text, json: JSON.parse(text) as T };
}

/** 합계 줄(첫 칸 `합계`)과 데이터 줄을 나눈다. */
function splitTotals(rows: string[][]): { data: string[][]; total: string[] } {
  const total = rows.find((cells) => cells[0] === "합계");
  expect(total, "합계 줄이 없습니다").toBeDefined();
  return { data: rows.filter((cells) => cells[0] !== "합계"), total: total as string[] };
}

// ── 시간대 Asia/Seoul: 합계·나눔 표·띠·한도 캐시·캡처 ──────────────────────────────

test.describe("[E2E-21] 10 비용 (Asia/Seoul)", () => {
  test.use({ timezoneId: SEOUL });

  test("[FR-025-AC1][FR-025-AC7][FR-025-AC5][FR-026-AC1][FR-026-AC2] 전체 기간: 토큰 4칸·추정 금액 = expected.json(중복 줄 한 번), `실제 청구액 아님` 항상, 대화 본문·계정 표지 0", async ({
    page,
    request,
  }) => {
    await openCostAll(page);
    const totals = costExpected.totals;

    await expect(tokenTile(page, "입력 토큰")).toContainText(comma(totals.input));
    await expect(tokenTile(page, "출력 토큰")).toContainText(comma(totals.output));
    await expect(tokenTile(page, "캐시 생성 토큰")).toContainText(comma(totals.cacheCreation));
    await expect(tokenTile(page, "캐시 읽기 토큰")).toContainText(comma(totals.cacheRead));

    // FR-026-AC1: `$` + 소수 둘째 자리. FR-026-AC6: 단가 없는 모델은 합계에서 빠지고 칩으로 알린다
    const amount = page.locator('[data-wf="10-5"]');
    await expect(amount).toContainText("추정 금액 (USD)");
    await expect(amount).toContainText(usd2(totals.usd));
    await expect(amount).toContainText(`단가 없는 모델 ${costExpected.excludedModelCount}개 제외`);
    // FR-026-AC2: 항상. 구독 플랜이 확인된 때만 덧붙이는 문구는 플랜(상태줄 값만)에 따른다
    await expect(amount).toContainText("API 단가 환산 · 실제 청구액 아님");
    const limits = await getJson<{ plan: { value: string | null } }>(request, "/api/limits");
    if (limits.json.plan.value === null) {
      await expect(amount).not.toContainText("구독 요금제에서는 청구되지 않는 금액입니다");
    } else {
      await expect(amount).toContainText("구독 요금제에서는 청구되지 않는 금액입니다");
    }

    // 제목 줄 안내와 `단가` 버튼
    await expect(page.locator('[data-wf="10-2"]')).toContainText(
      "Claude Code 대화 기록의 토큰 수로 계산합니다 · 대화 내용은 읽지 않습니다",
    );

    // FR-025-AC5: 대화 본문·계정 표지는 화면에도 API 응답에도 없다
    const body = await page.locator("body").innerText();
    const cost = await getJson<{ totals: { input: number }; estimate: { usd: number; excludedModelCount: number } }>(
      request,
      `/api/cost?period=all&tz=${encodeURIComponent(SEOUL)}`,
    );
    for (const marker of [CONVO_MARKER, EMAIL_MARKER]) {
      expect(body, `화면에 ${marker}`).not.toContain(marker);
      expect(await page.content(), `DOM에 ${marker}`).not.toContain(marker);
      expect(cost.text, `/api/cost 응답에 ${marker}`).not.toContain(marker);
    }
    expect(cost.json.totals.input).toBe(totals.input);
    expect(cost.json.estimate.usd).toBeCloseTo(Number(totals.usd), 7);
    expect(cost.json.estimate.excludedModelCount).toBe(costExpected.excludedModelCount);
  });

  test("[FR-025-AC6][FR-025-E2] 대화 기록 띠: 읽은 파일 N / 전체·진행 막대·`새 기록은 10초 안에 반영`, `건너뛴 파일 N개` = expected.json", async ({
    page,
  }) => {
    await openCostAll(page);
    const strip = readingStrip(page);
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute("aria-label", "대화 기록 읽기 상태");
    await expect(strip).toContainText("대화 기록");
    await expect(strip).toContainText("~/.claude/projects/");
    await expect(strip).toContainText(new RegExp(`읽은 파일\\s*[\\d,]+\\s*/\\s*${costExpected.fileCount}(?!\\d)`));
    await expect(strip.getByRole("progressbar", { name: "읽은 파일", exact: true })).toBeVisible();
    await expect(strip).toContainText("새 기록은 10초 안에 반영");
    // FR-025-E2: 읽지 못한 파일 수(0이면 글자 없음 — 여기서는 깨진 줄이 든 파일 1개)
    await expect(strip).toContainText(new RegExp(`건너뛴 파일\\s*${costExpected.skippedFiles}\\s*개`));
    await expect(strip).not.toContainText("연결 안 됨");
  });

  test("[FR-025-AC1][FR-025-AC4][FR-026-AC1][FR-026-AC6] 모델별 표: 토큰 합 내림차순·4가지 토큰·토큰 합·금액, 단가 없는 모델은 `단가 없음`·합계 줄 = totals", async ({
    page,
  }) => {
    await openCostAll(page);
    await expect(splitCard(page)).toBeVisible();
    const panel = await selectSplitTab(page, "모델별");
    await expect(panel.getByRole("columnheader", { name: "모델", exact: true })).toBeVisible();
    for (const header of ["입력", "출력", "캐시 생성", "캐시 읽기", "토큰 합", "추정 금액"]) {
      await expect(panel.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }

    const expectedModels = [...costExpected.byModel].sort((left, right) => right.total - left.total);
    await expect
      .poll(async () => (await splitRows(panel)).map((cells) => cells[0]))
      .toEqual([...expectedModels.map((row) => row.model), "합계"]);

    const { data, total } = splitTotals(await splitRows(panel));
    expectedModels.forEach((model, index) => {
      const cells = data[index] ?? [];
      expect(cells.slice(0, 6), `모델 ${model.model}`).toEqual([
        model.model,
        comma(model.input),
        comma(model.output),
        comma(model.cacheCreation),
        comma(model.cacheRead),
        comma(model.total),
      ]);
      if (model.usd === null) {
        expect(cells[6] ?? "", `${model.model} 금액`).toContain("단가 없음");
      } else {
        expect(cells[6] ?? "", `${model.model} 금액`).toBe(usd2(model.usd));
      }
    });
    // FR-026-AC6: `10-9` 행(단가 없는 모델) = 한 줄, 칩 `단가 없음`
    await expect(panel.locator('[data-wf="10-9"]')).toHaveCount(costExpected.byModel.filter((row) => row.usd === null).length);
    await expect(panel.locator('[data-wf="10-9"]').getByText("단가 없음", { exact: true })).toBeVisible();

    // FR-025-AC4: 합계 줄 = totals, 모델 나눔의 합 = 합계
    const totals = costExpected.totals;
    expect(total.slice(1, 6)).toEqual([
      comma(totals.input),
      comma(totals.output),
      comma(totals.cacheCreation),
      comma(totals.cacheRead),
      comma(totals.total),
    ]);
    expect(total[6] ?? "").toContain(usd2(totals.usd));
    expect(total[6] ?? "").toContain(`단가 없는 모델 ${costExpected.excludedModelCount}개 제외`);
    expect(data.reduce((sum, cells) => sum + numberOf(cells[5] ?? ""), 0)).toBe(totals.total);
  });

  test("[FR-025-AC3][FR-025-AC4] 세션별 표: 세션 id 앞 8자·프로젝트 폴더·시작 시각(브라우저 시간대)·진입 방식, 토큰 합 내림차순·합 = 합계", async ({
    page,
  }) => {
    await openCostAll(page);
    const panel = await selectSplitTab(page, "세션별");
    for (const header of ["세션", "프로젝트 폴더", "시작 시각", "진입 방식", "토큰 합", "추정 금액"]) {
      await expect(panel.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }

    const expectedSessions = [...costExpected.bySession].sort((left, right) => right.total - left.total);
    await expect
      .poll(async () => (await splitRows(panel)).map((cells) => cells[0]))
      .toEqual([...expectedSessions.map((row) => row.short), "합계"]);

    const { data, total } = splitTotals(await splitRows(panel));
    expectedSessions.forEach((session, index) => {
      const cells = data[index] ?? [];
      expect(cells[0], "세션 id 앞 8자").toBe(session.sessionId.slice(0, 8));
      expect(cells[1] ?? "", `${session.short} 프로젝트 폴더`).toContain(session.project);
      expect(cells[2], `${session.short} 시작 시각`).toBe(monthDayTime(session.startedAt, SEOUL));
      expect(cells[3], `${session.short} 진입 방식`).toBe(entrypointLabel(session.entrypoint));
      expect(cells[4], `${session.short} 토큰 합`).toBe(comma(session.total));
      expect(cells[5] ?? "", `${session.short} 금액`).toMatch(/^\$\d+\.\d{2}$/);
    });
    // 전체 id는 화면에 나오지 않는다(앞 8자만)
    await expect(panel).not.toContainText(costExpected.bySession[0]?.sessionId ?? "");
    expect(total.some((cell) => cell.includes(comma(costExpected.totals.total)))).toBe(true);
    expect(data.reduce((sum, cells) => sum + numberOf(cells[4] ?? ""), 0)).toBe(costExpected.totals.total);
  });

  test("[FR-025-AC2][FR-025-AC4] 에이전트별 표: 에이전트 name·`기본 세션`·`미확인`, 토큰 합 내림차순·금액·합 = 합계", async ({ page }) => {
    // 서버는 `main_agent`가 NULL인 세션을 hook SessionStart로 60초마다 다시 판정한다(`TranscriptAgentResolver.resolveUnknownSessions`, ADR-81 결정 5).
    // e2e-19a가 `usage.jsonl`을 재생한 뒤 `기본 세션` 행이 나타나기까지 최대 약 60초라 이 표만 기다림을 넉넉히 둔다.
    test.setTimeout(100_000);
    await openCostAll(page);
    const panel = await selectSplitTab(page, "에이전트별");
    await expect(panel.getByRole("columnheader", { name: "에이전트", exact: true })).toBeVisible();

    const expectedAgents = [...costExpected.byAgentAfterReplay].sort((left, right) => right.total - left.total);
    await expect
      .poll(async () => (await splitRows(panel)).map((cells) => cells[0]), { timeout: 80_000, intervals: [1_000] })
      .toEqual([...expectedAgents.map((row) => row.agent), "합계"]);
    expect(expectedAgents.map((row) => row.agent)).toEqual(expect.arrayContaining(["기본 세션", "미확인"]));

    const { data, total } = splitTotals(await splitRows(panel));
    expectedAgents.forEach((agent, index) => {
      expect(data[index] ?? [], `에이전트 ${agent.agent}`).toEqual([
        agent.agent,
        comma(agent.input),
        comma(agent.output),
        comma(agent.cacheCreation),
        comma(agent.cacheRead),
        comma(agent.total),
        usd2(agent.usd),
      ]);
    });
    const totals = costExpected.totals;
    expect(total.slice(1, 6)).toEqual([
      comma(totals.input),
      comma(totals.output),
      comma(totals.cacheCreation),
      comma(totals.cacheRead),
      comma(totals.total),
    ]);
    expect(data.reduce((sum, cells) => sum + numberOf(cells[5] ?? ""), 0)).toBe(totals.total);
  });

  test("[FR-025-AC4] 날짜별 차트(Asia/Seoul): 막대 `MM-DD (요일) 합계 N.NM 토큰, 추정 $N.NN`·툴팁 토큰 4가지 = expected.json `byDate.Asia/Seoul`, 기록 없는 날은 0", async ({
    page,
  }) => {
    await openCostAll(page);
    await expectDateChart(page, costExpected.byDate["Asia/Seoul"], costExpected.byDate.UTC.map((row) => row.date));
  });

  test("[FR-027-AC4][FR-027-AC6] 상태줄을 받기 전: 한도 카드는 한도 캐시 값(5시간·주간)과 `한도 캐시` 출처, 플랜 `알 수 없음`, 상태줄 안내는 항상", async ({
    page,
  }) => {
    await openCostAll(page);
    const card = page.locator('[data-wf="10-6"]');
    await expect(card).toHaveAttribute("aria-label", "구독 · 사용 한도");
    await expect(card).toContainText("구독 · 사용 한도");
    await expect
      .poll(async () => limitSegments(await limitsText(page)).five, { message: "5시간 한도 캐시 값" })
      .toMatch(percentPattern(costExpected.limitsFromCache.fiveHour.utilization));
    const segments = limitSegments(await limitsText(page));
    expect(segments.five).toContain("한도 캐시");
    expect(segments.week).toMatch(percentPattern(costExpected.limitsFromCache.sevenDay.utilization));
    expect(segments.week).toContain("한도 캐시");
    expect(segments.plan).toContain("알 수 없음");
    await expect(card.getByRole("meter", { name: `5시간 한도 사용률 ${costExpected.limitsFromCache.fiveHour.utilization}%` })).toBeVisible();
    await expect(page.locator('[data-wf="10-8"]')).toContainText(
      "Claude Code CLI 세션이 돌 때만 상태줄 값이 갱신되고, 데스크톱 앱 세션에서는 상태줄이 돌지 않을 수 있습니다",
    );
  });

  test("[E2E-13][FR-025-AC1] 캡처 10-cost 3크기 (D-172, T-R4-22)", async ({ page }) => {
    await page.setViewportSize(CAPTURE_SIZE);
    await openCostAll(page);
    await expect(tokenTile(page, "입력 토큰")).toContainText(comma(costExpected.totals.input));
    await expect(splitCard(page).getByRole("tabpanel").locator('[data-wf="10-9"]')).toHaveCount(1);
    await settle(page);

    await captureBaseSizesAndRestore(
      page,
      "10-cost",
      check(page, "10 비용", [...COST_REGIONS, "10-9"], async (size) => {
        await expectCostLayout(page, size, true);
      }),
    );
  });

  test("[FR-026-AC3][FR-026-AC4][FR-026-AC1] 단가 창 `?dialog=price`: 출처·확인 날짜·모델 4가지 단가 = `GET /api/pricing`(이름 오름차순), 입력·저장 없음·`닫기`·ESC, 단가를 바꾸는 API 없음 + 캡처 10-1-price-panel 3크기", async ({
    page,
    request,
  }) => {
    await page.setViewportSize(CAPTURE_SIZE);
    const pricing = await getJson<{
      source: string;
      checkedAt: string;
      models: Array<{ model: string; input: number; output: number; cacheWrite: number; cacheRead: number }>;
    }>(request, "/api/pricing");
    expect(pricing.json.source).toBe("Anthropic 가격표");
    expect(pricing.json.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const names = pricing.json.models.map((row) => row.model);
    expect(names, "단가표는 모델 이름 오름차순").toEqual([...names].sort());

    // FR-026-AC1: 표의 단가 × expected.json 토큰 = expected.json 금액(단가 있는 모델 전부)
    for (const model of costExpected.byModel.filter((row) => row.priceModel !== null)) {
      const price = pricing.json.models.find((row) => row.model === model.priceModel);
      expect(price, `단가표에 ${model.priceModel}`).toBeDefined();
      const usd =
        (model.input * (price?.input ?? 0) +
          model.output * (price?.output ?? 0) +
          model.cacheCreation * (price?.cacheWrite ?? 0) +
          model.cacheRead * (price?.cacheRead ?? 0)) /
        1_000_000;
      expect(usd, `${model.model} 금액 공식`).toBeCloseTo(Number(model.usd), 7);
    }
    for (const model of costExpected.byModel.filter((row) => row.priceModel === null)) {
      expect(names, `${model.model}은 단가표에 없다`).not.toContain(model.model);
    }

    await openCostAll(page);
    const priceButton = page
      .getByRole("button", { name: "단가", exact: true })
      .or(page.getByRole("link", { name: "단가", exact: true }));
    await expect(priceButton).toBeEnabled();
    await priceButton.click();
    await expect(page).toHaveURL(/[?&]dialog=price(?:&|$)/);

    const dialog = page.getByRole("dialog", { name: "단가", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("100만 토큰당 USD · 읽기 전용");
    await expect(dialog).toContainText(new RegExp(`Anthropic 가격표\\s*·\\s*확인\\s*${regExpEscape(pricing.json.checkedAt)}`));

    const table = page.locator('[data-wf="10-1-2"]');
    for (const header of ["모델", "입력", "출력", "캐시 생성", "캐시 읽기"]) {
      await expect(table.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
    const rows = await splitRows(table);
    expect(rows).toEqual(
      pricing.json.models.map((row) => [
        row.model,
        priceText(row.input),
        priceText(row.output),
        priceText(row.cacheWrite),
        priceText(row.cacheRead),
      ]),
    );
    await expect(page.locator('[data-wf="10-1-3"]')).toContainText(
      "단가표에 없는 모델은 단가 없음으로 표시하고 합계에서 뺍니다 · 새 모델 단가는 앱 업데이트 때 추가됩니다",
    );

    // 읽기 전용: 입력란·저장·기본값으로·모델 추가 없음, 주 동작은 `닫기` 하나
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /저장|기본값|추가|삭제|수정/ })).toHaveCount(0);
    const close = page.locator('[data-wf="10-1-4"]').getByRole("button", { name: "닫기", exact: true }).or(
      page.locator('[data-wf="10-1-4"]').getByRole("link", { name: "닫기", exact: true }),
    );
    await expect(close).toBeFocused();
    await settle(page);

    await captureBaseSizesAndRestore(page, "10-1-price-panel", async (size) => {
      await expectRegionsVisible(page, ["NAV", "10-1-1", "10-1-2", "10-1-3", "10-1-4"], `10-1 ${sizeLabel(size)}`);
      await expectDialogWidth(page, size, "10-1-1", "price");
    });

    // ESC로 닫으면 10으로 돌아온다
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page).not.toHaveURL(/dialog=price/);
    await expect(tokenTile(page, "입력 토큰")).toContainText(comma(costExpected.totals.input));
    // `닫기` 버튼으로도 닫힌다
    await priceButton.click();
    await expect(dialog).toBeVisible();
    await close.click();
    await expect(dialog).toHaveCount(0);

    // FR-026-AC4: 단가를 바꾸는 API는 없다(허용 Origin + 브라우저 토큰이 있어도 405)
    const headers = await apiHeaders(request);
    const { baseUrl } = readE2eState();
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      const response = await request.fetch(`${baseUrl}/api/pricing`, { method, headers, data: {} });
      expect(response.status(), `${method} /api/pricing`).toBe(405);
    }
  });
});

// ── 시간대 UTC: 날짜 경계 ─────────────────────────────────────────────────────────

test.describe("[E2E-21] 10 비용 날짜 경계 (UTC)", () => {
  test.use({ timezoneId: "UTC" });

  test("[FR-025-AC4] 날짜는 브라우저 로컬 날짜: UTC 브라우저는 expected.json `byDate.UTC`(Seoul과 한 날짜가 다르다)", async ({ page }) => {
    await openCostAll(page);
    await expectDateChart(page, costExpected.byDate.UTC, costExpected.byDate["Asia/Seoul"].map((row) => row.date));
    // 합 = 합계
    const sum = costExpected.byDate.UTC.reduce((total, row) => total + row.total, 0);
    expect(sum).toBe(costExpected.totals.total);
  });
});

/**
 * 날짜별 차트를 expected.json과 맞춘다: 기록이 있는 날은 막대 `aria-label`과 툴팁(토큰 4가지)이 같고,
 * 다른 시간대 쪽에만 있는 날짜는 막대가 없거나 0이다.
 */
async function expectDateChart(
  page: Page,
  entries: Array<{ date: string; input: number; output: number; cacheCreation: number; cacheRead: number; total: number; usd: string }>,
  otherZoneDates: string[],
): Promise<void> {
  const chart = page.locator('[data-wf="10-7"]');
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute("aria-label", "날짜별 토큰 사용량");
  await expect(chart).toContainText("날짜별");

  for (const entry of entries) {
    const label = monthDay(entry.date);
    const bar = chart.locator(`[aria-label^="${label} ("]`);
    await expect(bar, `막대 ${label}`).toHaveCount(1);
    await expect(bar).toHaveAttribute(
      "aria-label",
      `${label} (${weekdayKo(entry.date)}) 합계 ${millions(entry.total)} 토큰, 추정 ${usd2(entry.usd)}`,
    );
    await bar.focus();
    const tip = page.getByRole("tooltip");
    await expect(tip, `툴팁 ${label}`).toBeVisible();
    await expect(tip).toContainText(new RegExp(`${regExpEscape(label)}\\s*\\(${weekdayKo(entry.date)}\\)`));
    await expect(tip).toContainText(new RegExp(`입력\\s*${regExpEscape(comma(entry.input))}\\s*·\\s*출력\\s*${regExpEscape(comma(entry.output))}`));
    await expect(tip).toContainText(
      new RegExp(`캐시 생성\\s*${regExpEscape(comma(entry.cacheCreation))}\\s*·\\s*캐시 읽기\\s*${regExpEscape(comma(entry.cacheRead))}`),
    );
  }

  // 이 시간대에 기록이 없는 날짜(다른 시간대에서는 기록이 있는 날): 막대가 없거나 토큰 0이다
  const own = new Set(entries.map((entry) => entry.date));
  for (const date of otherZoneDates.filter((candidate) => !own.has(candidate))) {
    const label = monthDay(date);
    const bar = chart.locator(`[aria-label^="${label} ("]`);
    if ((await bar.count()) > 0) {
      await expect(bar, `기록 없는 날 ${label}`).toHaveAttribute("aria-label", new RegExp(`합계 0\\.0M 토큰, 추정 \\$0\\.00$`));
      await bar.focus();
      await expect(page.getByRole("tooltip")).toContainText(/입력\s*0\s*·\s*출력\s*0/);
    }
  }
}

// ── 맨 마지막: 대화 기록에 줄 덧붙이기 (집계가 바뀐다) ─────────────────────────────

test.describe("[E2E-21] 10 비용 새 기록 반영", () => {
  test.use({ timezoneId: SEOUL });

  test("[FR-025-AC6][FR-025-AC1] fixture 대화 기록에 줄(같은 메시지 중복 줄 + 새 메시지)을 덧붙이면 10초 안에 반영되고, 중복 줄은 세지 않으며, 다시 읽어도 값이 변하지 않는다", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const state = readE2eState();
    expect(state.claudeHomeDir, "E2E_CLAUDE_HOME_FIXTURE=claude-home-basic 필요").not.toBeNull();
    const file = join(
      state.claudeHomeDir as string,
      ".claude",
      "projects",
      "-home-fixture-work-aoji-fixture-app",
      "e5f6a7b8-0000-4000-8000-000000000002.jsonl",
    );
    expect(existsSync(file), `대화 기록 ${file}`).toBe(true);
    const original = readFileSync(file, "utf8");
    const duplicateSource = original.split("\n").find((line: string) => line.includes('"msg_s2_g"'));
    expect(duplicateSource, "중복으로 쓸 기존 assistant 줄(msg_s2_g)").toBeDefined();

    // 새 메시지: 단가가 있는 모델 하나, 입력 100·출력 50(캐시 0)
    const added = { input: 100, output: 50 };
    const fresh = JSON.parse(duplicateSource as string) as {
      uuid: string;
      timestamp: string;
      requestId: string;
      message: { id: string; model: string; content: Array<{ type: string; text: string }>; usage: Record<string, unknown> };
    };
    fresh.uuid = "00000000-0000-4000-8000-0000000e2e21";
    fresh.timestamp = new Date().toISOString();
    fresh.requestId = "req_e2e21_new";
    fresh.message.id = "msg_e2e21_new";
    fresh.message.model = "claude-haiku-4-5";
    fresh.message.content = [{ type: "text", text: "e2e-21 덧붙인 줄" }];
    fresh.message.usage = {
      input_tokens: added.input,
      output_tokens: added.output,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    await openCostAll(page);
    const totals = costExpected.totals;
    await expect(tokenTile(page, "입력 토큰")).toContainText(comma(totals.input));
    const before = await readingStrip(page).innerText();
    expect(before).toMatch(new RegExp(`/\\s*${costExpected.fileCount}(?!\\d)`));

    const prefix = original.endsWith("\n") ? "" : "\n";
    const startedAt = Date.now();
    appendFileSync(file, `${prefix}${duplicateSource}\n${JSON.stringify(fresh)}\n`);

    // 10초 안: 입력 +100·출력 +50. 중복 줄이 한 번 더 세어졌다면 값이 달라 여기서 걸린다.
    await expect
      .poll(async () => tokenTile(page, "입력 토큰").innerText(), {
        intervals: [250],
        timeout: 15_000,
        message: "덧붙인 줄이 15초 안에 입력 토큰에 반영되지 않았습니다(기능 결함)",
      })
      .toContain(comma(totals.input + added.input));
    const elapsedMs = Date.now() - startedAt;
    testInfo.annotations.push({ type: "FR-025-AC6 반영 시간", description: `줄 덧붙임 → 10 입력 토큰: ${elapsedMs}ms (기한 10000ms)` });
    process.stdout.write(`[FR-025-AC6 반영 시간] 줄 덧붙임 → 10 입력 토큰: ${elapsedMs}ms (기한 10000ms)\n`);
    expect(elapsedMs, `반영이 10초를 넘었습니다(실측 ${elapsedMs}ms)`).toBeLessThanOrEqual(10_000);

    await expect(tokenTile(page, "출력 토큰")).toContainText(comma(totals.output + added.output));
    await expect(tokenTile(page, "캐시 생성 토큰")).toContainText(comma(totals.cacheCreation));
    await expect(tokenTile(page, "캐시 읽기 토큰")).toContainText(comma(totals.cacheRead));
    const panel = await selectSplitTab(page, "모델별");
    const haiku = costExpected.byModel.find((row) => row.model === "claude-haiku-4-5");
    expect(haiku).toBeDefined();
    await expect
      .poll(async () => (await splitRows(panel)).find((cells) => cells[0] === "claude-haiku-4-5")?.[1])
      .toBe(comma((haiku?.input ?? 0) + added.input));

    // 증분 읽기 주기(5초, ADR-81)보다 길게 두고 다시 확인한다: 이미 읽은 줄을 다시 세지 않는다(멱등). 고정 대기는 이 부정 확인 하나뿐이다.
    await page.waitForTimeout(6_500);
    await expect(tokenTile(page, "입력 토큰")).toContainText(comma(totals.input + added.input));
    await expect(tokenTile(page, "출력 토큰")).toContainText(comma(totals.output + added.output));
    await expect(readingStrip(page)).toContainText(new RegExp(`/\\s*${costExpected.fileCount}(?!\\d)`));
  });
});
