// E2E-10 워크플로우 삭제 (architecture.md §8.2 E2E-10 행).
// fixture: `project-configured`.
// 검증 ID: FR-017-AC1~AC4·E1, FR-007-E2.
//
// 대상 워크플로우·에이전트는 이 spec이 화면 버튼으로 직접 만들므로 fixture의 다른 워크플로우에
// 의존하지 않는다(실행 순서 무관). 변경 API는 모두 화면을 거친다. 목킹 없음(conventions.md §8).
import { expect, test } from "@playwright/test";

import {
  addWorkflowViaUi,
  createAgentViaUi,
  fixturePath,
  fixturePathExists,
  floorHeader,
  floorName,
  gotoReady,
  listFixtureDir,
  removeSelectedAgentViaUi,
  spriteSvg,
  teamFile,
  teamFileContent,
  trashDir,
  writeFixtureFile,
} from "./ui-helpers";

/** ADR-34: FR-017-E1 안내는 3000ms 동안 보인 뒤 팝업이 닫힌다. 측정 허용 범위. */
const NOT_EMPTY_NOTICE_MIN_MS = 2500;
const NOT_EMPTY_NOTICE_MAX_MS = 6000;

test("[FR-017-AC1][FR-017-AC2][FR-017-AC3][FR-017-AC4][FR-007-E2][E2E-10] 인원 있는 층 `삭제` 비활성 → 인원 0 → 05-3 → 삭제 → 층 사라짐, 열려 있던 03 탭은 찾을 수 없습니다", async ({
  page,
  context,
}) => {
  const workflow = "e2e10-삭제대상";
  const lead = "e2e10-lead";
  const member = "e2e10-member";

  await gotoReady(page, "/workflows");
  await addWorkflowViaUi(page, workflow);
  await createAgentViaUi(page, { workflowName: workflow, name: lead, description: "삭제 확인용 팀장", role: "팀장" });
  await createAgentViaUi(page, {
    workflowName: workflow,
    name: member,
    description: "삭제 확인용 팀원",
    role: "팀원",
  });

  // FR-017-AC1: 구성 파일의 팀장·팀원이 1명 이상이면 `삭제`가 비활성이고 이유가 붙는다.
  const header = floorHeader(page, workflow);
  await expect(header.getByRole("button", { name: "삭제", exact: true })).toBeDisabled();
  await expect(header.getByText("팀원을 먼저 제거하세요", { exact: true })).toBeVisible();

  // 인원을 0으로 만든다(03 패널 `제거` → 06-6). 팀장을 먼저 제거하면 남은 팀원이 첫 자리가 된다.
  await gotoReady(page, `/workflows/${encodeURIComponent(workflow)}`);
  await removeSelectedAgentViaUi(page, lead);
  await expect(page.getByRole("heading", { level: 3, name: member, exact: true })).toBeVisible();
  await removeSelectedAgentViaUi(page, member);
  await expect(page.getByText("선택할 에이전트가 없습니다", { exact: true })).toBeVisible();

  await gotoReady(page, "/workflows");
  await expect(floorHeader(page, workflow).getByRole("button", { name: "삭제", exact: true })).toBeEnabled();
  await expect(floorHeader(page, workflow).getByText("팀원을 먼저 제거하세요", { exact: true })).toHaveCount(0);

  // FR-007-E2 확인용으로 03을 다른 탭에 열어 둔다.
  const detailTab = await context.newPage();
  await gotoReady(detailTab, `/workflows/${encodeURIComponent(workflow)}`);
  await expect(detailTab.getByRole("heading", { level: 1, name: workflow, exact: true })).toBeVisible();

  // FR-017-AC2·AC3: 05-3 구성과 이름 일치 판정
  await floorHeader(page, workflow).getByRole("button", { name: "삭제", exact: true }).click();
  const confirm = page.getByTestId("confirm-by-name-dialog");
  await expect(
    confirm.getByRole("heading", { name: `${workflow} 워크플로우를 삭제할까요?`, exact: true }),
  ).toBeVisible();
  await expect(
    confirm.getByText(`구성 파일 .aojistudio/teams/${workflow}.json이 삭제됩니다`, { exact: true }),
  ).toBeVisible();
  const deleteButton = confirm.getByRole("button", { name: "삭제 (이름 일치 시 활성)", exact: true });
  await expect(deleteButton).toBeDisabled();
  await confirm.getByLabel("확인을 위해 이름 입력", { exact: true }).fill(`${workflow}x`);
  await expect(deleteButton).toBeDisabled();
  await confirm.getByLabel("확인을 위해 이름 입력", { exact: true }).fill(workflow);
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();

  // FR-017-AC4: 팝업이 닫히고 02에서 층이 사라진다. 구성 파일은 지워지고 휴지통으로 가지 않는다.
  await expect(confirm).toHaveCount(0);
  await expect(floorName(page, workflow)).toHaveCount(0);
  expect(listFixtureDir(fixturePath(".aojistudio", "teams"))).not.toContain(`${workflow}.json`);
  expect(listFixtureDir(trashDir())).not.toContain(`${workflow}.json`);

  // FR-007-E2: 열려 있던 03 탭은 본문 전체가 안내로 바뀐다(SSE registry 갱신).
  await expect(detailTab.getByText("워크플로우를 찾을 수 없습니다", { exact: true })).toBeVisible();
  await expect(detailTab.getByRole("button", { name: "에이전트 워크플로우로", exact: true })).toBeEnabled();
  await detailTab.getByRole("button", { name: "에이전트 워크플로우로", exact: true }).click();
  await expect(detailTab).toHaveURL(/\/workflows$/);
  await detailTab.close();
});

test("[FR-017-E1][E2E-10] 확인 사이에 팀원이 추가되면 삭제를 거부하고 `팀원이 있어 삭제할 수 없습니다`를 3초 보여준 뒤 닫는다", async ({
  page,
}, testInfo) => {
  const workflow = "e2e10-경쟁";
  const ghostMember = "e2e10-ghost";

  await gotoReady(page, "/workflows");
  await addWorkflowViaUi(page, workflow);

  // 05-3을 열어 이름까지 입력한 뒤(= 확인 중) 바깥에서 구성 파일에 팀원을 넣는다.
  await floorHeader(page, workflow).getByRole("button", { name: "삭제", exact: true }).click();
  const confirm = page.getByTestId("confirm-by-name-dialog");
  await confirm.getByLabel("확인을 위해 이름 입력", { exact: true }).fill(workflow);
  const deleteButton = confirm.getByRole("button", { name: "삭제 (이름 일치 시 활성)", exact: true });
  await expect(deleteButton).toBeEnabled();

  writeFixtureFile(
    teamFile(workflow),
    teamFileContent({ name: workflow, description: "확인 사이에 추가된 팀원", members: [ghostMember] }),
  );

  const clickedAt = Date.now();
  await deleteButton.click();

  // 서버는 삭제 직전에 다시 스캔해 거부한다(409 WORKFLOW_NOT_EMPTY).
  await expect(confirm.getByText("팀원이 있어 삭제할 수 없습니다", { exact: true })).toBeVisible();
  // 안내 표시 중에는 같은 DELETE를 두 번 보내지 않도록 `삭제`가 비활성으로 묶인다(ADR-34).
  await expect(deleteButton).toBeDisabled();

  // 안내를 보여준 뒤 팝업이 스스로 닫힌다(ADR-34: 3000ms).
  await expect(confirm).toHaveCount(0, { timeout: NOT_EMPTY_NOTICE_MAX_MS });
  const noticeMs = Date.now() - clickedAt;
  testInfo.annotations.push({
    type: "FR-017-E1 안내 표시 시간",
    description: `${noticeMs}ms (ADR-34 기준 3000ms, 허용 ${NOT_EMPTY_NOTICE_MIN_MS}~${NOT_EMPTY_NOTICE_MAX_MS}ms)`,
  });
  expect(noticeMs).toBeGreaterThanOrEqual(NOT_EMPTY_NOTICE_MIN_MS);
  expect(noticeMs).toBeLessThanOrEqual(NOT_EMPTY_NOTICE_MAX_MS);

  // 구성 파일은 유지되고 02에는 층이 그대로 남아 깨진 참조로 갱신된다.
  expect(fixturePathExists(teamFile(workflow))).toBe(true);
  await expect(floorName(page, workflow)).toBeVisible();
  await expect(spriteSvg(page, ghostMember)).toHaveCount(0);
});
