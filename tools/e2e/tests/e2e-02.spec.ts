// E2E-02 워크플로우 구성 (architecture.md §8.2 E2E-02 행).
// fixture: `project-basic` (워크플로우 밖 에이전트 architect·developer 2명).
// 검증 ID: FR-008-AC1~AC4·E1·E2, FR-009-AC1·AC4·AC5·AC7, FR-010-AC1·AC2·AC5·AC6·AC7, FR-006-AC1·AC3.
//
// 흐름: 02 `+ 워크플로우 추가` → 05-L → 만들기 → 층 + 팀장 없음 경고 → `가져오기`로 팀장·팀원 지정
//       → `+ 만들기`로 새 에이전트 → 파일 내용 확인.
// 변경은 모두 화면 버튼으로 한다(API 직접 호출로 상태를 만들지 않는다). 목킹 없음(conventions.md §8).
import { expect, test } from "@playwright/test";

import {
  agentFile,
  fixturePath,
  fixturePathExists,
  floorCard,
  floorHeader,
  gotoReady,
  listFixtureDir,
  readFixtureFile,
  spriteBox,
  spriteSvg,
  teamFile,
} from "./ui-helpers";

const WORKFLOW = "e2e02-워크플로우";
/** 05-R로 가져올 fixture 에이전트(name 오름차순으로 architect → developer). */
const IMPORT_LEAD = "architect";
const IMPORT_MEMBER = "developer";
/** 06 `+ 만들기`로 새로 만드는 에이전트. */
const NEW_AGENT = "e2e02-new-agent";
const NEW_AGENT_DESCRIPTION = "E2E-02에서 만든 에이전트";
const NEW_AGENT_BODY = "새 에이전트 지침 본문.";

test("[FR-008-AC2][FR-008-AC3][FR-008-AC4][FR-006-AC3][E2E-02] 05-L 구성 확인 → 만들기 → 02에 새 층과 팀장 없음 경고", async ({
  page,
}) => {
  await gotoReady(page, "/workflows");
  await page.getByRole("button", { name: "+ 워크플로우 추가", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "워크플로우 추가" });
  await expect(dialog.getByRole("heading", { name: "워크플로우 추가", exact: true })).toBeVisible();
  await expect(
    dialog.getByText("구성 파일 .aojistudio/teams/이름.json(팀장·팀원 목록)이 만들어집니다.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByText("이름 중복 불가 · 개수 제한 없음", { exact: true })).toBeVisible();
  // FR-008-AC3 안내 박스
  await expect(
    dialog.getByText(
      "만든 뒤 팀장 1명을 만들거나 가져오세요. 팀장이 없으면 층에 팀장 없음이 표시됩니다.",
      { exact: true },
    ),
  ).toBeVisible();

  const nameInput = dialog.getByLabel("이름", { exact: true });
  await expect(nameInput).toHaveAttribute("placeholder", "개발부서");
  await expect(dialog.getByLabel("설명 (선택)", { exact: true })).toHaveAttribute(
    "placeholder",
    "한 줄 설명",
  );
  // 이름이 비어 있으면 `만들기` 비활성(이유 줄 없음 — ADR-35)
  await expect(dialog.getByRole("button", { name: "만들기", exact: true })).toBeDisabled();

  // FR-008-AC2: 앞뒤 공백은 제거되고 파일명은 이름 그대로 `<이름>.json`이다.
  await nameInput.fill(`   ${WORKFLOW}   `);
  await dialog.getByLabel("설명 (선택)", { exact: true }).fill("E2E-02 설명");
  await dialog.getByRole("button", { name: "만들기", exact: true }).click();

  // FR-008-AC4: 팝업이 닫히고 02에 새 층이 팀장 없음 경고와 함께 바로 나타난다.
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/workflows$/);
  const card = floorCard(page, WORKFLOW);
  await expect(card).toBeVisible();
  // FR-006-AC3 층 경고 줄 + 요약 자리의 `팀장 없음`
  await expect(card).toContainText("팀장이 없습니다 · 팀장을 만들거나 가져오세요");
  await expect(card).toContainText("팀장 없음");
  await expect(card).toContainText("에이전트가 없습니다 · 만들거나 가져오세요");
  await expect(card).toContainText("0명");

  expect(fixturePathExists(teamFile(WORKFLOW)), `${WORKFLOW}.json이 만들어지지 않았습니다`).toBe(true);
  const config = JSON.parse(readFixtureFile(teamFile(WORKFLOW))) as {
    name: string;
    lead: string | null;
    members: string[];
  };
  expect(config.name).toBe(WORKFLOW);
  expect(config.lead).toBeNull();
  expect(config.members).toEqual([]);
});

test("[FR-008-E2][E2E-02] 허용하지 않는 문자 → 필드에 사유, 구성 파일을 만들지 않는다", async ({ page }) => {
  await gotoReady(page, "/workflows");
  await page.getByRole("button", { name: "+ 워크플로우 추가", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "워크플로우 추가" });
  await dialog.getByLabel("이름", { exact: true }).fill("bad/name");
  await dialog.getByRole("button", { name: "만들기", exact: true }).click();

  await expect(
    dialog.getByText("1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만", { exact: true }),
  ).toBeVisible();
  // 팝업은 그대로 열려 있고 파일은 만들어지지 않는다.
  await expect(dialog).toBeVisible();
  expect(fixturePathExists(teamFile("bad/name"))).toBe(false);
  expect(fixturePathExists(teamFile("bad"))).toBe(false);
});

test("[FR-008-AC1][FR-008-E1][E2E-02] 대소문자만 다른 같은 이름 → 400 필드 사유 `이미 있는 이름입니다`", async ({
  page,
}) => {
  await gotoReady(page, "/workflows");
  // 앞 테스트가 만든 층이 있어야 중복을 검증할 수 있다.
  await expect(floorCard(page, WORKFLOW)).toBeVisible();

  await page.getByRole("button", { name: "+ 워크플로우 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "워크플로우 추가" });
  const duplicateWithOtherCase = WORKFLOW.toUpperCase();
  await dialog.getByLabel("이름", { exact: true }).fill(duplicateWithOtherCase);
  await dialog.getByRole("button", { name: "만들기", exact: true }).click();

  await expect(dialog.getByText("이미 있는 이름입니다", { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();
  // 파일이 새로 만들어지지 않았다(대소문자만 다른 이름도 같은 이름이다).
  // macOS 파일 시스템은 대소문자를 구분하지 않으므로 존재 검사 대신 폴더 목록을 대소문자 그대로 본다.
  const teamFileNames = listFixtureDir(fixturePath(".aojistudio", "teams"));
  expect(teamFileNames).toContain(`${WORKFLOW}.json`);
  expect(teamFileNames).not.toContain(`${duplicateWithOtherCase}.json`);
});

test("[FR-009-AC7][E2E-02] 헤더 `워크플로우 밖 에이전트 2 · 가져오기` → 05-R에 대상 워크플로우 드롭다운이 있고 바꾸면 제목이 함께 바뀐다", async ({
  page,
}) => {
  await gotoReady(page, "/workflows");
  await page.getByRole("button", { name: "워크플로우 밖 에이전트 2 · 가져오기", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  // 헤더 링크로 열면 대상 워크플로우가 드롭다운이다(FR-009-AC7). 고르면 제목이 그 값을 따른다(ADR-38).
  const target = dialog.getByLabel("대상 워크플로우", { exact: true });
  await expect(target).toBeVisible();
  await target.selectOption(WORKFLOW);
  await expect(
    dialog.getByRole("heading", { name: `${WORKFLOW}(으)로 기존 에이전트 가져오기`, exact: true }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("[FR-009-AC1][FR-009-AC5][FR-006-AC1][E2E-02] 층 `가져오기` → 대상 고정·목록 name 오름차순 → 팀장 지정", async ({
  page,
}) => {
  await gotoReady(page, "/workflows");
  await floorHeader(page, WORKFLOW).getByRole("button", { name: "가져오기", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: `${WORKFLOW}(으)로 기존 에이전트 가져오기` });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("어느 워크플로우에도 없는 정의 파일 2개 · 파일은 그대로 두고 소속만 지정", {
      exact: true,
    }),
  ).toBeVisible();
  // 층의 `가져오기`로 열면 대상이 고정 텍스트다 — 드롭다운이 아니다(FR-009-AC7).
  const targetField = dialog.getByText("대상 워크플로우", { exact: true }).locator("xpath=../..");
  await expect(targetField).toContainText(WORKFLOW);
  await expect(targetField.locator("select")).toHaveCount(0);

  // FR-009-AC1: 워크플로우 밖 에이전트만 name 오름차순.
  await expect(dialog.locator("tbody tr td:nth-child(2)")).toHaveText([IMPORT_LEAD, IMPORT_MEMBER]);

  // FR-009-AC5: 0명이면 비활성, 고른 인원이 라벨에 들어간다.
  await expect(dialog.getByRole("button", { name: "선택한 0명 가져오기", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: IMPORT_LEAD, exact: true }).check();
  await dialog.getByLabel(`${IMPORT_LEAD} 역할`, { exact: true }).selectOption("lead");
  await dialog.getByRole("button", { name: "선택한 1명 가져오기", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // 02 층: 팀장이 첫 자리에 팀장 배지와 함께 놓이고 경고가 사라진다(FR-006-AC1·AC3).
  const card = floorCard(page, WORKFLOW);
  await expect(spriteSvg(page, IMPORT_LEAD)).toBeVisible();
  await expect(spriteBox(page, IMPORT_LEAD)).toContainText("팀장");
  await expect(card).not.toContainText("팀장이 없습니다 · 팀장을 만들거나 가져오세요");
  await expect(card).toContainText("1명");

  // FR-009-AC3 계약: 정의 파일은 그대로 두고 구성 파일에만 소속·역할을 기록한다.
  const config = JSON.parse(readFixtureFile(teamFile(WORKFLOW))) as { lead: string; members: string[] };
  expect(config.lead).toBe(IMPORT_LEAD);
  expect(config.members).toEqual([]);
});

test("[FR-009-AC4][E2E-02] 대상 워크플로우에 팀장이 있으면 05-R 역할 드롭다운의 `팀장` 옵션이 비활성", async ({
  page,
}) => {
  await gotoReady(page, "/workflows");
  await floorHeader(page, WORKFLOW).getByRole("button", { name: "가져오기", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: `${WORKFLOW}(으)로 기존 에이전트 가져오기` });
  // 남은 후보는 developer 한 명이다(architect는 앞 테스트에서 팀장이 되었다).
  await expect(dialog.locator("tbody tr td:nth-child(2)")).toHaveText([IMPORT_MEMBER]);

  const roleSelect = dialog.getByLabel(`${IMPORT_MEMBER} 역할`, { exact: true });
  // FR-009-AC4: 대상에 팀장이 있으면 `팀장` 옵션이 비활성이고 `팀원`만 고를 수 있다.
  await expect(roleSelect.locator("option", { hasText: "팀장" })).toBeDisabled();
  await expect(roleSelect.locator("option", { hasText: "팀원" })).toBeEnabled();
  await expect(roleSelect).toHaveValue("member");

  await dialog.getByRole("checkbox", { name: IMPORT_MEMBER, exact: true }).check();
  await dialog.getByRole("button", { name: "선택한 1명 가져오기", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await expect(spriteSvg(page, IMPORT_MEMBER)).toBeVisible();
  await expect(spriteBox(page, IMPORT_MEMBER)).not.toContainText("팀장");
  await expect(floorCard(page, WORKFLOW)).toContainText("2명");
  const config = JSON.parse(readFixtureFile(teamFile(WORKFLOW))) as { lead: string; members: string[] };
  expect(config.lead).toBe(IMPORT_LEAD);
  expect(config.members).toEqual([IMPORT_MEMBER]);
});

test("[FR-010-AC1][FR-010-AC2][E2E-02] 06 검증: name 규칙 위반·중복, 도구 방식 미선택·직접 선택 0개", async ({
  page,
}) => {
  await gotoReady(page, "/workflows");
  await floorHeader(page, WORKFLOW).getByRole("button", { name: "+ 만들기", exact: true }).click();
  const form = page.getByTestId("agent-form-dialog");
  await expect(form).toBeVisible();

  // FR-010-AC1: `^[a-z0-9-]+$`, 1~64자
  await form.getByLabel("이름 (name)", { exact: true }).fill("BadName");
  await expect(form.getByText("소문자·숫자·하이픈만, 1~64자", { exact: true })).toBeVisible();

  // FR-010-AC2: 도구 방식을 명시하지 않으면 `저장` 비활성 + 이유 줄
  await form.getByLabel("이름 (name)", { exact: true }).fill(IMPORT_MEMBER);
  await form.getByLabel("설명 (description)", { exact: true }).fill("중복 확인용");
  await form.getByRole("radio", { name: "팀원", exact: true }).check();
  await expect(form.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
  await expect(form.getByText("도구 방식을 고르세요", { exact: true })).toBeVisible();

  // FR-010-AC2: `직접 선택`인데 0개면 사유가 붙고 `저장`은 그대로 비활성이다.
  await form.getByRole("radio", { name: "직접 선택", exact: true }).check();
  await expect(form.getByText("직접 선택은 1개 이상", { exact: true })).toBeVisible();
  await expect(form.getByRole("button", { name: "저장", exact: true })).toBeDisabled();

  // FR-010-AC1: 이미 있는 name → 서버가 필드 사유로 거부하고 폼은 열려 있다.
  await form.getByRole("radio", { name: "전체 상속", exact: true }).check();
  await form.getByRole("button", { name: "저장", exact: true }).click();
  await expect(form.getByText("이미 있는 name입니다", { exact: true })).toBeVisible();
  await expect(form).toBeVisible();
  expect(fixturePathExists(agentFile("BadName"))).toBe(false);

  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);
});

test("[FR-010-AC2][FR-010-AC5][FR-010-AC6][FR-010-AC7][E2E-02] 06 `+ 만들기` 저장 → 02 새 책상·안내 줄, 정의 파일·구성 파일 내용 확인", async ({
  page,
}) => {
  await gotoReady(page, "/workflows");
  await floorHeader(page, WORKFLOW).getByRole("button", { name: "+ 만들기", exact: true }).click();
  const form = page.getByTestId("agent-form-dialog");
  await expect(form).toBeVisible();

  await form.getByLabel("이름 (name)", { exact: true }).fill(NEW_AGENT);
  await form.getByLabel("설명 (description)", { exact: true }).fill(NEW_AGENT_DESCRIPTION);
  await form.getByRole("radio", { name: "팀원", exact: true }).check();
  // FR-010-AC2 `직접 선택` + 체크박스 + `기타` 직접 입력(쉼표 구분)
  await form.getByRole("radio", { name: "직접 선택", exact: true }).check();
  await form.getByRole("checkbox", { name: "Read", exact: true }).check();
  await form.getByRole("checkbox", { name: "Edit", exact: true }).check();
  await form.getByLabel("기타", { exact: true }).fill("NotebookEdit");
  await form.getByLabel("지침 (본문 = 시스템 프롬프트)", { exact: true }).fill(NEW_AGENT_BODY);
  await form.getByRole("button", { name: "저장", exact: true }).click();

  // FR-010-AC5: 저장 후 02로 돌아가고 새 책상이 보인다.
  await expect(form).toHaveCount(0);
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(spriteSvg(page, NEW_AGENT)).toBeVisible();
  await expect(floorCard(page, WORKFLOW)).toContainText("3명");

  // FR-010-AC6 안내 줄(02 상단 한 줄)
  await expect(
    page.getByText("Claude Code가 새 정의를 바로 인식하지 못하면 재시작이 필요할 수 있습니다", {
      exact: true,
    }),
  ).toBeVisible();

  // FR-010-AC5 파일 내용: frontmatter name·description·tools + 본문
  const definition = readFixtureFile(agentFile(NEW_AGENT));
  expect(definition).toContain(`name: ${NEW_AGENT}`);
  expect(definition).toContain(`description: ${NEW_AGENT_DESCRIPTION}`);
  expect(definition).toContain("tools: Read, Edit, NotebookEdit");
  // `model`은 `상속 (지정 안 함)`이므로 줄을 쓰지 않는다(ADR-13, FR-010-AC5).
  expect(definition).not.toContain("model:");
  expect(definition.endsWith(NEW_AGENT_BODY)).toBe(true);

  // FR-010-AC7: 정의 파일과 구성 파일이 함께 반영된다.
  const config = JSON.parse(readFixtureFile(teamFile(WORKFLOW))) as { lead: string; members: string[] };
  expect(config.lead).toBe(IMPORT_LEAD);
  expect(config.members).toEqual([IMPORT_MEMBER, NEW_AGENT]);
});
