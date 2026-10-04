// E2E-01 처음 실행 (architecture.md §8.2 E2E-01 행).
// fixture: `project-basic` (에이전트 2·스킬 1, 워크플로우 0, settings.json 없음 → 이벤트 0건).
// 검증 ID: FR-005-AC1·AC5·AC9·E1, FR-006-E3, FR-003-AC6, FR-007-E1.
//
// 이 spec의 앞 5개 테스트는 "처음 실행"(워크플로우 0개·이벤트 0건) 상태를 단언하므로
// fixture 사본을 바꾸기 전에 돌아야 한다. `scripts/run-e2e.sh`의 배치가 이 파일을 같은 fixture의
// 맨 앞(파일 이름 순서 `e2e-01` → `e2e-02` → …)에 두어 그 순서를 보장한다.
// 목킹 없음: 실제 컨테이너·실제 파일 변경만 쓴다(conventions.md §8).
import { expect, test } from "@playwright/test";

import {
  PIXEL_FILL,
  SETUP_REFLECT_TIMEOUT_MS,
  addWorkflowViaUi,
  agentFile,
  agentFileContent,
  floorCard,
  floorHeader,
  gotoReady,
  panelRowValue,
  spriteBox,
  spriteScreenFill,
  spriteShirtFill,
  spriteSvg,
  teamFile,
  teamFileContent,
  writeFixtureFile,
} from "./ui-helpers";

/** 이 spec이 만드는 워크플로우·에이전트(FR-007-E1 확인용). */
const WORKFLOW = "e2e01-처음";
const LEAD = "e2e01-lead";
const MEMBER = "e2e01-member";

test("[FR-005-AC9][E2E-01] 01 첫 진입 → 04-2 공통 스켈레톤이 먼저 나타난 뒤 KPI 값이 그려진다", async ({
  page,
}) => {
  // 첫 스냅샷 전 스켈레톤은 순간이라 렌더 순간을 MutationObserver로 기록한다(고정 대기 없음).
  await page.addInitScript(() => {
    const flags = window as unknown as { __e2e01SkeletonSeen?: boolean };
    flags.__e2e01SkeletonSeen = false;
    const check = () => {
      if (document.querySelector('[data-testid="app-shell-skeleton"]') !== null) {
        flags.__e2e01SkeletonSeen = true;
      }
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
  });

  await page.goto("/");
  // 스켈레톤이 사라지고 KPI 숫자가 그려진다(`0`이나 빈 문구를 먼저 보여주지 않는다).
  await expect(page.getByText("에이전트 수", { exact: true })).toBeVisible({
    timeout: SETUP_REFLECT_TIMEOUT_MS,
  });
  await expect(page.getByTestId("app-shell-skeleton")).toHaveCount(0);

  const skeletonSeen = await page.evaluate(
    () => (window as unknown as { __e2e01SkeletonSeen?: boolean }).__e2e01SkeletonSeen === true,
  );
  expect(skeletonSeen, "첫 스냅샷 전 04-2 공통 스켈레톤이 한 번도 렌더되지 않았습니다").toBe(true);
});

test("[FR-005-AC1][E2E-01] 01 KPI = 실행 중 0 / 2, 에이전트 수 2, 스킬 수 1, 수집 상태 hook 설정 안 됨", async ({
  page,
}) => {
  await gotoReady(page, "/");
  const body = page.locator("main").first();
  const kpiCard = (title: string) => body.getByText(title, { exact: true }).locator("xpath=..");

  await expect(kpiCard("실행 중 에이전트")).toContainText("0 / 2");
  await expect(kpiCard("실행 중 에이전트")).toContainText("hook 이벤트 기준 · 권한·입력 대기 0");
  await expect(kpiCard("에이전트 수")).toContainText("2");
  await expect(kpiCard("에이전트 수")).toContainText(".claude/agents 정의 파일 수");
  await expect(kpiCard("스킬 수")).toContainText("1");
  await expect(kpiCard("스킬 수")).toContainText(".claude/skills 스킬 수");
  await expect(kpiCard("수집 상태")).toContainText("hook 설정 안 됨");
  await expect(kpiCard("수집 상태")).toContainText("마지막 수신 없음");

  // FR-005-AC2 상태 막대 범례(합 = 에이전트 수). 이벤트 0건이라 전원 대기다.
  await expect(body.getByText("대기 2", { exact: true })).toBeVisible();
});

test("[FR-003-AC6][E2E-01] 사이드 탭 하단 수집 상태 = hook 설정 안 됨 · 마지막 수신 없음", async ({
  page,
}) => {
  await gotoReady(page, "/");
  const sidebar = page.locator("aside").filter({ hasText: "Aoji Studio" });

  await expect(sidebar.getByText("수집 상태", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("hook 설정 안 됨", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("마지막 수신 없음", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("hook 설정됨", { exact: true })).toHaveCount(0);
});

test("[FR-005-E1][E2E-01] 이벤트 0건 → 01 실시간 이벤트 표 대신 04-1 안내가 나온다", async ({ page }) => {
  await gotoReady(page, "/");
  const body = page.locator("main").first();

  await expect(body.getByText("아직 수집된 활동이 없습니다", { exact: true })).toBeVisible();
  await expect(
    body.getByText(
      "프로젝트 폴더에서 Claude Code를 실행하면 에이전트 활동이 여기에 나타납니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(body.getByRole("link", { name: "설정 화면", exact: true })).toBeVisible();
  await expect(
    body.getByText("에이전트 정의는 이벤트와 무관하게 워크플로우 탭에 표시", { exact: true }),
  ).toBeVisible();

  // 표 자리가 04-1로 대체되었으므로 열 제목이 없다.
  await expect(body.getByRole("columnheader", { name: "시각" })).toHaveCount(0);
  await expect(body.getByText("최근 0개 · 전체 로그 화면 없음", { exact: true })).toBeVisible();
});

test("[FR-005-AC5][FR-006-E3][E2E-01] 워크플로우 0개 → 01 대표 영역과 02 층 그리드 자리에 04-7 카드", async ({
  page,
}) => {
  await gotoReady(page, "/");
  const home = page.locator("main").first();
  await expect(home.getByText("아직 워크플로우가 없습니다", { exact: true })).toBeVisible();
  await expect(home.getByRole("button", { name: "워크플로우 추가", exact: true })).toBeEnabled();

  await gotoReady(page, "/workflows");
  const workflows = page.locator("main").first();
  await expect(workflows.getByText("아직 워크플로우가 없습니다", { exact: true })).toBeVisible();
  await expect(workflows.getByRole("button", { name: "워크플로우 추가", exact: true })).toBeEnabled();
  await expect(workflows.getByText("에이전트 2 · 스킬 1 · 워크플로우 0", { exact: true })).toBeVisible();
  // 층 선택 드롭다운은 `<select>`라 선택지 글자는 option 안에 있다(ui-spec SCR-02 "`<select>` 네이티브").
  await expect(workflows.getByLabel("층 선택")).toContainText("전체 층 (0개)");
});

test("[FR-007-E1][E2E-01] 워크플로우 추가 후 03 진입 → 04-4 배너 + 캐릭터·패널 모두 대기색·대기", async ({
  page,
}, testInfo) => {
  await gotoReady(page, "/workflows");

  // 02 `+ 워크플로우 추가` → 05-L → 만들기. 팀장이 없으므로 층에 경고가 함께 나온다.
  await addWorkflowViaUi(page, WORKFLOW);
  await expect(floorCard(page, WORKFLOW)).toContainText("팀장이 없습니다 · 팀장을 만들거나 가져오세요");

  // 캐릭터를 두 명 두기 위해 정의 파일과 구성 파일을 fixture 임시 사본에 직접 쓴다
  // (architecture.md §8.1 "파일 변경" — 준비 단계이므로 시간은 재지 않는다).
  writeFixtureFile(
    agentFile(LEAD),
    agentFileContent({ name: LEAD, description: "E2E-01 팀장", body: "팀장 지침." }),
  );
  writeFixtureFile(
    agentFile(MEMBER),
    agentFileContent({ name: MEMBER, description: "E2E-01 팀원", body: "팀원 지침." }),
  );
  writeFixtureFile(
    teamFile(WORKFLOW),
    teamFileContent({ name: WORKFLOW, description: "E2E-01", lead: LEAD, members: [MEMBER] }),
  );
  await expect(spriteSvg(page, LEAD)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
  await expect(spriteSvg(page, MEMBER)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });

  // 층 헤더 `상세 →` → 03
  await floorHeader(page, WORKFLOW).getByRole("button", { name: "상세 →", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/workflows/${encodeURIComponent(WORKFLOW)}$`));

  // 04-4 배너: hook 설정도 없고 수신 이력도 없다.
  const banner = page.getByRole("status").filter({ hasText: "hook 이벤트 수신 없음" });
  await expect(banner).toContainText("hook 이벤트 수신 없음 · 마지막 수신 없음");
  await expect(banner).toContainText(
    "Claude Code 미실행 또는 컨테이너 재시작 · 캐릭터는 모두 회색 대기",
  );

  // 캐릭터 모두 대기색(셔츠·모니터) + 말풍선·상태 글자 `대기`.
  for (const name of [LEAD, MEMBER]) {
    expect(await spriteShirtFill(page, name), `${name} 셔츠 색`).toBe(PIXEL_FILL.shirtIdle);
    expect(await spriteScreenFill(page, name), `${name} 모니터 색`).toBe(PIXEL_FILL.screenIdle);
    // 말풍선(회색 `대기`)과 캐릭터 아래 상태 글자(`대기`)가 각각 한 번씩 나온다.
    await expect(spriteBox(page, name).getByText("대기", { exact: true })).toHaveCount(2);
  }

  // 패널: `상태` = 대기, `현재 도구` = `-` (선택 기본값 = 팀장, FR-007-AC4).
  await expect(page.getByRole("heading", { level: 3, name: LEAD, exact: true })).toBeVisible();
  await expect(panelRowValue(page, "상태")).toHaveText("대기");
  await expect(panelRowValue(page, "현재 도구")).toHaveText("-");

  testInfo.annotations.push({
    type: "E2E-01 04-4 근거",
    description: `수집 중단 판정 = hookConfigured false + everReceived false (fixture project-basic)`,
  });
});
