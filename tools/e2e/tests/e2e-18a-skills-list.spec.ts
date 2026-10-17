// E2E-18 중 08 목록 쪽(T-R4-15, 배치 12): 삭제(08-3)·밖에서 바뀐 스킬 2초 반영·형식 오류 행·가져온 스킬 행.
// 쓰기 화면(만들기·수정·가져오기)은 T-R4-16의 e2e-18b가 같은 배치에서 이어서 다룬다.
// fixture: `project-skills` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-empty`(architecture §8.2 배치 12).
// 검증 ID: FR-022-AC3·AC5·AC4, FR-018-AC4, FR-018-E1 (+ 같은 흐름에서 보이는 FR-022-AC1·AC2, FR-018-AC1).
//
// 각 테스트는 자기가 쓰는 스킬(`e2e18a-*`)을 호스트 폴더(임시 사본)에 직접 만들고 끝에서 치우므로 실행 순서에 기대지 않는다.
// 같은 배치의 e2e-18b가 스킬을 더하거나 바꿔도 이 spec은 스킬 수를 "시작 시 읽은 값 ± 변화량"으로만 단언한다.
// 가져온 스킬은 가져오기 UI(T-R4-16) 없이 SOURCE.md가 있는 폴더를 호스트에서 만들어 준비한다. 목킹 없음(conventions §8).
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { captureBaseSizesAndRestore, expectDialogWidth, expectRegionsVisible, sizeLabel } from "./screen-helpers";
import {
  fixturePath,
  fixturePathExists,
  gotoReady,
  listFixtureDir,
  measureFileChangeReflection,
  readFixtureFile,
  removeFixturePath,
  trashDir,
  writeFixtureFile,
} from "./ui-helpers";

// ── 화면 도우미 (ui-spec SCR-08·08-3) ────────────────────────────────────────────

/** 목록 카드(`ExpandableList`, `role=region`, `data-wf="08-5"`). */
function skillList(page: Page): Locator {
  return page.locator('[data-wf="08-5"]');
}

/** 스킬 한 행 = 그 이름의 펼침 버튼(`<이름> 펼치기`/`<이름> 접기`)을 가진 `listitem`. */
function skillRow(page: Page, name: string): Locator {
  const label = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (펼치기|접기)$`);
  return skillList(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: label }) });
}

/** 제목 줄(`08-2`)의 `N개`. 읽을 때 기다리지 않는 조회라 반영 시간 측정에 쓴다. */
async function titleCount(page: Page): Promise<number | null> {
  const texts = await page.locator('[data-wf="08-2"]').allTextContents();
  const match = /(\d+)개/.exec(texts.join(" "));
  return match ? Number(match[1]) : null;
}

async function readTitleCount(page: Page): Promise<number> {
  await expect.poll(() => titleCount(page)).not.toBeNull();
  return (await titleCount(page)) as number;
}

async function expandRow(page: Page, name: string): Promise<Locator> {
  const row = skillRow(page, name);
  await row.getByRole("button", { name: `${name} 펼치기`, exact: true }).click();
  const detail = row.locator('[data-wf="08-13"]');
  await expect(detail).toBeVisible();
  return detail;
}

function skillMd(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${name} 본문.\n`;
}

function skillDir(name: string): string {
  return fixturePath(".claude", "skills", name);
}

/** 08-3 확인 창을 열고 이름을 똑같이 입력해 `삭제`를 누른다. */
async function deleteViaDialog(page: Page, name: string): Promise<void> {
  await skillRow(page, name).getByRole("button", { name: "삭제", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `${name} 스킬을 삭제할까요?`, exact: true })).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "삭제", exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("확인을 위해 스킬 이름 입력", { exact: true }).fill(name);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toHaveCount(0);
}

/** 휴지통에서 `<name>.<yyyyMMdd-HHmmss>[-N]` 폴더(스킬 폴더째 이동, architecture §6.4)를 찾는다. */
function trashedSkillDirs(name: string): string[] {
  const pattern = new RegExp(`^${name}\\.\\d{8}-\\d{6}(-\\d+)?$`);
  return listFixtureDir(trashDir()).filter((entry) => pattern.test(entry));
}

// 3크기 캡처의 전환 완료 판정(ADR-75 5)을 위해 전환을 줄인다.
test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
  await gotoReady(page, "/skills");
  await expect(skillList(page)).toBeVisible();
});

// ── 08-3 삭제 창 구성과 캡처 ───────────────────────────────────────────────────

test("[FR-022-AC1][FR-022-AC2][E2E-18] 08-3 `design-review`(미리 넣어 쓰는 에이전트 2명): 제목·휴지통 안내·에이전트 목록·이름 일치 전 `삭제` 비활성 → 캡처 `08-3-skill-delete@1920x1080` → `취소`", async ({
  page,
}) => {
  const skill = "design-review";
  const agentFiles = ["proj-dev.md", "proj-lead.md"].map((file) => fixturePath(".claude", "agents", file));
  const agentsBefore = agentFiles.map((file) => readFixtureFile(file));

  await skillRow(page, skill).getByRole("button", { name: "삭제", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `${skill} 스킬을 삭제할까요?`, exact: true })).toBeVisible();
  await expect(
    dialog.getByText("스킬 폴더가 .aojistudio/trash/로 이동합니다 (폴더를 옮겨 복구할 수 있습니다)", { exact: true }),
  ).toBeVisible();

  // FR-022-AC2: 정의 파일 `skills:`에 이 스킬을 둔 에이전트(fixture 기준 proj-dev·proj-lead)가 name 오름차순으로 보인다.
  const usedBy = dialog.locator('[data-wf="08-3-2"]');
  await expect(usedBy).toContainText("이 스킬을 미리 넣어 쓰는 에이전트 2명");
  await expect(usedBy).toContainText("에이전트 정의 파일의 skills: 항목은 바뀌지 않습니다");
  const names = await usedBy.getByText(/^proj-(dev|lead)$/).allTextContents();
  expect(names).toEqual(["proj-dev", "proj-lead"]);

  // FR-022-AC1: 이름이 다르면 `삭제` 비활성 + 이유 줄
  const confirm = dialog.getByRole("button", { name: "삭제", exact: true });
  const input = dialog.getByLabel("확인을 위해 스킬 이름 입력", { exact: true });
  await expect(input).toHaveAttribute("placeholder", skill);
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByText(`${skill}을(를) 똑같이 입력하면 삭제 버튼이 켜집니다`, { exact: true })).toBeVisible();
  await input.fill("design-revie");
  await expect(confirm).toBeDisabled();

  // 캡처(입력 전 상태 — ui-spec 배치 12 순서 4)
  await input.fill("");
  await captureBaseSizesAndRestore(page, "08-3-skill-delete", async (size) => {
    await expectRegionsVisible(page, ["NAV", "08-3-1", "08-3-2", "08-3-3", "08-3-4"], `08-3 ${sizeLabel(size)}`);
    await expectDialogWidth(page, size, "08-3-1", "sm");
  });

  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // 취소: 폴더·정의 파일 그대로
  expect(fixturePathExists(join(skillDir(skill), "SKILL.md"))).toBe(true);
  expect(trashedSkillDirs(skill)).toEqual([]);
  expect(agentFiles.map((file) => readFixtureFile(file))).toEqual(agentsBefore);
});

// ── 삭제 ─────────────────────────────────────────────────────────────────────

test("[FR-022-AC3][FR-022-AC5][FR-022-AC2][E2E-18] 스킬 삭제: 폴더가 `.aojistudio/trash/<이름>.<일시>/`로 이동하고 08 행이 빠지고 스킬 수가 1 줄며 에이전트 정의 파일은 그대로다", async ({
  page,
}) => {
  const skill = "e2e18a-trash";
  const agentFiles = ["proj-dev.md", "proj-lead.md", "proj-writer.md", "proj-ops.md"].map((file) =>
    fixturePath(".claude", "agents", file),
  );
  const agentsBefore = agentFiles.map((file) => readFixtureFile(file));

  const base = await readTitleCount(page);
  writeFixtureFile(join(skillDir(skill), "SKILL.md"), skillMd(skill, "삭제 시험용 스킬"));
  writeFixtureFile(join(skillDir(skill), "notes.txt"), "폴더째 옮겨지는지 보는 보조 파일\n");
  await expect(skillRow(page, skill)).toHaveCount(1);
  await expect.poll(() => titleCount(page)).toBe(base + 1);

  // 어느 에이전트도 넣어 쓰지 않으면 08-3에 에이전트 상자가 없다(FR-022-AC2 N = 0)
  await skillRow(page, skill).getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByRole("dialog").locator('[data-wf="08-3-2"]')).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await deleteViaDialog(page, skill);

  // FR-022-AC5: 행이 빠지고 스킬 수가 줄어든다
  await expect(skillRow(page, skill)).toHaveCount(0);
  await expect.poll(() => titleCount(page)).toBe(base);

  // FR-022-AC3: 원래 자리에서 사라지고 휴지통 폴더로 옮겨졌다(내용 보존)
  expect(fixturePathExists(skillDir(skill))).toBe(false);
  const trashed = trashedSkillDirs(skill);
  expect(trashed, `휴지통 항목: ${JSON.stringify(listFixtureDir(trashDir()))}`).toHaveLength(1);
  const trashedPath = join(trashDir(), trashed[0] as string);
  expect(readFixtureFile(join(trashedPath, "SKILL.md"))).toBe(skillMd(skill, "삭제 시험용 스킬"));
  expect(readFixtureFile(join(trashedPath, "notes.txt"))).toBe("폴더째 옮겨지는지 보는 보조 파일\n");

  // 정의 파일 `skills:`는 바뀌지 않는다(FR-022-AC2 안내문의 약속)
  expect(agentFiles.map((file) => readFixtureFile(file))).toEqual(agentsBefore);
});

test("[FR-022-AC4][FR-018-AC5][E2E-18] 가져온 스킬(SOURCE.md 있는 폴더): `가져온 스킬` 칩이 보이고 `삭제`가 가능하며 폴더째 휴지통으로 이동한다", async ({
  page,
}) => {
  // fixture의 가져온 스킬 `imported-lint`도 같은 표지를 가진다(읽기만 한다 — 삭제는 이 spec이 만든 스킬로 한다).
  await expect(skillRow(page, "imported-lint").getByText("가져온 스킬", { exact: true })).toBeVisible();

  const skill = "e2e18a-imported";
  const base = await readTitleCount(page);
  writeFixtureFile(join(skillDir(skill), "SKILL.md"), skillMd(skill, "가져온 스킬 삭제 시험"));
  writeFixtureFile(
    join(skillDir(skill), "SOURCE.md"),
    "# 출처\n\n- 출처: https://example.test/aoji-fixture/e2e18a-imported\n- 커밋: 0000000000000000000000000000000000000000\n- 라이선스: MIT\n",
  );
  writeFixtureFile(join(skillDir(skill), "scripts", "run.sh"), "#!/bin/sh\necho e2e18a\n");

  const row = skillRow(page, skill);
  await expect(row).toHaveCount(1);
  await expect(row.getByText("가져온 스킬", { exact: true })).toBeVisible();
  await expect.poll(() => titleCount(page)).toBe(base + 1);
  await expect(row.getByRole("button", { name: "삭제", exact: true })).toBeEnabled();

  await deleteViaDialog(page, skill);

  await expect(skillRow(page, skill)).toHaveCount(0);
  await expect.poll(() => titleCount(page)).toBe(base);
  expect(fixturePathExists(skillDir(skill))).toBe(false);
  const trashed = trashedSkillDirs(skill);
  expect(trashed).toHaveLength(1);
  const trashedPath = join(trashDir(), trashed[0] as string);
  expect(fixturePathExists(join(trashedPath, "SOURCE.md"))).toBe(true);
  expect(fixturePathExists(join(trashedPath, "scripts", "run.sh"))).toBe(true);
});

// ── 밖에서 바뀐 스킬 2초 반영 ────────────────────────────────────────────────────

test("[FR-018-AC4][FR-018-AC1][E2E-18] 호스트에서 스킬 폴더 추가 → SKILL.md 수정 → 폴더 삭제가 각각 2초 안에 08 행·설명·스킬 수에 반영된다", async ({
  page,
}, testInfo) => {
  const skill = "e2e18a-outside";
  const base = await readTitleCount(page);
  const row = skillRow(page, skill);

  // ① 폴더 추가 → 행이 나타나고 수가 는다
  await measureFileChangeReflection(
    testInfo,
    "스킬 폴더 추가 → 08 행",
    () => writeFixtureFile(join(skillDir(skill), "SKILL.md"), skillMd(skill, "처음 설명")),
    async () => (await row.count()) === 1 && (await titleCount(page)) === base + 1,
  );

  // ② SKILL.md 수정 → 펼친 설명이 바뀐다(펼침은 유지된다 — FR-018-AC7)
  const detail = await expandRow(page, skill);
  await expect(detail).toContainText("처음 설명");
  await measureFileChangeReflection(
    testInfo,
    "SKILL.md 수정 → 08 설명",
    () => writeFixtureFile(join(skillDir(skill), "SKILL.md"), skillMd(skill, "바깥에서 고친 설명")),
    async () => (await detail.allTextContents()).join(" ").includes("바깥에서 고친 설명"),
  );
  expect(await row.getByRole("button", { name: `${skill} 접기`, exact: true }).getAttribute("aria-expanded")).toBe("true");

  // ③ 폴더 삭제 → 행이 빠지고 수가 원래대로 돌아온다
  await measureFileChangeReflection(
    testInfo,
    "스킬 폴더 삭제 → 08 행",
    () => removeFixturePath(skillDir(skill)),
    async () => (await row.count()) === 0 && (await titleCount(page)) === base,
  );
  expect(trashedSkillDirs(skill)).toEqual([]);
});

// ── 형식 오류 행 ────────────────────────────────────────────────────────────────

test("[FR-018-E1][FR-018-AC1][E2E-18] 형식 오류 스킬 4종: `형식 오류` 칩, 펼치면 사유(frontmatter 형식 오류·UTF-8 인코딩 오류·name이 폴더 이름과 다름), `삭제`는 가능하다", async ({
  page,
}) => {
  const reasons: Array<[string, string]> = [
    ["bad-utf8", "UTF-8 인코딩 오류"],
    ["bad-yaml", "frontmatter 형식 오류"],
    ["name-mismatch", "name이 폴더 이름과 다름"],
    ["no-delimiter", "frontmatter 형식 오류"],
  ];

  for (const [skill, reason] of reasons) {
    const row = skillRow(page, skill);
    await expect(row, `${skill} 행`).toHaveCount(1);
    await expect(row.getByText("형식 오류", { exact: true }), `${skill} 칩`).toBeVisible();
    await expect(row.getByRole("button", { name: "삭제", exact: true }), `${skill} 삭제`).toBeEnabled();
    const detail = await expandRow(page, skill);
    await expect(detail, `${skill} 사유`).toContainText(reason);
  }

  // 형식 오류 스킬도 일반 행처럼 목록 수에 들어간다: 시작 fixture 8개 중 오류 4개(첫 테스트 순서에 기대지 않도록 오류 행 수만 단언)
  await expect(skillList(page).getByText("형식 오류", { exact: true })).toHaveCount(4);
});
