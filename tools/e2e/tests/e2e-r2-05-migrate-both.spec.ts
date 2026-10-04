// E2E-R2-05 마이그레이션: `.jaystudio/`와 `.aojistudio/`가 둘 다 있음 (architecture.md §8.4.2, ADR-55). v1.0.x 호환.
// fixture: `project-legacy-both` (호환 배치 ③). 아무것도 옮기지 않고 `.aojistudio/`를 쓴다.
// 검증 ID: NFR-09, NFR-08.
import { existsSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
import {
  FIXTURE_DATA_DIR,
  FIXTURE_LEGACY_DIR,
  containerLogs,
  expectNoTokenInLogs,
  fixtureFile,
  hookPayload,
  legacyInfo,
  legacyLinesOfKind,
  sha256Tree,
} from "../lib/legacy-fixture";
import { floorName, gotoReady } from "./ui-helpers";

test("[NFR-09][ADR-55][E2E-R2-05] `.jaystudio/` sha256 불변, 02에 `new-team`만(`old-team` 없음)", async ({ page }) => {
  const info = legacyInfo();
  expect(info.kind).toBe("both");
  expect(sha256Tree(fixtureFile(FIXTURE_LEGACY_DIR))).toEqual(info.legacyDirSha256);
  expect(existsSync(fixtureFile(FIXTURE_DATA_DIR, "teams", "new-team.json"))).toBe(true);

  await gotoReady(page, "/workflows");
  await expect(floorName(page, "new-team")).toBeVisible();
  await expect(floorName(page, "old-team")).toHaveCount(0);
});

test("[NFR-09][NFR-08][ADR-55][E2E-R2-05] \"둘 다 있음\" 경고 1줄(`401`·`07의 새 설정 예시`), `.jaystudio/collect-token` 값으로 수집 POST → 401", async ({
  request,
}) => {
  const state = readE2eState();
  const info = legacyInfo();
  const oldToken = info.oldCollectToken;
  if (oldToken === null) {
    throw new Error("both fixture에 옛 collect-token이 없습니다");
  }

  const warnings = legacyLinesOfKind("data-dir", containerLogs());
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("모두 있어");
  expect(warnings[0]).toContain("401");
  expect(warnings[0]).toContain("07의 새 설정 예시");

  const post = (token: string, sessionId: string) =>
    request.post(`${state.baseUrl}/hooks/events`, {
      headers: { "Content-Type": "application/json", "X-AojiStudio-Collect-Token": token },
      data: hookPayload({ sessionId, agentType: "new-lead", eventName: "SessionStart" }),
    });

  // 경고 문구가 말하는 상황: 옛 폴더의 토큰은 서버가 쓰는 토큰(`.aojistudio/collect-token`)과 달라 401이다.
  expect((await post(oldToken, "e2e-r2-05-old")).status()).toBe(401);
  // 대조: 서버가 쓰는 새 폴더 토큰은 204다(401의 원인이 토큰 값이다).
  expect((await post(info.collectToken, "e2e-r2-05-new")).status()).toBe(204);

  // 호스트는 끝까지 그대로다.
  expect(sha256Tree(fixtureFile(FIXTURE_LEGACY_DIR))).toEqual(info.legacyDirSha256);
  expectNoTokenInLogs(containerLogs(), [info.collectToken, oldToken]);
});
