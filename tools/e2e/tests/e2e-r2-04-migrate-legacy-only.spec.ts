// E2E-R2-04 마이그레이션: `.jaystudio/`만 있는 쓰기 가능 마운트 (architecture.md §8.4.2, ADR-55). v1.0.x 호환.
// 배치 10에서 R2-02 → R2-04 → R2-07 순서로 실행(run-e2e.sh). R2-07은 R2-04의 이동 결과에 의존.
// fixture: `project-legacy-only` (호환 배치 ①). 첫 기동에서 옛 데이터 폴더가 새 폴더로 옮겨진다.
// 검증 ID: NFR-09, FR-001-AC1, NFR-08.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  containerLogs,
  expectMigratedOnHost,
  expectNoTokenInLogs,
  hookPayload,
  legacyInfo,
  legacyLinesOfKind,
  migratedCollectTokenFile,
  replayWithTokenFile,
  restartContainer,
} from "../lib/legacy-fixture";
import { floorName, gotoReady, spriteBox } from "./ui-helpers";

// 로그 줄 수 비교(재시작 전후)가 이어지므로 실행 순서를 고정한다.
test.describe.configure({ mode: "serial" });

test("[NFR-09][FR-001-AC1][ADR-55][E2E-R2-04] 호스트: `.aojistudio/`로 이동(구성·휴지통·토큰 바이트 동일), `.jaystudio` 없음", () => {
  expectMigratedOnHost();
});

test("[FR-001-AC1][NFR-09][ADR-55][E2E-R2-04] 02에 `legacy-team` 층, 써 둔 토큰 + 새 헤더 재생 → 상태 전이", async ({ page }) => {
  await gotoReady(page, "/workflows");
  await expect(floorName(page, "legacy-team")).toBeVisible();
  await expect(spriteBox(page, "legacy-lead").getByText("대기", { exact: true })).toBeVisible();

  // 이동된 새 폴더의 collect-token(= 기동 전에 하네스가 옛 폴더에 써 둔 값)으로 재생 도구를 돌린다.
  const scratchDir = mkdtempSync(join(tmpdir(), "aojistudio-e2e-r2-04-"));
  try {
    const stdout = replayWithTokenFile({
      tokenFile: migratedCollectTokenFile(),
      scratchDir,
      lines: [
        hookPayload({ sessionId: "sess-r2-04", agentType: "legacy-lead", eventName: "SessionStart" }),
        hookPayload({ sessionId: "sess-r2-04", agentType: "legacy-lead", eventName: "PreToolUse", toolName: "Edit" }),
      ],
    });
    expect(stdout).toContain("재생 완료: 2건 전송");
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
  await expect(spriteBox(page, "legacy-lead").getByText("작업 중", { exact: true })).toBeVisible();
});

test("[NFR-09][NFR-08][ADR-55][E2E-R2-04] 로그 `[legacy] data-dir` 1줄(토큰 값 0건), `docker compose restart` 후 추가 0줄", async () => {
  const info = legacyInfo();
  const before = legacyLinesOfKind("data-dir", containerLogs());
  expect(before).toHaveLength(1);
  expect(before[0]).toContain("옮김");
  expectNoTokenInLogs(containerLogs(), [info.collectToken, info.helperToken]);

  await restartContainer();

  // 두 번째 기동은 `.aojistudio/`만 있는 상태라 경고가 없다. 컨테이너 로그는 재시작 뒤에도 이어진다.
  const after = legacyLinesOfKind("data-dir", containerLogs());
  expect(after).toHaveLength(1);
  // 이동된 상태는 그대로다.
  expectMigratedOnHost();
});
