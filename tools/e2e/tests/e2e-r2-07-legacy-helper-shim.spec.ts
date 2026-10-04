// E2E-R2-07 옛 도우미 shim (architecture.md §8.4.2, ADR-57). v1.0.x 호환 · v1.1.0에서 제거.
// fixture: `project-legacy-only` (호환 배치 ①, 마이그레이션이 끝난 뒤). 옛 plist가 넘기던 인자
// (`jaystudio-helper.mjs … --token-file <fixture>/.jaystudio/helper-token`)로 dry-run 도우미를 띄워도 02 `Claude 열기`가 동작한다.
// 검증 ID: FR-013-AC1, FR-013-AC7.
import { readFileSync } from "node:fs";

import { expect, test, type Request } from "@playwright/test";

import { HELPER_LOG_PATH, helperDryRunLines, readE2eState } from "../lib/e2e-state";
import { expectMigratedOnHost, legacyInfo, startShimHelper } from "../lib/legacy-fixture";
import { SETUP_REFLECT_TIMEOUT_MS, gotoReady } from "./ui-helpers";

const HELPER_PORT = 4191;
const OPEN_DEFAULT_SESSION_LABEL = "Claude 열기 · 기본 세션";

test("[FR-013-AC1][FR-013-AC7][ADR-57][E2E-R2-07] 마이그레이션 뒤 shim + 옛 인자(`--token-file <fixture>/.jaystudio/helper-token`) → 02 `Claude 열기` → stdout `DRY-RUN cd \"<fixture>\" && claude`", async ({
  page,
}) => {
  const state = readE2eState();
  const info = legacyInfo();
  // 준비: 서버가 옛 폴더를 새 폴더로 옮겼으므로 옛 인자의 토큰 파일 경로는 더 이상 없다.
  expectMigratedOnHost();

  const helper = await startShimHelper({ port: HELPER_PORT, allowedOrigin: state.baseUrl });
  try {
    // shim은 경고 1줄을 stderr로 남기고(ADR-57) 같은 인자로 새 도우미를 실행한다.
    const helperLog = readFileSync(HELPER_LOG_PATH, "utf8");
    expect(helperLog).toContain("[legacy]");
    const helperToken = info.helperToken;
    expect(helperToken, "legacy-only fixture에 helper-token이 없습니다").not.toBeNull();
    expect(helperLog.includes(helperToken as string), "도우미 로그에 토큰 값이 있습니다").toBe(false);

    const openRequests: Request[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).origin === state.helperUrl && request.method() === "POST") {
        openRequests.push(request);
      }
    });

    await gotoReady(page, "/workflows");
    const button = page.getByRole("button", { name: OPEN_DEFAULT_SESSION_LABEL, exact: true });
    await expect(button).toBeEnabled();

    const baseline = helperDryRunLines().length;
    await button.click();

    await expect
      .poll(() => helperDryRunLines().slice(baseline), {
        message: "shim 도우미 stdout에 DRY-RUN 한 줄이 추가되지 않았습니다",
        timeout: SETUP_REFLECT_TIMEOUT_MS,
      })
      .toEqual([`DRY-RUN cd "${state.fixtureDir}" && claude`]);

    // 브라우저가 도우미를 직접 호출했고 도우미가 그 토큰을 받아들였다(204 → 안내·에러 없음).
    expect(openRequests).toHaveLength(1);
    await expect(page.getByRole("dialog", { name: "열기 도우미가 응답하지 않습니다" })).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    await helper.stop();
  }
});
