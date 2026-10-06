// E2E-17 옛 이름 미지원 (architecture.md §8.2 E2E-17, ADR-61·ADR-62). ADR-62 예외 경로 — 옛 이름을 일부러 쓴다.
// fixture: `project-old-name` (`.jaystudio/`만 있다. 옛 토큰 파일은 커밋하지 않고 이 spec이 임시 복사본에 써 넣는다).
// 공용 하네스(globalSetup·ui-helpers 등)에는 옛 이름을 두지 않는다. 컨테이너 로그의 옛 호환 경고 0줄은
// globalTeardown이 모든 배치에서 따로 단언한다(NFR-13 ⑥).
// 검증 ID: NFR-13 ①③, FR-003-AC2, FR-001-AC6.
//
// 한계: 컨테이너는 이 spec이 돌기 전에 globalSetup이 이미 띄웠으므로 옛 토큰 파일은 기동 뒤에 써 넣는다.
// 서버가 옛 폴더를 기동 때도 요청 때도 읽지 않는다는 판정은 sha256 불변 + 401로 확인한다.
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { expect, test } from "@playwright/test";

import { COMPOSE_FILE, E2E_DIR, composeEnv, readE2eState } from "../lib/e2e-state";
import { gotoReady } from "./ui-helpers";

const OLD_DIR_NAME = ".jaystudio";
const NEW_DIR_NAME = ".aojistudio";
const OLD_HEADER = "X-JayStudio-Collect-Token";
const NEW_HEADER = "X-AojiStudio-Collect-Token";

test.describe.configure({ mode: "serial" });

function sha256Tree(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        result[relative(root, full)] = createHash("sha256").update(readFileSync(full)).digest("hex");
      }
    }
  };
  walk(root);
  return result;
}

function hookPayload(sessionId: string): Record<string, unknown> {
  return {
    session_id: sessionId,
    cwd: "/workspace",
    hook_event_name: "SessionStart",
    agent_type: "alpha-lead",
    permission_mode: "default",
  };
}

const oldDir = (): string => join(readE2eState().fixtureDir, OLD_DIR_NAME);
const newDir = (): string => join(readE2eState().fixtureDir, NEW_DIR_NAME);

let oldCollectToken = "";
let oldHelperToken = "";
let oldDirHashes: Record<string, string> = {};

test.beforeAll(() => {
  oldCollectToken = randomBytes(32).toString("hex");
  oldHelperToken = randomBytes(32).toString("hex");
  for (const [name, token] of [
    ["collect-token", oldCollectToken],
    ["helper-token", oldHelperToken],
  ] as const) {
    const path = join(oldDir(), name);
    mkdirSync(oldDir(), { recursive: true });
    writeFileSync(path, token, { encoding: "utf8", mode: 0o600 });
    chmodSync(path, 0o600);
  }
  oldDirHashes = sha256Tree(oldDir());
});

test("[NFR-13-1][NFR-13-3][FR-003-AC2][FR-001-AC6][E2E-17] 옛 폴더만 있는 마운트 → 옛 폴더 sha256 불변, `.aojistudio/collect-token` 생성, 02에 04-7", async ({
  page,
}) => {
  expect(Object.keys(oldDirHashes).length, "옛 폴더 파일(구성·휴지통·토큰 2개)").toBeGreaterThanOrEqual(4);
  expect(sha256Tree(oldDir())).toEqual(oldDirHashes);

  const collectTokenFile = join(newDir(), "collect-token");
  expect(existsSync(collectTokenFile), "`.aojistudio/collect-token`이 없습니다").toBe(true);
  expect(statSync(collectTokenFile).mode & 0o777).toBe(0o600);
  expect(readFileSync(collectTokenFile, "utf8")).not.toBe(oldCollectToken);
  // 옛 폴더 구성 파일의 워크플로우는 읽지 않는다: 새 폴더에 구성이 없다.
  expect(existsSync(join(newDir(), "teams", "old-team.json"))).toBe(false);

  await gotoReady(page, "/workflows");
  await expect(page.getByText("아직 워크플로우가 없습니다", { exact: true })).toBeVisible();
  await expect(page.getByText("old-team", { exact: true })).toHaveCount(0);

  expect(sha256Tree(oldDir())).toEqual(oldDirHashes);
});

test("[NFR-13-1][FR-003-AC2][E2E-17] 옛 헤더 + 옛 토큰 → 401, 옛 헤더 + 새 토큰 → 401, 새 헤더 + 새 토큰 → 204", async ({
  request,
}) => {
  const state = readE2eState();
  const url = `${state.baseUrl}/hooks/events`;
  const contentType = { "Content-Type": "application/json" };

  const oldHeaderOldToken = await request.post(url, {
    headers: { ...contentType, [OLD_HEADER]: oldCollectToken },
    data: hookPayload("e2e-17-old-header-old-token"),
  });
  expect(oldHeaderOldToken.status()).toBe(401);

  const oldHeaderNewToken = await request.post(url, {
    headers: { ...contentType, [OLD_HEADER]: state.collectToken },
    data: hookPayload("e2e-17-old-header-new-token"),
  });
  expect(oldHeaderNewToken.status()).toBe(401);

  const newHeaderNewToken = await request.post(url, {
    headers: { ...contentType, [NEW_HEADER]: state.collectToken },
    data: hookPayload("e2e-17-new-header-new-token"),
  });
  expect(newHeaderNewToken.status()).toBe(204);

  expect(sha256Tree(oldDir())).toEqual(oldDirHashes);
});

test("[NFR-13-1][FR-003-AC2][E2E-17] 01 실시간 이벤트에 401을 받은 두 요청의 행은 0, 204 요청의 행만 1 (로그에 토큰 값 0건)", async ({
  page,
}) => {
  const state = readE2eState();
  await gotoReady(page, "/");
  const events = page.getByRole("region", { name: "실시간 이벤트", exact: true });
  const rows = events.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("alpha-lead");

  const logs = execFileSync(
    "docker",
    ["compose", "-f", COMPOSE_FILE, "logs", "--no-color", "--no-log-prefix"],
    { cwd: E2E_DIR, env: composeEnv(state.fixtureDir), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  for (const token of [oldCollectToken, oldHelperToken, state.collectToken]) {
    expect(logs.includes(token), "컨테이너 로그에 토큰 값이 있습니다(NFR-08)").toBe(false);
  }
});
