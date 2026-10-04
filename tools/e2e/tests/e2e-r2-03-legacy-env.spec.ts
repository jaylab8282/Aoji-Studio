// E2E-R2-03 옛 환경 변수 (architecture.md §8.4.2, ADR-56). v1.0.x 호환 · v1.1.0에서 제거.
// fixture: `project-configured` + `E2E_COMPOSE=legacy-env`(compose.e2e-legacy-env.yaml이 JAYSTUDIO_*만 넘긴다).
// 검증 ID: FR-014-AC4, NFR-05.
import { expect, test } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
import { containerLogs, legacyLinesOfKind } from "../lib/legacy-fixture";
import { gotoReady } from "./ui-helpers";

const LEGACY_ENV_NAMES = [
  "JAYSTUDIO_HOST_PATH",
  "JAYSTUDIO_PUBLIC_PORT",
  "JAYSTUDIO_MOUNT_PATH",
  "JAYSTUDIO_DATA_PATH",
  "JAYSTUDIO_HELPER_URL",
  "JAYSTUDIO_ALLOWED_ORIGINS",
];

test("[FR-014-AC4][NFR-05][ADR-56][E2E-R2-03] 옛 이름만으로 기동 → 07 `마운트 폴더`·`수집 주소` 값대로, 로그 `[legacy] env`(변수 이름만, 값 0건)", async ({
  page,
}) => {
  const state = readE2eState();
  expect(state.composeFile.endsWith("compose.e2e-legacy-env.yaml"), "옛 환경 변수 compose로 기동하지 않았습니다").toBe(
    true,
  );

  await gotoReady(page, "/settings");
  // 옛 HOST_PATH 값이 그대로 마운트 폴더(맥북 경로)로 보인다. 컨테이너 경로가 아니다.
  const mountRow = page.getByTestId("settings-row-mount-path");
  await expect(mountRow).toContainText(state.fixtureDir);
  await expect(mountRow).not.toContainText("/workspace");
  // 옛 PUBLIC_PORT(4185)로 만든 수집 주소다.
  await expect(page.getByTestId("settings-row-collect-url")).toContainText(`${state.baseUrl}/hooks/events`);

  const warnings = legacyLinesOfKind("env", containerLogs());
  expect(warnings.length, "[legacy] env 경고가 없습니다").toBeGreaterThanOrEqual(1);
  const joined = warnings.join("\n");
  // 이름은 있다.
  expect(joined).toContain("JAYSTUDIO_HOST_PATH");
  expect(joined).toContain("JAYSTUDIO_PUBLIC_PORT");
  expect(warnings.some((line) => LEGACY_ENV_NAMES.some((name) => line.includes(name)))).toBe(true);
  // 값은 없다(NFR-08: 경로·포트·Origin).
  expect(joined.includes(state.fixtureDir), "경고에 마운트 경로 값이 있습니다").toBe(false);
  expect(joined.includes(state.baseUrl), "경고에 Origin·주소 값이 있습니다").toBe(false);
  expect(joined.includes(new URL(state.baseUrl).port), "경고에 포트 값이 있습니다").toBe(false);
});
