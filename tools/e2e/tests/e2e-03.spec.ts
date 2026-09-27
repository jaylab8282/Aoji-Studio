// E2E-03 수정·충돌·제거 (architecture.md §8.2 E2E-03 행).
// fixture: `project-configured`.
// 검증 ID: FR-011-AC1~AC4·AC6·E2, FR-012-AC1~AC4·E1, FR-007-AC7.
//
// 각 테스트는 자기가 쓸 정의 파일·구성 파일을 fixture 임시 사본에 직접 만들어 쓰므로 실행 순서에
// 의존하지 않는다(architecture.md §8.1 "파일 변경 = Playwright가 fixture 임시 폴더의 파일을 직접 쓰고 삭제").
// 변경 API(PUT·DELETE)는 반드시 화면 버튼으로만 호출한다. 목킹 없음(conventions.md §8).
import { expect, test, type Page } from "@playwright/test";

import {
  SETUP_REFLECT_TIMEOUT_MS,
  agentFile,
  agentFileContent,
  fixturePath,
  fixturePathExists,
  floorCard,
  gotoReady,
  listFixtureDir,
  readFixtureFile,
  removeFixturePath,
  spriteSvg,
  teamFile,
  teamFileContent,
  trashDir,
  writeFixtureFile,
} from "./ui-helpers";

/** 폼에 없는 frontmatter 필드(FR-011-AC1 보존 확인용). 순서까지 그대로 남아야 한다. */
const EXTRA_FRONTMATTER = ["tools: Read, Grep", "permissionMode: acceptEdits", "color: blue"];
const ORIGINAL_BODY = "원본 지침 첫 줄.\n원본 지침 둘째 줄.";

/** frontmatter 블록의 키 순서(값 보존 확인에 함께 쓴다). */
function frontmatterLines(content: string): string[] {
  const lines = content.split("\n");
  const closing = lines.indexOf("---", 1);
  expect(closing, "frontmatter 닫는 구분자를 찾지 못했습니다").toBeGreaterThan(0);
  return lines.slice(1, closing);
}

/** 정의 파일에서 본문(닫는 `---` 다음 전체)을 바이트 그대로 잘라낸다. */
function bodyOf(content: string): string {
  const lines = content.split("\n");
  const closing = lines.indexOf("---", 1);
  return lines.slice(closing + 1).join("\n");
}

/**
 * 워크플로우 하나와 에이전트들을 fixture에 직접 만들고 02에 반영될 때까지 기다린다(준비 단계).
 * 변경 API를 쓰지 않으므로 UI 검증을 건너뛰는 것이 아니다 — 검증 대상 조작은 모두 화면으로 한다.
 */
async function prepareWorkflow(
  page: Page,
  options: {
    workflow: string;
    lead?: string | null;
    members?: string[];
    agents: { name: string; description: string; extra?: string[]; body?: string }[];
  },
): Promise<void> {
  for (const agent of options.agents) {
    writeFixtureFile(
      agentFile(agent.name),
      agentFileContent({
        name: agent.name,
        description: agent.description,
        extraFrontmatterLines: agent.extra,
        body: agent.body ?? ORIGINAL_BODY,
      }),
    );
  }
  writeFixtureFile(
    teamFile(options.workflow),
    teamFileContent({
      name: options.workflow,
      description: "E2E-03",
      lead: options.lead ?? null,
      members: options.members ?? [],
    }),
  );
  await gotoReady(page, "/workflows");
  for (const agent of options.agents) {
    if ((options.lead ?? null) === agent.name || (options.members ?? []).includes(agent.name)) {
      await expect(spriteSvg(page, agent.name)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
    }
  }
}

test("[FR-011-AC1][FR-011-AC2][FR-011-AC6][FR-007-AC7][E2E-03] 03 `정의 수정` → 06에서 name 변경 → 파일명·구성 파일이 함께 바뀌고 폼에 없는 필드·본문은 보존된다", async ({
  page,
}) => {
  const workflow = "e2e03-rename";
  const before = "e2e03-a1";
  const after = "e2e03-a1-renamed";
  await prepareWorkflow(page, {
    workflow,
    members: [before],
    agents: [{ name: before, description: "수정 대상", extra: EXTRA_FRONTMATTER }],
  });
  const originalContent = readFixtureFile(agentFile(before));

  await gotoReady(page, `/workflows/${encodeURIComponent(workflow)}?agent=${before}`);
  // FR-007-AC7: 패널 `정의 수정`이 06을 연다.
  await page.getByRole("button", { name: "정의 수정", exact: true }).click();
  const form = page.getByTestId("agent-form-dialog");
  await expect(form).toBeVisible();
  await expect(form.getByRole("heading", { name: "에이전트 수정", exact: true })).toBeVisible();
  await expect(form.getByLabel("이름 (name)", { exact: true })).toHaveValue(before);
  await expect(form.getByLabel("설명 (description)", { exact: true })).toHaveValue("수정 대상");
  // 원본 `tools: Read, Grep` → `직접 선택` + 두 체크박스
  await expect(form.getByRole("radio", { name: "직접 선택", exact: true })).toBeChecked();
  await expect(form.getByRole("checkbox", { name: "Read", exact: true })).toBeChecked();
  await expect(form.getByRole("checkbox", { name: "Grep", exact: true })).toBeChecked();
  await expect(form.getByLabel("지침 (본문 = 시스템 프롬프트)", { exact: true })).toHaveValue(
    bodyOf(originalContent),
  );
  // 각주(FR-011-AC1·AC2)
  await expect(
    form.getByText("이름 변경 시 파일명도 변경 · 폼에 없는 필드(permissionMode 등)는 기존 값 보존", {
      exact: true,
    }),
  ).toBeVisible();

  await form.getByLabel("이름 (name)", { exact: true }).fill(after);
  await form.getByLabel("설명 (description)", { exact: true }).fill("수정된 설명");
  await form.getByRole("button", { name: "저장", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page).toHaveURL(/\/workflows$/);
  await expect(spriteSvg(page, after)).toBeVisible();

  // FR-011-AC2: 파일명이 바뀌고 구성 파일 참조도 함께 바뀐다(FR-011-AC6: 한쪽만 바뀌지 않는다).
  const agentFileNames = listFixtureDir(fixturePath(".claude", "agents"));
  expect(agentFileNames).toContain(`${after}.md`);
  expect(agentFileNames).not.toContain(`${before}.md`);
  const config = JSON.parse(readFixtureFile(teamFile(workflow))) as { members: string[] };
  expect(config.members).toEqual([after]);

  // FR-011-AC1: 폼에 없는 필드의 값·순서와 본문 바이트가 그대로다.
  const saved = readFixtureFile(agentFile(after));
  expect(frontmatterLines(saved)).toEqual([
    `name: ${after}`,
    "description: 수정된 설명",
    "tools: Read, Grep",
    "permissionMode: acceptEdits",
    "color: blue",
  ]);
  expect(bodyOf(saved)).toBe(bodyOf(originalContent));
});

test("[FR-011-AC3][E2E-03] 06에서 소속 워크플로우를 바꾸면 이전 구성 파일에서 빠지고 새 구성 파일에 들어간다", async ({
  page,
}) => {
  const from = "e2e03-from";
  const to = "e2e03-to";
  const agent = "e2e03-a2";
  writeFixtureFile(teamFile(to), teamFileContent({ name: to, description: "E2E-03 이동 대상" }));
  await prepareWorkflow(page, {
    workflow: from,
    members: [agent],
    agents: [{ name: agent, description: "소속 변경 대상" }],
  });

  await gotoReady(page, `/workflows/${encodeURIComponent(from)}?agent=${agent}`);
  await page.getByRole("button", { name: "정의 수정", exact: true }).click();
  const form = page.getByTestId("agent-form-dialog");
  await expect(form.getByLabel("소속 워크플로우", { exact: true })).toHaveValue(from);
  await form.getByLabel("소속 워크플로우", { exact: true }).selectOption(to);
  await form.getByRole("radio", { name: "팀원", exact: true }).check();
  await form.getByRole("button", { name: "저장", exact: true }).click();
  await expect(form).toHaveCount(0);

  await expect(floorCard(page, to)).toContainText("1명");
  expect((JSON.parse(readFixtureFile(teamFile(from))) as { members: string[] }).members).toEqual([]);
  expect((JSON.parse(readFixtureFile(teamFile(to))) as { members: string[] }).members).toEqual([agent]);

  // FR-011-AC3 뒷부분: 워크플로우 밖 에이전트를 수정할 때는 소속을 비워 둘 수 있다(`(없음)`).
  await gotoReady(page, "/workflows?dialog=agent-edit&agent=freelancer");
  const outsideForm = page.getByTestId("agent-form-dialog");
  await expect(outsideForm.getByLabel("소속 워크플로우", { exact: true })).toHaveValue("");
  await expect(
    outsideForm.getByLabel("소속 워크플로우", { exact: true }).locator("option", { hasText: "(없음)" }),
  ).toHaveCount(1);
});

test("[FR-011-AC4][E2E-03] 저장 직전 파일이 바뀌면 06-5 → `최신 파일 다시 불러오기`가 폼을 최신 파일로 다시 채운다", async ({
  page,
}) => {
  const workflow = "e2e03-conflict-reload";
  const agent = "e2e03-a3";
  await prepareWorkflow(page, {
    workflow,
    members: [agent],
    agents: [{ name: agent, description: "충돌 전 설명" }],
  });

  await gotoReady(page, `/workflows?dialog=agent-edit&agent=${agent}`);
  const form = page.getByTestId("agent-form-dialog");
  await expect(form.getByLabel("설명 (description)", { exact: true })).toHaveValue("충돌 전 설명");

  // 폼을 연 뒤 바깥에서 같은 파일을 수정한다(길이가 달라 revision이 반드시 바뀐다).
  const externalDescription = "바깥에서 바꾼 설명 · 06-5 확인용";
  writeFixtureFile(
    agentFile(agent),
    agentFileContent({ name: agent, description: externalDescription, body: ORIGINAL_BODY }),
  );

  await form.getByLabel("설명 (description)", { exact: true }).fill("폼에서 바꾼 설명");
  await form.getByRole("button", { name: "저장", exact: true }).click();

  const conflict = page.getByTestId("save-conflict-dialog");
  await expect(conflict).toBeVisible();
  await expect(
    conflict.getByRole("heading", { name: "파일이 다른 곳에서 수정되었습니다", exact: true }),
  ).toBeVisible();
  await expect(conflict).toContainText(`${agent}.md이 이 창을 연 뒤 `);
  await expect(conflict).toContainText("에 변경되었습니다. 저장하면 그 변경이 사라집니다.");

  await conflict.getByRole("button", { name: "최신 파일 다시 불러오기", exact: true }).click();
  await expect(conflict).toHaveCount(0);
  await expect(form).toBeVisible();
  await expect(form.getByLabel("설명 (description)", { exact: true })).toHaveValue(externalDescription);
  // 저장하지 않았으므로 파일은 바깥에서 쓴 내용 그대로다.
  expect(readFixtureFile(agentFile(agent))).toContain(`description: ${externalDescription}`);
});

test("[FR-011-AC4][FR-011-AC1][E2E-03] 06-5 `덮어쓰기` → 폼 값으로 저장되고 폼에 없는 필드는 그대로 보존된다", async ({
  page,
}) => {
  const workflow = "e2e03-conflict-overwrite";
  const agent = "e2e03-a4";
  await prepareWorkflow(page, {
    workflow,
    members: [agent],
    agents: [{ name: agent, description: "덮어쓰기 전 설명", extra: EXTRA_FRONTMATTER }],
  });
  const originalBody = bodyOf(readFixtureFile(agentFile(agent)));

  await gotoReady(page, `/workflows?dialog=agent-edit&agent=${agent}`);
  const form = page.getByTestId("agent-form-dialog");
  await expect(form.getByLabel("설명 (description)", { exact: true })).toHaveValue("덮어쓰기 전 설명");

  writeFixtureFile(
    agentFile(agent),
    agentFileContent({
      name: agent,
      description: "바깥에서 바꾼 설명 · 덮어쓰기로 사라진다",
      extraFrontmatterLines: EXTRA_FRONTMATTER,
      body: ORIGINAL_BODY,
    }),
  );

  await form.getByLabel("설명 (description)", { exact: true }).fill("폼에서 저장한 설명");
  await form.getByRole("button", { name: "저장", exact: true }).click();

  const conflict = page.getByTestId("save-conflict-dialog");
  await expect(conflict).toBeVisible();
  await conflict.getByRole("button", { name: "덮어쓰기", exact: true }).click();
  await expect(page.getByTestId("agent-form-dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/workflows$/);

  const saved = readFixtureFile(agentFile(agent));
  expect(frontmatterLines(saved)).toEqual([
    `name: ${agent}`,
    "description: 폼에서 저장한 설명",
    "tools: Read, Grep",
    "permissionMode: acceptEdits",
    "color: blue",
  ]);
  expect(saved).not.toContain("바깥에서 바꾼 설명");
  expect(bodyOf(saved)).toBe(originalBody);
});

test("[FR-011-E2][E2E-03] 새 name이 이미 있으면 필드 사유 `이미 있는 name입니다`로 거부하고 파일을 바꾸지 않는다", async ({
  page,
}) => {
  const workflow = "e2e03-name-taken";
  const agent = "e2e03-a5";
  const taken = "e2e03-a5-taken";
  await prepareWorkflow(page, {
    workflow,
    members: [agent, taken],
    agents: [
      { name: agent, description: "이름 변경 시도" },
      { name: taken, description: "이미 있는 이름" },
    ],
  });

  await gotoReady(page, `/workflows?dialog=agent-edit&agent=${agent}`);
  const form = page.getByTestId("agent-form-dialog");
  await expect(form.getByLabel("이름 (name)", { exact: true })).toHaveValue(agent);
  await form.getByLabel("이름 (name)", { exact: true }).fill(taken);
  await form.getByRole("button", { name: "저장", exact: true }).click();

  await expect(form.getByText("이미 있는 name입니다", { exact: true })).toBeVisible();
  await expect(form).toBeVisible();
  const agentFileNames = listFixtureDir(fixturePath(".claude", "agents"));
  expect(agentFileNames).toContain(`${agent}.md`);
  expect(readFixtureFile(agentFile(agent))).toContain(`name: ${agent}`);
  expect(readFixtureFile(agentFile(taken))).toContain("description: 이미 있는 이름");
});

test("[FR-012-AC1][FR-012-AC2][FR-012-AC3][FR-007-AC7][E2E-03] 03 `제거` → 06-6 → 이름 일치 시 제거 → 휴지통 이동·구성 파일 반영·팀장 없음", async ({
  page,
}) => {
  const workflow = "e2e03-remove";
  const lead = "e2e03-lead6";
  const member = "e2e03-mem6";
  await prepareWorkflow(page, {
    workflow,
    lead,
    members: [member],
    agents: [
      { name: lead, description: "제거 대상 팀장" },
      { name: member, description: "남는 팀원" },
    ],
  });

  await gotoReady(page, `/workflows/${encodeURIComponent(workflow)}`);
  // FR-007-AC4: 기본 선택은 팀장이다. FR-007-AC7: 패널 `제거`가 06-6을 연다.
  await expect(page.getByRole("heading", { level: 3, name: lead, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "제거", exact: true }).click();

  const confirm = page.getByTestId("confirm-by-name-dialog");
  await expect(confirm).toBeVisible();
  await expect(
    confirm.getByRole("heading", { name: `${lead}을(를) ${workflow}에서 제거할까요?`, exact: true }),
  ).toBeVisible();
  await expect(
    confirm.getByText("정의 파일이 .jaystudio/trash/로 이동합니다 (소프트 삭제, 복구 가능).", {
      exact: true,
    }),
  ).toBeVisible();
  // FR-012-AC3 팀장 안내 줄
  await expect(
    confirm.getByText(`팀장을 제거하면 ${workflow} 층에 팀장 없음이 표시됩니다.`, { exact: true }),
  ).toBeVisible();

  // FR-012-AC1: name이 정확히 일치할 때만 활성이다.
  const confirmButton = confirm.getByRole("button", { name: "제거 (이름 일치 시 활성)", exact: true });
  await expect(confirmButton).toBeDisabled();
  await confirm.getByLabel("확인을 위해 이름 입력", { exact: true }).fill(`${lead}x`);
  await expect(confirmButton).toBeDisabled();
  await confirm.getByLabel("확인을 위해 이름 입력", { exact: true }).fill(lead);
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  await expect(confirm).toHaveCount(0);

  // FR-012-AC2: 정의 파일은 휴지통으로, 구성 파일에서는 빠진다.
  expect(listFixtureDir(fixturePath(".claude", "agents"))).not.toContain(`${lead}.md`);
  const trashNames = listFixtureDir(trashDir()).filter((name) => name.startsWith(`${lead}.`));
  expect(trashNames).toHaveLength(1);
  expect(trashNames[0]).toMatch(new RegExp(`^${lead}\\.\\d{8}-\\d{6}(-\\d+)?\\.md$`));
  const config = JSON.parse(readFixtureFile(teamFile(workflow))) as { lead: string | null; members: string[] };
  expect(config.lead).toBeNull();
  expect(config.members).toEqual([member]);

  // FR-012-AC3: 03 헤더·02 층에 `팀장 없음`이 나온다.
  await expect(page.getByText("팀장 없음", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /팀장 호출 · 터미널 열기/ })).toBeDisabled();
  await gotoReady(page, "/workflows");
  await expect(floorCard(page, workflow)).toContainText("팀장이 없습니다 · 팀장을 만들거나 가져오세요");
});

test("[FR-012-AC4][E2E-03] 휴지통에 같은 이름이 있어도 덮어쓰지 않고 시각 접미사 파일을 따로 만든다", async ({
  page,
}) => {
  const workflow = "e2e03-trash-twice";
  const agent = "e2e03-a7";
  await prepareWorkflow(page, {
    workflow,
    members: [agent],
    agents: [{ name: agent, description: "첫 번째 제거 대상", body: "첫 번째 본문." }],
  });

  await gotoReady(page, `/workflows/${encodeURIComponent(workflow)}?agent=${agent}`);
  await removeAgentFromPanel(page, agent);
  const firstTrashNames = listFixtureDir(trashDir()).filter((name) => name.startsWith(`${agent}.`));
  expect(firstTrashNames).toHaveLength(1);
  const firstTrashFile = fixturePath(".jaystudio", "trash", firstTrashNames[0] as string);
  const firstTrashContent = readFixtureFile(firstTrashFile);
  expect(firstTrashContent).toContain("첫 번째 본문.");

  // 같은 name으로 정의 파일을 다시 만들고 다시 제거한다.
  await prepareWorkflow(page, {
    workflow,
    members: [agent],
    agents: [{ name: agent, description: "두 번째 제거 대상", body: "두 번째 본문." }],
  });
  await gotoReady(page, `/workflows/${encodeURIComponent(workflow)}?agent=${agent}`);
  await removeAgentFromPanel(page, agent);

  const trashNames = listFixtureDir(trashDir()).filter((name) => name.startsWith(`${agent}.`));
  expect(trashNames).toHaveLength(2);
  // 먼저 옮긴 파일은 덮어써지지 않았다.
  expect(readFixtureFile(firstTrashFile)).toBe(firstTrashContent);
  const contents = trashNames.map((name) => readFixtureFile(fixturePath(".jaystudio", "trash", name)));
  expect(contents.some((content) => content.includes("첫 번째 본문."))).toBe(true);
  expect(contents.some((content) => content.includes("두 번째 본문."))).toBe(true);
});

test("[FR-012-E1][E2E-03] 휴지통 이동이 실패하면 사유를 보여주고 정의 파일·구성 파일을 그대로 둔다", async ({
  page,
}) => {
  const workflow = "e2e03-move-fail";
  const agent = "e2e03-a8";
  await prepareWorkflow(page, {
    workflow,
    members: [agent],
    agents: [{ name: agent, description: "이동 실패 확인" }],
  });
  const beforeContent = readFixtureFile(agentFile(agent));

  // `.jaystudio/trash`를 폴더가 아닌 일반 파일로 두면 휴지통 폴더를 만들 수 없어 이동이 실패한다.
  removeFixturePath(trashDir());
  writeFixtureFile(trashDir(), "E2E-03 FR-012-E1: 휴지통 폴더를 만들 수 없게 막는 일반 파일\n");

  try {
    await gotoReady(page, `/workflows/${encodeURIComponent(workflow)}?agent=${agent}`);
    await page.getByRole("button", { name: "제거", exact: true }).click();
    const confirm = page.getByTestId("confirm-by-name-dialog");
    await confirm.getByLabel("확인을 위해 이름 입력", { exact: true }).fill(agent);
    await confirm.getByRole("button", { name: "제거 (이름 일치 시 활성)", exact: true }).click();

    await expect(
      confirm.getByText("정의 파일을 휴지통으로 옮기지 못했습니다 · 아무것도 바꾸지 않았습니다", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(confirm).toBeVisible();

    // 파일 변경 없음
    expect(listFixtureDir(fixturePath(".claude", "agents"))).toContain(`${agent}.md`);
    expect(readFixtureFile(agentFile(agent))).toBe(beforeContent);
    expect((JSON.parse(readFixtureFile(teamFile(workflow))) as { members: string[] }).members).toEqual([
      agent,
    ]);
  } finally {
    // 막아 둔 파일을 치운다(휴지통 폴더는 다음 쓰기 시점에 서버가 만든다, FR-001-AC6).
    removeFixturePath(trashDir());
    expect(fixturePathExists(trashDir())).toBe(false);
  }
});

/** 03 패널 `제거` → 06-6 → 이름 입력 → 제거. */
async function removeAgentFromPanel(page: Page, agentName: string): Promise<void> {
  await page.getByRole("button", { name: "제거", exact: true }).click();
  const confirm = page.getByTestId("confirm-by-name-dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByLabel("확인을 위해 이름 입력", { exact: true }).fill(agentName);
  await confirm.getByRole("button", { name: "제거 (이름 일치 시 활성)", exact: true }).click();
  await expect(confirm).toHaveCount(0);
}
