// E2E-R2-04b 읽기 전용 마운트 + `.jaystudio/`만 (architecture.md §8.4.2, ADR-55 상태 A-RO). v1.0.x 호환.
// fixture: `project-legacy-only` + `E2E_MOUNT_MODE=ro` (호환 배치 ②). 읽기 전용이라 옮기지 않고 옛 폴더를
// 읽기 전용 데이터 폴더로 써서 기동한다. 이어서 같은 임시 폴더를 rw로 다시 띄우면 이동한다.
// 검증 ID: FR-001-E2, NFR-09, NFR-08.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
import {
  FIXTURE_DATA_DIR,
  FIXTURE_LEGACY_DIR,
  containerLogs,
  expectMigratedOnHost,
  expectNoTokenInLogs,
  fixtureFile,
  hookPayload,
  legacyInfo,
  legacyLinesOfKind,
  migratedCollectTokenFile,
  recreateWithMountMode,
  replayWithTokenFile,
  sha256Tree,
  workspaceMountIsReadWrite,
} from "../lib/legacy-fixture";
import { floorCard, floorName, gotoReady, spriteBox } from "./ui-helpers";

const WRITABLE_FALSE_REASON = "쓰기 권한 없음";

test.describe.configure({ mode: "serial" });

test("[FR-001-E2][NFR-09][ADR-55][E2E-R2-04b] `:ro` 마운트로 기동 → 02 `legacy-team` 층 + 쓰기 버튼 3개 비활성(`쓰기 권한 없음`)", async ({ page }) => {
  expect(workspaceMountIsReadWrite(), "/workspace가 읽기 전용으로 마운트되지 않았습니다(E2E_MOUNT_MODE=ro)").toBe(false);

  await gotoReady(page, "/workflows");
  await expect(floorName(page, "legacy-team")).toBeVisible();

  // 비활성 버튼 옆에 이유가 붙는다(Button: 버튼 + 이유 span이 한 래퍼 안).
  const header = page.getByRole("button", { name: "+ 워크플로우 추가", exact: true });
  const importButton = floorCard(page, "legacy-team").getByRole("button", { name: "가져오기", exact: true });
  const createButton = floorCard(page, "legacy-team").getByRole("button", { name: "+ 만들기", exact: true });
  for (const button of [header, importButton, createButton]) {
    await expect(button).toBeDisabled();
    await expect(button.locator("xpath=..")).toContainText(WRITABLE_FALSE_REASON);
  }
});

test("[FR-001-E2][NFR-09][ADR-55][E2E-R2-04b] 07 `워크플로우 구성` = `.jaystudio/teams/*.json`, `쓰기 권한 없음`", async ({ page }) => {
  await gotoReady(page, "/settings");
  await expect(page.getByTestId("settings-row-teams")).toContainText(`${FIXTURE_LEGACY_DIR}/teams/*.json`);
  await expect(page.getByTestId("settings-row-trash")).toContainText(`${FIXTURE_LEGACY_DIR}/trash/`);
  await expect(page.getByTestId("settings-row-writable")).toContainText(WRITABLE_FALSE_REASON);
});

test("[NFR-09][NFR-08][ADR-55][E2E-R2-04b] 로그 `[legacy] data-dir` \"읽기 전용\" 1줄, 써 둔 토큰 + 새 헤더 수집 → 204, 호스트 `.jaystudio/` sha256 불변·`.aojistudio` 없음", async ({
  page,
  request,
}) => {
  const state = readE2eState();
  const info = legacyInfo();

  const warnings = legacyLinesOfKind("data-dir", containerLogs());
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("읽기 전용");

  // 읽기 전용이어도 이벤트 수집은 된다(이벤트는 볼륨에 저장).
  const sessionId = `e2e-r2-04b-${Date.now()}`;
  const response = await request.post(`${state.baseUrl}/hooks/events`, {
    headers: { "Content-Type": "application/json", "X-AojiStudio-Collect-Token": info.collectToken },
    data: hookPayload({ sessionId, agentType: "legacy-lead", eventName: "SessionStart" }),
  });
  expect(response.status()).toBe(204);
  await gotoReady(page, "/");
  await expect(page.getByRole("region", { name: "실시간 이벤트", exact: true }).locator("tbody tr")).toHaveCount(1);

  // 호스트 폴더는 그대로다.
  expect(sha256Tree(fixtureFile(FIXTURE_LEGACY_DIR))).toEqual(info.legacyDirSha256);
  expect(existsSync(fixtureFile(FIXTURE_DATA_DIR)), "읽기 전용 마운트인데 새 데이터 폴더가 생겼습니다").toBe(false);
  expectNoTokenInLogs(containerLogs(), [info.collectToken, info.helperToken]);
});

test("[NFR-09][FR-001-AC1][ADR-55][E2E-R2-04b] 같은 임시 폴더를 `rw`로 재기동 → 이동 완료(E2E-R2-04와 같은 단언)", async ({ page }) => {
  const info = legacyInfo();
  await recreateWithMountMode("rw");
  expect(workspaceMountIsReadWrite(), "재기동한 컨테이너의 /workspace가 쓰기 가능이 아닙니다").toBe(true);

  expectMigratedOnHost();
  const moved = legacyLinesOfKind("data-dir", containerLogs());
  expect(moved).toHaveLength(1);
  expect(moved[0]).toContain("옮김");

  await gotoReady(page, "/workflows");
  await expect(floorName(page, "legacy-team")).toBeVisible();
  // 이제 쓰기 버튼이 활성이다.
  await expect(page.getByRole("button", { name: "+ 워크플로우 추가", exact: true })).toBeEnabled();

  const scratchDir = mkdtempSync(join(tmpdir(), "aojistudio-e2e-r2-04b-"));
  try {
    const stdout = replayWithTokenFile({
      tokenFile: migratedCollectTokenFile(),
      scratchDir,
      lines: [
        hookPayload({ sessionId: "sess-r2-04b", agentType: "legacy-lead", eventName: "SessionStart" }),
        hookPayload({ sessionId: "sess-r2-04b", agentType: "legacy-lead", eventName: "PreToolUse", toolName: "Edit" }),
      ],
    });
    expect(stdout).toContain("재생 완료: 2건 전송");
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
  await expect(spriteBox(page, "legacy-lead").getByText("작업 중", { exact: true })).toBeVisible();
  expectNoTokenInLogs(containerLogs(), [info.collectToken, info.helperToken]);
});
