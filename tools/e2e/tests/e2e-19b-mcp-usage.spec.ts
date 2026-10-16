// E2E-19 중 09 MCP 사용 에이전트 부분(T-R4-17, 배치 13): 실제 사용(기본 세션 포함)과 새 이벤트 재조회.
// fixture: `project-usage` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-basic`. 검증 ID: FR-024-AC2·AC3, ADR-94(재조회 1초에 1회 이하).
//
// `usage.jsonl`은 e2e-19a가 이미 모두 재생했다(파일 이름순으로 먼저 돈다). 이 spec은 다시 재생하지 않고 쌓인 데이터를 읽는다.
// 마지막 테스트만 31번 줄(기본 세션의 `mcp__github__get_issue`)을 `LIVE_EXTRA_GITHUB_MAIN_CALLS`번 더 재생한다 — 뒤의 e2e-20이 이 증가를 허용한다.
// 목킹 없음(conventions §8).
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { replayScenarioLines, SCENARIOS_DIR } from "../lib/replay";
import {
  actualAgentPattern,
  expandMcpRow,
  expectActualUsage,
  GITHUB_MAIN_CALL_LINE,
  LIVE_EXTRA_GITHUB_MAIN_CALLS,
  mcpExpected,
  mcpList,
  mcpPeriodButton,
  mcpRow,
} from "./mcp-helpers";
import { gotoReady, measureFileChangeReflection } from "./ui-helpers";

test.describe.configure({ mode: "serial" });

const USAGE_SCENARIO = join(SCENARIOS_DIR, "usage.jsonl");

test("[FR-024-AC2][E2E-19] 실제 사용: 서버마다 에이전트 이름 + 횟수, `agent_type` 없는 호출은 `기본 세션`, 호출 없는 서버는 `기간 안 호출 없음`(7일·30일·전체 같음)", async ({
  page,
}) => {
  await gotoReady(page, "/mcp");
  await expect(mcpList(page)).toBeVisible();

  for (const period of ["7일", "30일", "전체"] as const) {
    await mcpPeriodButton(page, period).click();
    await expect(mcpPeriodButton(page, period)).toHaveAttribute("aria-pressed", "true");
    for (const row of mcpExpected.rows) {
      const li = await expandMcpRow(page, row.name);
      await expectActualUsage(li, row);
    }
  }

  // 기본 세션은 `사용 에이전트 N명`에 들지 않는다(FR-024-AC4): demo-helper는 기본 세션 호출만 있어 0명
  const demo = mcpRow(page, "demo-helper");
  await expect(demo.getByRole("button", { name: "사용 에이전트 0명", exact: true })).toBeVisible();
  await expect(demo).toContainText(actualAgentPattern("기본 세션", 1));
});

test("[FR-024-AC3][ADR-94][E2E-19] 새 mcp 호출 이벤트 → `usage-changed` `mcp` 재조회로 2초 안에 횟수가 늘고, `GET /api/mcp`는 1초에 1회 이하다", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const github = mcpExpected.rows.find((row) => row.name === "github");
  expect(github).toBeDefined();
  const before = github?.actualAgents.find((actual) => actual.agent === "기본 세션")?.count ?? 0;
  expect(before).toBeGreaterThan(0);

  const requestTimes: number[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" && new URL(request.url()).pathname === "/api/mcp") {
      requestTimes.push(Date.now());
    }
  });

  await gotoReady(page, "/mcp");
  await expect(mcpList(page)).toBeVisible();
  const li = await expandMcpRow(page, "github");
  await expect(li).toContainText(actualAgentPattern("기본 세션", before));
  const initialRequests = requestTimes.length;

  // 짧은 시간에 연달아 들어온 이벤트(폭주)도 첫 반영은 2초 안, 마지막 값은 반드시 반영된다.
  await measureFileChangeReflection(
    testInfo,
    "mcp 호출 이벤트 → 09 기본 세션 횟수",
    () => {
      for (let index = 0; index < LIVE_EXTRA_GITHUB_MAIN_CALLS; index += 1) {
        replayScenarioLines({ from: GITHUB_MAIN_CALL_LINE, to: GITHUB_MAIN_CALL_LINE, scenarioPath: USAGE_SCENARIO });
      }
    },
    async () => {
      const text = (await li.allTextContents()).join(" ");
      return actualAgentPattern("기본 세션", before + LIVE_EXTRA_GITHUB_MAIN_CALLS).test(text);
    },
  );
  await expect(li).toContainText(actualAgentPattern("기본 세션", before + LIVE_EXTRA_GITHUB_MAIN_CALLS));
  // 합집합 수는 그대로(기본 세션은 세지 않는다)
  await expect(li.getByRole("button", { name: `사용 에이전트 ${github?.usedAgentCount ?? -1}명`, exact: true })).toBeVisible();

  // ADR-94: 재조회 간격 ≥ 1초(관측 오차 100ms 허용). 이벤트 3건이 짧은 간격으로 왔는데 재조회가 건마다 나가면 여기서 걸린다.
  const refetches = requestTimes.slice(initialRequests);
  expect(refetches.length, "이벤트 뒤 재조회가 한 번 이상 있어야 합니다").toBeGreaterThanOrEqual(1);
  expect(refetches.length, `재조회가 이벤트 ${LIVE_EXTRA_GITHUB_MAIN_CALLS}건마다 나갔습니다`).toBeLessThanOrEqual(2);
  for (let index = 1; index < refetches.length; index += 1) {
    expect((refetches[index] ?? 0) - (refetches[index - 1] ?? 0), `재조회 간격 ${index}`).toBeGreaterThanOrEqual(900);
  }
});
