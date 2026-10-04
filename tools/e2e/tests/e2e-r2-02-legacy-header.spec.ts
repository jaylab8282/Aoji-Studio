// E2E-R2-02 옛 수집 헤더 (architecture.md §8.4.2, ADR-54). v1.0.x 호환 · v1.1.0에서 제거.
// 배치 10에서 R2-02 → R2-04 → R2-07 순서로 실행(run-e2e.sh). R2-07은 R2-04의 이동 결과에 의존.
// fixture: `project-legacy-only` (호환 배치 ①). 옛 헤더 `X-JayStudio-Collect-Token`으로 직접 POST해도 수집된다.
// 검증 ID: FR-003-AC2, NFR-08.
import { expect, test } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
import {
  containerLogs,
  expectNoTokenInLogs,
  hookPayload,
  legacyInfo,
  legacyLinesOfKind,
} from "../lib/legacy-fixture";
import { gotoReady } from "./ui-helpers";

const LEGACY_COLLECT_HEADER = "X-JayStudio-Collect-Token";
const MASKED_TOKEN = "••••••••";

test("[FR-003-AC2][NFR-08][ADR-54][E2E-R2-02] 옛 헤더로 직접 POST → 204, 01 실시간 이벤트 행 표시, 로그 `[legacy] collect-header` ≥ 1줄, 토큰 값 0건", async ({
  page,
  request,
}) => {
  const state = readE2eState();
  const info = legacyInfo();
  const sessionId = `e2e-r2-02-${Date.now()}`;

  const response = await request.post(`${state.baseUrl}/hooks/events`, {
    headers: { "Content-Type": "application/json", [LEGACY_COLLECT_HEADER]: info.collectToken },
    data: hookPayload({ sessionId, agentType: "legacy-lead", eventName: "SessionStart" }),
  });
  expect(response.status()).toBe(204);

  // 저장·표시: 01 실시간 이벤트 표에 그 이벤트 행이 나온다(워크플로우 `legacy-team`, 에이전트 `legacy-lead`).
  await gotoReady(page, "/");
  const events = page.getByRole("region", { name: "실시간 이벤트", exact: true });
  const rows = events.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("legacy-team");
  await expect(rows.first()).toContainText("legacy-lead");

  // 잘못된 옛 헤더 토큰은 받지 않는다(옛 헤더도 같은 토큰 검증을 거친다).
  const rejected = await request.post(`${state.baseUrl}/hooks/events`, {
    headers: { "Content-Type": "application/json", [LEGACY_COLLECT_HEADER]: "f".repeat(64) },
    data: hookPayload({ sessionId: `${sessionId}-bad`, agentType: "legacy-lead", eventName: "SessionStart" }),
  });
  expect(rejected.status()).toBe(401);

  // 로그: 경고는 있고 토큰 값은 없다. 토큰 자리는 ••••••••이다.
  const logs = containerLogs();
  const warnings = legacyLinesOfKind("collect-header", logs);
  expect(warnings.length).toBeGreaterThanOrEqual(1);
  expect(warnings[0]).toContain(LEGACY_COLLECT_HEADER);
  expect(warnings[0]).toContain(MASKED_TOKEN);
  expectNoTokenInLogs(logs, [info.collectToken, info.helperToken, "f".repeat(64)]);
});
