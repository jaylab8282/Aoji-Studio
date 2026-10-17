// E2E-13 화면 대조 캡처 + 영역·배치 판정 (architecture.md §8.4, ui-spec "화면 대조 상태 표", ADR-75).
//
// 앱 화면 20개 × 1920×1080·1440×810·1080×1920 = 60장(v1.2.0은 32화면 96장 — 이 파일은 01·02·03·04-x·05-x·06-x 계열, 07·08·09·10 계열은
// 아래 "v1.2.0 화면" 표의 spec이 같은 3크기 방식으로 찍는다)을 `tools/e2e/screenshots/<원본 이름>@<W>x<H>.png`로 저장한다
// (`docs/ui/screens/`의 원본 PNG와 같은 이름 — 나란히 비교). 00 사이드 탭은 앱 화면이 아니라 상태 모음 보드라
// 캡처하지 않고, 다른 캡처의 `NAV`·`NAV-3`·`NAV-3R` 영역을 대조한다. 같은 순간에 그 화면의 `data-wf` 영역이
// 모두 있고 보이는지, ui-spec "크기별 배치 차이" 수치(±1px)가 맞는지 자동 판정한다. 판정이 어긋나면 테스트 실패다.
//
// 실행 단위(fixture가 다른 시나리오라 실행을 나눈다. 모든 describe 제목에 fixture 이름이 들어 있다):
//   배치 3  E2E_FIXTURE=project-no-agents-dir npx playwright test tests/e2e-06.spec.ts tests/e2e-13.spec.ts --grep "project-no-agents-dir"
//   배치 4  E2E_FIXTURE=project-format-errors npx playwright test tests/e2e-06.spec.ts tests/e2e-13.spec.ts --grep "project-format-errors"
//   배치 7  E2E_FIXTURE=project-configured npx playwright test tests/e2e-05.spec.ts tests/e2e-13.spec.ts --grep "E2E-05|project-configured 04-3"
//   배치 8  E2E_FIXTURE=project-showcase npx playwright test tests/e2e-13.spec.ts tests/e2e-16.spec.ts tests/e2e-16z-e2e13-state-changes.spec.ts --grep "project-showcase"
//   배치 11 E2E_FIXTURE=project-basic npx playwright test tests/e2e-13.spec.ts --grep "project-basic"
// v1.2.0 화면(같은 이름 규칙·3크기, `captureBaseSizes`/`captureBaseSizesAndRestore`):
//   배치 8  05-4 이 파일(순서 5a)
//   배치 11 10-cost-disconnected 이 파일(순서 7)
//   배치 12 08-1·08-4·08-2·08-3·09-mcp-empty·08-skills-empty e2e-18a·e2e-18b
//   배치 13 08-skills(e2e-19a)·09-mcp(e2e-20)·10-cost·10-1-price-panel(e2e-21-cost)·07-settings(e2e-22z-screens-v120, 순서 6)
// 07-settings는 v1.2.0에서 배치 8 → 13으로 옮겼다(전역 연결·상태줄 수신이 있는 시안 상태).
// 배치 11은 04-2·04-7·05-L·04-1에 (v1.2.0) 순서 7 `10-cost-disconnected`가 더해진다.
// 배치 8의 캡처 순서는 ui-spec "배치별 캡처 순서" 표 그대로다: 이 파일이 순서 1~8, e2e-16.spec.ts가 순서 9(E2E-16),
// e2e-16z-e2e13-state-changes.spec.ts가 상태를 바꾸는 순서 10~14다(파일 이름순 실행).
//
// 목킹 없음: 실제 컨테이너·재생 도구·fixture 파일만 쓴다. 유일한 예외는 04-2(첫 로딩)로, `/api/state`·`/api/stream`
// 요청의 `route.continue()`를 늦출 뿐 응답을 바꾸지 않는다(ADR-75 6, conventions §8).
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Route } from "@playwright/test";

import { FIXTURES_DIR, readE2eState } from "../lib/e2e-state";
import { replayScenarioLines, scenarioLines } from "../lib/replay";
import { percentPattern, readingStrip } from "./cost-helpers";
import { containerStatus, ensureUnpaused, pauseContainer } from "./container-helpers";
import {
  COST_DISCONNECTED_REGIONS,
  captureBaseSizes,
  expectCostLayout,
  expectDialogWidth,
  expectFloorLayout,
  expectHomeLayout,
  expectNavWidth,
  expectOfficeLayout,
  expectRegionsVisible,
  navRegions,
  preloadFonts,
  sizeLabel,
} from "./screen-helpers";
import {
  AGENT_COUNT,
  DEV,
  DEV_LEAD,
  HOME_REGIONS,
  IDLE_COUNT,
  OUTSIDE_COUNT,
  RUNNING_COUNT,
  SHOWCASE_LINE_COUNT,
  SHOWCASE_SCENARIO,
  SKILL_COUNT,
  WAITING_COUNT,
  WORKFLOWS_REGIONS,
  WORKFLOW_COUNT,
  assertFixture,
  check,
  detailRegions,
  fetchLive,
  hookSettingsJson,
  settingsFile,
  sidebarChip,
} from "./showcase-helpers";
import {
  PIXEL_FILL,
  SETUP_REFLECT_TIMEOUT_MS,
  addWorkflowViaUi,
  choose,
  fixturePath,
  floorHeader,
  gotoReady,
  panelRowValue,
  readFixtureFile,
  spriteBox,
  spriteScreenFill,
  spriteShirtFill,
  spriteSvg,
  teamFile,
  writeFixtureFile,
} from "./ui-helpers";

// ── 배치 8 — project-showcase 순서 1~8 ───────────────────────────────────────────────────

test.describe("[E2E-13] project-showcase 배치 8 순서 1~8 — 01·02·03 상태 단언과 20화면 대조 캡처 일부", () => {
  test.use({ reducedMotion: "reduce" });
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    assertFixture("project-showcase");
    expect(
      scenarioLines(SHOWCASE_SCENARIO).length,
      "showcase.jsonl 줄 수가 scenarios/README.md 대응표와 다릅니다",
    ).toBe(SHOWCASE_LINE_COUNT);

    // 공식 캡처는 `hook 설정됨` 화면이어야 한다(D-052).
    writeFixtureFile(settingsFile(), hookSettingsJson());

    const result = replayScenarioLines({ scenarioPath: SHOWCASE_SCENARIO, from: 1, to: SHOWCASE_LINE_COUNT });
    expect(result.sent).toBe(SHOWCASE_LINE_COUNT);
  });

  test("[E2E-13][FR-005-AC1][FR-005-AC2][FR-005-AC3][FR-005-AC6][FR-015-AC1][NFR-11] 순서 1 — 01-home: 상태 단언 + 3크기 캡처 + 영역·배치 판정", async ({
    page,
  }) => {
    await gotoReady(page, "/");

    // hook 설정이 인식됐다(사이드 탭 수집 상자 + KPI 4).
    await expect(sidebarChip(page, "hook 설정됨")).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });

    // KPI 1·2·3 (FR-005-AC1·AC2): 실행 중 7 / 21, 에이전트 21, 스킬 12.
    await expect(page.getByTestId("kpi-running-value")).toHaveText(String(RUNNING_COUNT));
    await expect(page.getByTestId("kpi-running-total")).toHaveText(`/ ${AGENT_COUNT}`);
    await expect(page.getByTestId("kpi-running-sub")).toHaveText(`권한·입력 대기 ${WAITING_COUNT} · hook 이벤트 기준`);
    await expect(page.getByTestId("kpi-agent-count")).toHaveText(String(AGENT_COUNT));
    await expect(page.getByTestId("kpi-skill-count")).toHaveText(String(SKILL_COUNT));

    // 상태 막대 범례 3상태 합 = 에이전트 수.
    const legend = page.locator('[data-wf="01-4"]');
    await expect(legend).toContainText(new RegExp(`작업 중\\s*${RUNNING_COUNT}`));
    await expect(legend).toContainText(new RegExp(`권한·입력 대기\\s*${WAITING_COUNT}`));
    await expect(legend).toContainText(new RegExp(`대기\\s*${IDLE_COUNT}(?!\\d)`));
    expect(RUNNING_COUNT + WAITING_COUNT + IDLE_COUNT).toBe(AGENT_COUNT);

    // 대표 워크플로우 3장(FR-005-AC3): 활성(실행 중·권한 대기 있음) 워크플로우가 앞, 마지막은 이벤트가 있는 모두 대기 층.
    // `영상제작부서`는 인원 0·이벤트 없음이라 4번째다.
    const featured = page.locator('[data-wf="01-5"] a');
    await expect(featured).toHaveCount(3);
    await expect(featured.locator("h3")).toHaveText([DEV, "디자인부서", "투자부서"]);
    await expect(featured.nth(0)).toContainText("권한 대기 1명");
    await expect(featured.nth(1)).toContainText("실행 중 2명");
    await expect(featured.nth(2)).toContainText("모두 대기");

    // 실시간 이벤트 표: 머리 문구 + 연결 표시 + 행 수 = min(재생 줄 수, 50) + 마스킹(FR-005-AC6, FR-015-AC1).
    const events = page.locator('[data-wf="01-6"]');
    await expect(events.getByText("최근 50개 · 최신순", { exact: true })).toBeVisible();
    await expect(events.getByText("실시간 연결됨", { exact: true })).toBeVisible();
    await expect(events.locator("tbody tr")).toHaveCount(Math.min(SHOWCASE_LINE_COUNT, 50));
    await expect(events.getByText("export API_KEY=•••••••• && npm test -- --run", { exact: true })).toBeVisible();
    await expect(
      page.getByText("token·key·password 같은 민감 값은 ••••••••로 가립니다", { exact: true }),
    ).toBeVisible();

    const files = await captureBaseSizes(
      page,
      "01-home",
      check(page, "01 홈", HOME_REGIONS, async (size) => {
        await expectHomeLayout(page, size);
      }),
    );
    expect(files).toHaveLength(3);
  });

  test("[E2E-13][FR-006-AC1][FR-006-AC2][FR-006-AC5][FR-006-AC9][NFR-11] 순서 2 — 02-workflows: 로비·층 4개 상태 단언 + 3크기 캡처 + 영역·배치 판정", async ({
    page,
  }) => {
    await gotoReady(page, "/workflows");

    // 요약 줄·범례·검색 줄(재생 결과).
    await expect(page.getByTestId("workflows-counts")).toHaveText(
      new RegExp(`에이전트\\s*${AGENT_COUNT}\\s*·\\s*스킬\\s*${SKILL_COUNT}\\s*·\\s*워크플로우\\s*${WORKFLOW_COUNT}`),
    );
    await expect(
      page.getByRole("button", { name: `워크플로우 밖 에이전트 ${OUTSIDE_COUNT} · 가져오기`, exact: true }),
    ).toBeVisible();
    const filterRow = page.locator('[data-wf="02-3"]');
    await expect(filterRow).toContainText(new RegExp(`작업 중\\s*${RUNNING_COUNT}`));
    await expect(filterRow).toContainText(new RegExp(`권한·입력 대기\\s*${WAITING_COUNT}`));
    await expect(filterRow).toContainText(new RegExp(`대기\\s*${IDLE_COUNT}(?!\\d)`));
    await expect(filterRow.getByLabel("층 선택")).toContainText(`전체 층 (${WORKFLOW_COUNT}개)`);

    // 로비(FR-006-AC9): 메인 세션 2개 + 워크플로우 밖 에이전트. 로비 waiting 표기(`입력 대기`)는 E2E-04가 단언한다.
    const lobby = page.locator('[data-wf="02-4"]').getByTestId("lobby-chip");
    await expect(lobby).toHaveText([/\[세션 1\]\s*·\s*작업 중/, /\[세션 2\]\s*·\s*대기/, /docs-writer\s*·\s*작업 중/]);

    // 층 4개 순서(이름 오름차순)와 각 층 헤더 요약(FR-006-AC5).
    await expect(page.getByRole("heading", { level: 3 })).toHaveText([DEV, "디자인부서", "영상제작부서", "투자부서"]);
    const floor = (name: string) => page.locator(`section[data-floor=${JSON.stringify(name)}]`);
    await expect(floor(DEV)).toContainText("8명");
    await expect(floor(DEV)).toContainText("실행 중 4명");
    await expect(floor(DEV)).toContainText("권한 대기 1명");
    await expect(floor("디자인부서")).toContainText("4명");
    await expect(floor("디자인부서")).toContainText("실행 중 2명");
    await expect(floor("투자부서")).toContainText("모두 대기");
    // 팀장 없는 층(FR-006-AC3): 요약 자리 `팀장 없음` + 경고 줄. 인원 0이라 `삭제`가 활성이다.
    await expect(floor("영상제작부서")).toContainText("0명");
    await expect(floor("영상제작부서")).toContainText("팀장 없음");
    await expect(floor("영상제작부서").locator('[data-wf="02-8"]')).toHaveText(
      "팀장이 없습니다 · 팀장을 만들거나 가져오세요",
    );
    await expect(floorHeader(page, "영상제작부서").getByRole("button", { name: "삭제", exact: true })).toBeEnabled();
    // (v1.2.0) 층 `삭제`는 항상 활성이다 — 1명 이상이면 05-4가 열린다(FR-006-AC12, ui-spec SCR-02).
    await expect(floorHeader(page, DEV).getByRole("button", { name: "삭제", exact: true })).toBeEnabled();

    // 정의 있는 서브에이전트는 02 책상에서도 부모 접미가 붙는다(FR-007-AC3).
    await expect(
      spriteBox(page, "web-backend-dev").getByText(`작업 중 · 부모 ${DEV_LEAD}`, { exact: true }),
    ).toBeVisible();
    await expect(spriteBox(page, "web-security-reviewer")).toContainText(`권한 대기 · 부모 ${DEV_LEAD}`);

    await captureBaseSizes(
      page,
      "02-workflows",
      check(page, "02 워크플로우", [...WORKFLOWS_REGIONS, "02-8"], async (size) => {
        await expectFloorLayout(page, size, [DEV]);
      }),
    );
  });

  test("[E2E-13][FR-007-AC1][FR-007-AC2][FR-007-AC3][FR-007-AC4][FR-007-AC5][FR-007-AC9][NFR-11] 순서 3 — 03-workflow-detail: 칸·말풍선·패널 단언 + 3크기 캡처 + 영역·배치 판정", async ({
    page,
  }) => {
    await gotoReady(page, `/workflows/${encodeURIComponent(DEV)}`);

    // 04-4 띠는 없다(hook 설정됨 + 이벤트 수신 이력 있음).
    await expect(page.getByRole("status").filter({ hasText: "hook 이벤트 수신 없음" })).toHaveCount(0);

    // 헤더: 수치 + 칩(권한 대기 우선, FR-007-AC9) + 팀장.
    await expect(page.getByTestId("workflow-meta")).toHaveText(new RegExp(`에이전트\\s*8\\s*·\\s*스킬\\s*${SKILL_COUNT}`));
    await expect(page.locator('[data-wf="03-2"]').getByText("권한 대기 1명", { exact: true })).toBeVisible();
    await expect(page.locator('[data-wf="03-2"]')).toContainText(DEV_LEAD);

    // 오피스 칸 순서: 팀장 첫 자리 → 정의 없는 서브에이전트는 부모 바로 다음 칸 → 나머지 이름순(FR-007-AC1·AC3).
    const seatNames = await page
      .locator('[data-wf="03-4"], [data-wf="03-5"]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-agent-name")));
    expect(seatNames).toEqual([
      DEV_LEAD,
      "Explore",
      "web-architect",
      "web-backend-dev",
      "web-db-designer",
      "web-frontend-dev",
      "web-reviewer",
      "web-security-reviewer",
      "web-tester",
    ]);

    // 말풍선·상태 글자(FR-007-AC2·AC3).
    await expect(spriteBox(page, DEV_LEAD).getByText("Agent", { exact: true })).toBeVisible();
    await expect(spriteBox(page, DEV_LEAD).getByText("작업 중", { exact: true })).toBeVisible();
    await expect(spriteBox(page, "web-backend-dev").getByText("타이핑 · Edit", { exact: true })).toBeVisible();
    await expect(spriteBox(page, "web-frontend-dev").getByText("읽기 · Read", { exact: true })).toBeVisible();
    await expect(spriteBox(page, "web-security-reviewer").getByText("권한 요청", { exact: true })).toBeVisible();
    await expect(spriteBox(page, "web-tester").getByText("Bash", { exact: true })).toBeVisible();
    await expect(spriteBox(page, "Explore").getByText("읽기 · Grep", { exact: true })).toBeVisible();
    await expect(spriteBox(page, "web-reviewer").getByText("대기", { exact: true })).toHaveCount(2);
    await expect(spriteBox(page, "web-backend-dev")).toContainText(`작업 중 · 부모 ${DEV_LEAD}`);
    await expect(spriteBox(page, "web-security-reviewer")).toContainText(`권한 대기 · 부모 ${DEV_LEAD}`);
    await expect(spriteBox(page, "Explore")).toContainText(`작업 중 · 부모 ${DEV_LEAD}`);

    // 기본 선택 = 팀장(FR-007-AC4) + 패널 값(FR-007-AC5).
    await expect(page.locator('[data-wf="03-8"]').getByRole("heading", { level: 3 })).toHaveText(DEV_LEAD);
    await expect(panelRowValue(page, "상태")).toHaveText("작업 중");
    await expect(panelRowValue(page, "현재 도구")).toHaveText("Agent · Explore");
    await expect(panelRowValue(page, "서브에이전트")).toHaveText("4");
    // 작업 중인 팀장의 `정의 수정`·`제거`는 비활성이다(ADR-68 확정). 판정 자체는 E2E-04가 단언한다.
    await expect(page.locator('[data-wf="03-9"]').getByRole("button", { name: "정의 수정", exact: true })).toBeDisabled();

    // 범례(03-7)와 패널 각주는 03 캡처 프레임 아래에 있어도 DOM에는 있다.
    await expect(page.locator('[data-wf="03-7"]')).toContainText("동작 매핑");
    await expect(page.locator('[data-wf="03-7"]')).toContainText("작은 캐릭터 = 정의 없는 서브에이전트");
    await expect(page.getByTestId("panel-footnote")).toContainText(
      "제거하면 정의 파일이 .aojistudio/trash/로 이동합니다 · 작업 지시는 터미널에서 팀장에게 직접 합니다",
    );

    await captureBaseSizes(
      page,
      "03-workflow-detail",
      check(page, "03 워크플로우 상세", detailRegions, async (size) => {
        await expectOfficeLayout(page, size);
      }),
    );
  });

  test("[E2E-13][NFR-11] 순서 4 — 05R-agent-import: 02 헤더 링크 → 대상 영상제작부서·두 행 선택·역할 팀장 → 캡처 → 취소", async ({
    page,
  }) => {
    await gotoReady(page, "/workflows");
    await page.getByRole("button", { name: `워크플로우 밖 에이전트 ${OUTSIDE_COUNT} · 가져오기`, exact: true }).click();
    const dialog = page.locator('[data-wf="05R-1"]');
    await expect(dialog).toBeVisible();
    // 헤더 링크로 열면 제목은 드롭다운과 상관없이 고정이다(ADR-71).
    await expect(dialog.getByRole("heading", { name: "기존 에이전트 가져오기", exact: true })).toBeVisible();
    await expect(dialog).toContainText(`어느 워크플로우에도 없는 정의 파일 ${OUTSIDE_COUNT}개`);
    // 워크플로우 밖 5명이 name 오름차순으로 보인다(FR-009-AC1).
    await expect(dialog.locator("tbody tr td:nth-child(2)")).toHaveText([
      "code-explainer",
      "docs-writer",
      "release-manager",
      "test-runner",
      "video-editor",
    ]);

    await dialog.getByLabel("대상 워크플로우", { exact: true }).selectOption("영상제작부서");
    await expect(dialog.getByRole("heading", { name: "기존 에이전트 가져오기", exact: true })).toBeVisible();
    await choose(dialog.getByRole("checkbox", { name: "docs-writer 선택", exact: true }));
    await choose(dialog.getByRole("checkbox", { name: "video-editor 선택", exact: true }));
    await dialog.getByLabel("video-editor 역할", { exact: true }).selectOption("lead");
    await expect(dialog.getByRole("button", { name: "선택한 2명 가져오기", exact: true })).toBeEnabled();

    await captureBaseSizes(page, "05R-agent-import", async (size) => {
      await expectRegionsVisible(page, ["NAV", "05R-1", "05R-2", "05R-3", "05R-4", "05R-5"], `05-R ${sizeLabel(size)}`);
      await expectDialogWidth(page, size, "05R-1", "lg");
    });

    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    // 가져오지 않았다: 워크플로우 밖 에이전트는 그대로 5명이다.
    await expect(
      page.getByRole("button", { name: `워크플로우 밖 에이전트 ${OUTSIDE_COUNT} · 가져오기`, exact: true }),
    ).toBeVisible();
  });

  test("[E2E-13][FR-017-AC2][NFR-11] 순서 5 — 05-3-workflow-delete: 영상제작부서 층 `삭제` → 캡처(이름 입력 전) → 취소", async ({
    page,
  }) => {
    await gotoReady(page, "/workflows");
    await floorHeader(page, "영상제작부서").getByRole("button", { name: "삭제", exact: true }).click();
    const dialog = page.locator('[data-wf="05-3-1"]');
    await expect(dialog.getByRole("heading", { name: "영상제작부서 워크플로우를 삭제할까요?", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "삭제", exact: true })).toBeDisabled();
    await expect(dialog.getByText("영상제작부서을(를) 똑같이 입력하면 삭제 버튼이 켜집니다", { exact: true })).toBeVisible();

    await captureBaseSizes(page, "05-3-workflow-delete", async (size) => {
      await expectRegionsVisible(page, ["NAV", "05-3-1", "05-3-2", "05-3-3"], `05-3 ${sizeLabel(size)}`);
      await expectDialogWidth(page, size, "05-3-1", "sm");
    });

    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('section[data-floor="영상제작부서"]')).toBeVisible();
  });

  test("[E2E-13][FR-017-AC1][FR-006-AC12][NFR-11] 순서 5a — 05-4-workflow-delete-blocked: 디자인부서(4명) 층 `삭제` → 캡처 → 확인(파일 그대로)", async ({
    page,
  }) => {
    const workflow = "디자인부서";
    const teamBefore = readFixtureFile(teamFile(workflow));
    await gotoReady(page, "/workflows");
    await expect(floorHeader(page, workflow).getByRole("button", { name: "삭제", exact: true })).toBeEnabled();
    await floorHeader(page, workflow).getByRole("button", { name: "삭제", exact: true }).click();

    const dialog = page.locator('[data-wf="05-4-1"]');
    await expect(dialog).toHaveAttribute("role", "alertdialog");
    await expect(dialog.getByRole("heading", { name: `${workflow} 워크플로우를 삭제할 수 없습니다`, exact: true })).toBeVisible();
    await expect(dialog).toContainText("팀장·팀원이 0명일 때만 삭제할 수 있습니다 · 팀원을 먼저 제거하세요");
    await expect(page.locator('[data-wf="05-4-2"]')).toContainText("남은 에이전트 4명");
    // 이름 입력·삭제 버튼이 없다(FR-017-AC1).
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "삭제", exact: true })).toHaveCount(0);

    await captureBaseSizes(page, "05-4-workflow-delete-blocked", async (size) => {
      await expectRegionsVisible(page, ["NAV", "05-4-1", "05-4-2", "05-4-3"], `05-4 ${sizeLabel(size)}`);
      await expectDialogWidth(page, size, "05-4-1", "sm");
    });

    await dialog.getByRole("button", { name: "확인", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(`section[data-floor=${JSON.stringify(workflow)}]`)).toBeVisible();
    expect(readFixtureFile(teamFile(workflow)), "확인 뒤에도 구성 파일은 그대로").toBe(teamBefore);
  });

  test("[E2E-13][FR-011-AC1][NFR-11] 순서 6 — 06-agent-form: web-reviewer 정의 수정 → 캡처 → 취소", async ({ page }) => {
    await gotoReady(page, `/workflows/${encodeURIComponent(DEV)}?dialog=agent-edit&agent=web-reviewer`);
    const form = page.locator('[data-wf="06-1"]');
    await expect(form.getByLabel("이름 (name)", { exact: true })).toHaveValue("web-reviewer");
    await expect(form.getByLabel("소속 워크플로우", { exact: true })).toHaveValue(DEV);

    await captureBaseSizes(page, "06-agent-form", async (size) => {
      await expectRegionsVisible(
        page,
        ["NAV", "06-1", "06-2", "06-3", "06-4", "06-5", "06-6"],
        `06 ${sizeLabel(size)}`,
      );
      await expectDialogWidth(page, size, "06-1", "lg");
    });

    await form.getByRole("button", { name: "취소", exact: true }).click();
    await expect(form).toHaveCount(0);
  });

  test("[E2E-13][FR-007-E1][FR-007-AC8][NFR-11] 순서 8 — 04-4-collect-stopped: hook 제거 → 고정 대상 단언 → 실제 idle인 web-reviewer 캡처 → 복구", async ({
    page,
    request,
  }) => {
    const collectorBanner = page.getByRole("status").filter({ hasText: "hook 이벤트 수신 없음" });
    try {
      await gotoReady(page, `/workflows/${encodeURIComponent(DEV)}`);
      await expect(collectorBanner).toHaveCount(0);

      // hook 항목을 지우면 `!registry.hookConfigured` → 04-4 표시 조건이 된다(FR-007-E1).
      writeFixtureFile(settingsFile(), "{}\n");
      await expect(collectorBanner).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
      await expect(collectorBanner).toHaveAttribute("data-wf", "04-4-1");
      await expect(collectorBanner).toContainText(/hook 이벤트 수신 없음 · 마지막 수신 (\d{2}:\d{2}:\d{2}|없음)/);
      await expect(collectorBanner).toContainText("Claude Code가 꺼졌거나 hook 설정이 없으면 캐릭터를 모두 대기로 표시합니다");

      // 고정 대상(ADR-68): 실제 작업 중·권한 대기 캐릭터와 정의 없는 서브에이전트의 말풍선·상태 글자는 `대기`,
      // 셔츠·모니터는 대기색, 패널 `상태` `대기`·`현재 도구` `-`, 헤더 칩 중립 `모두 대기`.
      for (const name of [DEV_LEAD, "web-backend-dev", "web-security-reviewer", "web-tester", "Explore"]) {
        await expect(spriteBox(page, name).getByText("대기", { exact: true }), `${name} 말풍선·상태 글자`).toHaveCount(2);
        await expect(spriteBox(page, name)).not.toContainText("부모");
        expect(await spriteShirtFill(page, name), `${name} 셔츠 색`).toBe(PIXEL_FILL.shirtIdle);
        expect(await spriteScreenFill(page, name), `${name} 모니터 색`).toBe(PIXEL_FILL.screenIdle);
      }
      await expect(panelRowValue(page, "상태")).toHaveText("대기");
      await expect(panelRowValue(page, "현재 도구")).toHaveText("-");
      await expect(page.locator('[data-wf="03-2"]').getByText("모두 대기", { exact: true })).toBeVisible();
      await expect(page.locator('[data-wf="03-2"]').getByText("권한 대기 1명", { exact: true })).toHaveCount(0);

      // 캡처는 실제 상태가 `idle`인 web-reviewer를 골라 찍는다(ADR-75 8). 먼저 API로 실제 상태를 단언한다.
      expect((await fetchLive(request)).agents["web-reviewer"]?.status, "web-reviewer의 실제 상태").toBe("idle");

      await page.goto(`/workflows/${encodeURIComponent(DEV)}?agent=web-reviewer`);
      await expect(page.locator('[data-wf="03-8"]').getByRole("heading", { level: 3 })).toHaveText("web-reviewer");
      await expect(collectorBanner).toBeVisible();
      const actions = page.locator('[data-wf="03-9"]');
      await expect(actions.getByRole("button", { name: "정의 수정", exact: true })).toBeEnabled();
      await expect(actions.getByRole("button", { name: "제거", exact: true })).toBeEnabled();
      await expect(actions.getByText("작업 중에는", { exact: false })).toHaveCount(0);
      await expect(page.locator('[data-wf="03-2"]').getByText("모두 대기", { exact: true })).toBeVisible();
      // (v1.2.0) 사이드 탭 수집 상자: 빨강 `hook 설정 안 됨` + `마지막 수신 hh:mm:ss`(재생 이력이 있으므로 `없음`이 아니다).
      const navCollect = page.locator('[data-wf="NAV-3"]'); // 기본 뷰포트 1440×1024는 가로형이다
      await expect(navCollect.getByText("hook 설정 안 됨", { exact: true })).toBeVisible();
      await expect(navCollect).toContainText(/마지막 수신 \d{2}:\d{2}:\d{2}/);

      await captureBaseSizes(
        page,
        "04-4-collect-stopped",
        check(page, "04-4 수집 중단", (size) => ["04-4-1", ...detailRegions(size)], async (size) => {
          await expectOfficeLayout(page, size);
        }),
      );
    } finally {
      writeFixtureFile(settingsFile(), hookSettingsJson());
    }

    // 복구 단언: 띠가 사라지고 실제 상태(작업 중 팀장)로 돌아온다.
    await page.goto(`/workflows/${encodeURIComponent(DEV)}`);
    await expect(page.getByTestId("workflow-meta")).toBeVisible();
    await expect(collectorBanner).toHaveCount(0, { timeout: SETUP_REFLECT_TIMEOUT_MS });
    await expect(panelRowValue(page, "상태")).toHaveText("작업 중", { timeout: SETUP_REFLECT_TIMEOUT_MS });
    await expect(spriteBox(page, DEV_LEAD).getByText("작업 중", { exact: true })).toBeVisible();
    await expect(spriteSvg(page, "web-reviewer")).toBeVisible();
    expect(readFixtureFile(settingsFile())).toBe(hookSettingsJson());
  });
});

// ── 배치 3·4 — 04-5·04-6 ────────────────────────────────────────────────────────────────

test.describe("[E2E-13] project-no-agents-dir 배치 3 — 04-5 에이전트 폴더 읽기 실패 캡처", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeAll(() => {
    assertFixture("project-no-agents-dir");
  });

  test("[E2E-13][FR-001-E1][FR-006-E1][NFR-11] 04-5-agents-dir-missing: /workflows 3크기 캡처 + 영역 판정", async ({ page }) => {
    await gotoReady(page, "/workflows");
    await expect(page.locator('[data-wf="04-5-1"]')).toContainText("에이전트 폴더를 찾을 수 없습니다");
    await captureBaseSizes(page, "04-5-agents-dir-missing", check(page, "04-5", ["04-5-1"]));
  });
});

test.describe("[E2E-13] project-format-errors 배치 4 — 04-6 정의·구성 파일 형식 오류 캡처", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeAll(() => {
    assertFixture("project-format-errors");
  });

  test("[E2E-13][FR-002-AC2][NFR-11] 04-6-invalid-files: /workflows 3크기 캡처 + 영역 판정", async ({ page }) => {
    await gotoReady(page, "/workflows");
    await expect(page.locator('[data-wf="04-6-1"]')).toContainText("읽지 못한 정의·구성 파일");
    await captureBaseSizes(page, "04-6-invalid-files", check(page, "04-6", ["04-6-1"]));
  });
});

// ── 배치 7 — 04-3 ───────────────────────────────────────────────────────────────────────

test.describe("[E2E-13] project-configured 04-3 배치 7 — 실시간 연결 끊김 캡처", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeAll(() => {
    assertFixture("project-configured");
  });

  test.afterAll(() => {
    // 테스트가 어디서 실패했더라도 컨테이너는 반드시 running으로 남긴다.
    ensureUnpaused();
    expect(containerStatus(), "테스트 종료 시 컨테이너가 running이 아닙니다").toBe("running");
  });

  test("[E2E-13][FR-016-AC1][NFR-11] 04-3-disconnected: states.jsonl 1줄 재생 → 01-6 확인 → pause → 띠·01-6 머리 `연결 끊김` → 3크기 캡처", async ({
    page,
  }) => {
    // E2E-05 실행 순서에 기대지 않는다(ADR-76 결정 3): 이벤트를 한 번 받은 상태를 이 테스트가 직접 만든다.
    expect(replayScenarioLines({ from: 1, to: 1 }).sent).toBe(1);
    await gotoReady(page, "/");
    await expect(page.locator('[data-wf="04-1-1"]')).toHaveCount(0);
    await expect(page.locator('[data-wf="01-6"]')).toBeVisible();
    await expect(page.locator('[data-wf="01-6"]').getByText("실시간 연결됨", { exact: true })).toBeVisible();

    test.setTimeout(150_000);
    // 컨테이너를 얼리면 새 글꼴 조각을 받을 수 없으므로 04-3 띠·`연결 끊김`·재연결 글자의 조각을 미리 받아 둔다.
    await preloadFonts(
      page,
      "실시간 연결이 끊겼습니다 · 초 후 재연결 마지막 갱신 기준 화면을 유지합니다 지금 재연결 연결 끊김 0123456789:",
    );
    try {
      pauseContainer();
      // 끊김 판정: 마지막 메시지 후 45초 무수신(realtime-spec.md §4).
      const banner = page.locator('[data-wf="04-3-1"]');
      await expect(banner).toBeVisible({ timeout: 90_000 });
      await expect(banner).toContainText("실시간 연결이 끊겼습니다");
      await expect(page.locator('[data-wf="01-6"]').getByText("연결 끊김", { exact: true })).toBeVisible();

      await captureBaseSizes(page, "04-3-disconnected", check(page, "04-3", ["04-3-1", ...HOME_REGIONS]));
    } finally {
      ensureUnpaused();
    }
  });
});

// ── 배치 11 — project-basic (이벤트 0건·워크플로우 0개인 새 컨테이너) ─────────────────────────

test.describe("[E2E-13] project-basic 배치 11 — 04-2·04-7·05-L·04-1 캡처", () => {
  test.use({ reducedMotion: "reduce" });
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    assertFixture("project-basic");
  });

  test("[E2E-13][FR-005-AC9][NFR-11] 순서 1 — 04-2-loading: /api/state·/api/stream을 `route.continue()`로 늦춘 `/` 캡처 → 지연 해제", async ({
    page,
  }) => {
    // 응답을 바꾸지 않고 `route.continue()`를 늦추기만 한다(ADR-75 6 — conventions §8의 유일한 예외).
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const delayed = async (route: Route) => {
      await gate;
      await route.continue();
    };
    await page.route("**/api/state", delayed);
    await page.route("**/api/stream**", delayed);

    try {
      await page.goto("/");
      await expect(page.getByTestId("home-skeleton")).toBeVisible();
      await captureBaseSizes(page, "04-2-loading", async (size) => {
        await expectRegionsVisible(page, navRegions(size), `04-2 ${sizeLabel(size)}`);
        await expectNavWidth(page, size);
        await expect(page.getByTestId("home-skeleton")).toBeVisible();
      });
    } finally {
      release();
    }

    // 지연을 풀면 실제 첫 화면으로 바뀐다.
    await expect(page.getByTestId("home")).toBeVisible();
    await expect(page.getByTestId("home-skeleton")).toHaveCount(0);
    await page.unroute("**/api/state", delayed);
    await page.unroute("**/api/stream**", delayed);
  });

  test("[E2E-13][FR-006-E3][NFR-11] 순서 2 — 04-7-no-workflows: /workflows 3크기 캡처 + 영역 판정", async ({ page }) => {
    await gotoReady(page, "/workflows");
    await expect(page.locator('[data-wf="04-7-1"]')).toBeVisible();
    await captureBaseSizes(page, "04-7-no-workflows", check(page, "04-7", ["04-7-1"]));
  });

  test("[E2E-13][FR-008-AC4][NFR-11] 순서 3 — 05L-workflow-add: 이름 입력 → 캡처 → 만들기(성공)", async ({ page }) => {
    await gotoReady(page, "/workflows");
    await page.locator('[data-wf="02-3"], [data-wf="04-7-1"]').getByRole("button", { name: "워크플로우 추가", exact: true }).first().click();
    const dialog = page.locator('[data-wf="05L-1"]');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("이름", { exact: true }).fill("영상제작부서");

    await captureBaseSizes(page, "05L-workflow-add", async (size) => {
      await expectRegionsVisible(page, ["NAV", "05L-1", "05L-2", "05L-3", "05L-4"], `05-L ${sizeLabel(size)}`);
      await expectDialogWidth(page, size, "05L-1", "md");
    });

    await dialog.getByRole("button", { name: "만들기", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('section[data-floor="영상제작부서"]')).toBeVisible();
  });

  test("[E2E-13][FR-008-E1][NFR-11] 순서 4 — 05L-workflow-add-error: 같은 이름으로 다시 만들기 → E1 캡처 → 취소", async ({
    page,
  }) => {
    await gotoReady(page, "/workflows");
    await page.locator('[data-wf="02-3"]').getByRole("button", { name: "워크플로우 추가", exact: true }).click();
    const dialog = page.locator('[data-wf="05L-1"]');
    await dialog.getByLabel("이름", { exact: true }).fill("영상제작부서");
    await dialog.getByRole("button", { name: "만들기", exact: true }).click();
    await expect(
      dialog.getByText("같은 이름의 워크플로우가 이미 있습니다. 다른 이름을 입력하세요. (대소문자는 구분하지 않습니다)", {
        exact: true,
      }),
    ).toBeVisible();

    await captureBaseSizes(page, "05L-workflow-add-error", async (size) => {
      await expectRegionsVisible(page, ["NAV", "05L-1", "05L-2", "05L-3", "05L-4"], `05-L E1 ${sizeLabel(size)}`);
      await expectDialogWidth(page, size, "05L-1", "md");
      await expect(dialog.getByLabel("이름", { exact: true })).toHaveAttribute("aria-invalid", "true");
    });

    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("[E2E-13][FR-008-E3][NFR-11] 순서 5 — 05L-workflow-add-write-fail: teams 폴더 0555 → 만들기 → E3 캡처 → 0755 복구 → 만들기(성공)", async ({
    page,
  }) => {
    const teamsDir = fixturePath(".aojistudio", "teams");
    await gotoReady(page, "/workflows");
    await page.locator('[data-wf="02-3"]').getByRole("button", { name: "워크플로우 추가", exact: true }).click();
    const dialog = page.locator('[data-wf="05L-1"]');
    await dialog.getByLabel("이름", { exact: true }).fill("디자인부서");

    try {
      chmodSync(teamsDir, 0o555);
      await dialog.getByRole("button", { name: "만들기", exact: true }).click();
      const alert = dialog.getByRole("alert");
      await expect(alert).toContainText("구성 파일을 만들지 못했습니다.");
      await expect(alert).toContainText("파일을 쓰는 중 오류가 났습니다. 폴더 쓰기 권한을 확인한 뒤 다시 만드세요.");
      // 입력은 그대로이고 팝업은 열려 있다.
      await expect(dialog.getByLabel("이름", { exact: true })).toHaveValue("디자인부서");

      await captureBaseSizes(page, "05L-workflow-add-write-fail", async (size) => {
        await expectRegionsVisible(page, ["NAV", "05L-1", "05L-2", "05L-3", "05L-4"], `05-L E3 ${sizeLabel(size)}`);
        await expectDialogWidth(page, size, "05L-1", "md");
        await expect(alert).toBeVisible();
      });
    } finally {
      chmodSync(teamsDir, 0o755);
    }
    // 복구 단언 + 다시 만들기(성공).
    expect(statSync(teamsDir).mode & 0o777, "teams 폴더 권한 복구").toBe(0o755);
    await dialog.getByRole("button", { name: "만들기", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('section[data-floor="디자인부서"]')).toBeVisible();
  });

  test("[E2E-13][FR-005-E1][NFR-11] 순서 6 — 04-1-no-events: 투자부서를 더 만들어 워크플로우 3개 → / 3크기 캡처 + 영역·배치 판정", async ({
    page,
  }) => {
    await gotoReady(page, "/workflows");
    await addWorkflowViaUi(page, "투자부서");

    await gotoReady(page, "/");
    await expect(page.locator('[data-wf="04-1-1"]')).toBeVisible();
    await expect(page.locator('[data-wf="04-1-2"]')).toBeVisible();
    await expect(page.locator('[data-wf="01-5"] a')).toHaveCount(3);

    await captureBaseSizes(
      page,
      "04-1-no-events",
      check(page, "04-1", ["01-1", "01-2", "01-3", "01-5", "04-1-1", "04-1-2"], async (size) => {
        await expectHomeLayout(page, size);
      }),
    );
  });

  test("[E2E-13][FR-025-E1][FR-027-AC4][NFR-11] 순서 7 — 10-cost-disconnected: fixture 상태줄 입력으로 스크립트 1회 실행(한도 카드 값) → /cost 3크기 캡처 + 영역·배치 판정", async ({
    page,
  }) => {
    // 컨테이너가 기동 때 배치한 상태줄 스크립트를 fixture 입력(`tools/fixtures/statusline/full.json`)으로 그대로 실행한다(e2e-22와 같은 방식).
    const script = join(readE2eState().fixtureDir, ".aojistudio", "statusline.mjs");
    expect(existsSync(script), `상태줄 스크립트가 배치돼 있지 않습니다: ${script}`).toBe(true);
    const input = readFileSync(join(FIXTURES_DIR, "statusline", "full.json"), "utf8");
    const full = JSON.parse(input) as { rate_limits: { five_hour: { used_percentage: number }; seven_day: { used_percentage: number } } };
    const tmp = mkdtempSync(join(tmpdir(), "aojistudio-e2e-13-"));
    try {
      const result = spawnSync(process.execPath, [script, "--url", `${readE2eState().baseUrl}/hooks/statusline`], {
        input,
        encoding: "utf8",
        env: { ...process.env, TMPDIR: tmp },
        timeout: 15_000,
      });
      expect(result.status, `상태줄 스크립트 종료 코드\n${result.stderr}`).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }

    await gotoReady(page, "/cost");
    // 대화 기록은 연결 안 됨(대역), 한도 카드에는 방금 받은 값이 보인다(받은 적 없음이 아니다).
    await expect(readingStrip(page)).toContainText("대화 기록 · 연결 안 됨");
    const limits = page.locator('[data-wf="10-6"]');
    await expect(limits).toContainText(percentPattern(full.rate_limits.five_hour.used_percentage), { timeout: SETUP_REFLECT_TIMEOUT_MS });
    await expect(limits).toContainText(percentPattern(full.rate_limits.seven_day.used_percentage));
    await expect(limits).not.toContainText("받은 적 없음");

    await captureBaseSizes(
      page,
      "10-cost-disconnected",
      check(page, "10 비용(연결 안 됨)", COST_DISCONNECTED_REGIONS, async (size) => {
        await expectCostLayout(page, size, false);
      }),
    );
  });
});
