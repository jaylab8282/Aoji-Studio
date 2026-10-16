// E2E-18 중 스킬 쓰기 쪽(T-R4-16, 배치 12): 08-1 만들기·수정, 08-4 충돌, 08-2 가져오기(정상·위험 zip 4종).
// 삭제(08-3)·밖에서 바뀐 스킬·형식 오류 행은 e2e-18a가 같은 배치에서 먼저 다룬다(파일 이름순).
// fixture: `project-skills` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-empty`(architecture §8.2 배치 12).
// 검증 ID: FR-020-AC2·AC3·AC4·AC6, FR-021-AC1~AC6, 위험 zip 4종 거부 + 마운트에 남은 것 0(FR-021-E1·E2, NFR-07)
//          (+ 같은 흐름에서 보이는 FR-020-AC1·AC5, FR-018-AC5).
// 캡처(D-172, ui-spec 배치 12 순서 1~3): `08-skills`(첫 행 펼침)·`08-1-skill-form`·`08-4-skill-conflict`·`08-2-skill-import` @1920x1080.
//
// 각 테스트는 자기가 쓰는 스킬(`e2e18b-*`, `design-token-audit`)만 만들고 afterAll에서 치운다. 서로의 순서에 기대지 않는다.
// zip은 spec이 테스트별 출력 폴더(임시)에 만든다. 목킹 없음(conventions §8) — 실제 컨테이너 화면과 API만 쓴다.
// 화면 셀렉터는 ui-spec SCR-08·08-1·08-2·08-4의 문구·`data-wf`·역할만 쓴다(`data-testid` 없음).
import { mkdirSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
import { expectRegionsVisible, SCREENSHOT_DIR, settle, sizeLabel } from "./screen-helpers";
import {
  choose,
  fixturePath,
  fixturePathExists,
  gotoReady,
  readFixtureFile,
  removeFixturePath,
  trashDir,
  writeFixtureFile,
} from "./ui-helpers";
import { writeZip, type ZipEntry } from "./zip-builder";

const CAPTURE_SIZE = { width: 1920, height: 1080 } as const;
const SAVE_NOTICE = "Claude Code가 새 스킬을 바로 인식하지 못하면 재시작이 필요할 수 있습니다";
const CREATED_SKILLS = [
  "design-token-audit",
  "e2e18b-keep",
  "e2e18b-conflict",
  "e2e18b-imported",
  "e2e18b-nameless",
  "e2e18b-top",
];

// ── 화면 도우미 (ui-spec SCR-08·08-1·08-2·08-4) ─────────────────────────────────

function skillList(page: Page): Locator {
  return page.locator('[data-wf="08-5"]');
}

function skillRow(page: Page, name: string): Locator {
  const label = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (펼치기|접기)$`);
  return skillList(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: label }) });
}

async function titleCount(page: Page): Promise<number | null> {
  const texts = await page.locator('[data-wf="08-2"]').allTextContents();
  const match = /(\d+)개/.exec(texts.join(" "));
  return match ? Number(match[1]) : null;
}

function skillDir(name: string): string {
  return fixturePath(".claude", "skills", name);
}

function skillFile(name: string): string {
  return join(skillDir(name), "SKILL.md");
}

/** frontmatter 줄 목록과 본문(닫는 `---\n` 뒤 원문 그대로)으로 나눈다. */
function splitSkillMd(content: string): { lines: string[]; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);
  if (!match) {
    throw new Error(`frontmatter 형식이 아닙니다:\n${content}`);
  }
  return { lines: (match[1] as string).split("\n"), body: match[2] as string };
}

async function capture(page: Page, name: string, regions: readonly string[]): Promise<void> {
  await page.setViewportSize(CAPTURE_SIZE);
  await settle(page);
  await expectRegionsVisible(page, regions, `${name} ${sizeLabel(CAPTURE_SIZE)}`);
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${name}@${sizeLabel(CAPTURE_SIZE)}.png`),
    caret: "hide",
    animations: "disabled",
  });
}

/** 08 제목 줄의 `가져오기` / `스킬 만들기`(창 안의 같은 이름 버튼과 구분하려고 제목 줄 영역에서 찾는다). */
function pageButton(page: Page, name: "가져오기" | "스킬 만들기"): Locator {
  return page.locator('[data-wf="08-2"]').getByRole("button", { name, exact: true });
}

/** 08-1 필드. 라벨 글자는 ui-spec 기준(`필수` 칩이 붙을 수 있어 앞부분만 맞춘다). */
function formFields(dialog: Locator) {
  return {
    name: dialog.getByRole("textbox", { name: /^이름/ }),
    description: dialog.getByRole("textbox", { name: /^설명/ }),
    body: dialog.getByRole("textbox", { name: /^본문/ }),
    userOnly: dialog.getByRole("checkbox", { name: /사용자만 호출/ }),
    save: dialog.getByRole("button", { name: "저장", exact: true }),
  };
}

async function openEdit(page: Page, name: string): Promise<Locator> {
  const edit = skillRow(page, name).getByRole("button", { name: "수정", exact: true });
  await expect(edit).toBeEnabled();
  await edit.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "스킬 수정", exact: true })).toBeVisible();
  await expect(dialog.getByText(`AojiStudio/.claude/skills/${name}/SKILL.md`)).toBeVisible();
  // 읽는 동안 폼은 비활성이다 — 값이 채워질 때까지 기다린다.
  await expect(formFields(dialog).description).not.toHaveValue("");
  return dialog;
}

/** 브라우저(=이 테스트 프로세스)의 로컬 오늘 `yyyy-mm-dd`. */
function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * API 직접 호출용 변경 요청 헤더: Origin + 브라우저 토큰(`GET /api/auth/browser-token`). 변경 메서드(POST·PUT)는 토큰이 없으면 403 `UNAUTHORIZED_TOKEN`이다(architecture §5).
 */
async function mutationHeaders(request: APIRequestContext, baseUrl: string): Promise<Record<string, string>> {
  const response = await request.get(`${baseUrl}/api/auth/browser-token`, { headers: { Origin: baseUrl } });
  expect(response.status(), await response.text()).toBe(200);
  const { token } = (await response.json()) as { token: string };
  return { Origin: baseUrl, "X-AojiStudio-Browser-Token": token };
}

// ── 파일 시스템 도우미 ──────────────────────────────────────────────────────────

/** fixture 폴더 전체의 상대 경로 목록(휴지통 외 `.aojistudio`는 앱이 쓰는 상태 파일이라 뺀다). */
function mountSnapshot(): string[] {
  const root = readE2eState().fixtureDir;
  const result: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);
      // `.aojistudio/` 안은 앱이 쓰는 상태 파일이 있어 휴지통만 본다.
      if (rel.startsWith(".aojistudio") && rel !== ".aojistudio" && !rel.startsWith(join(".aojistudio", "trash"))) {
        continue;
      }
      result.push(entry.isDirectory() ? `${rel}/` : rel);
      if (entry.isDirectory()) {
        walk(full);
      }
    }
  };
  walk(root);
  return result.sort();
}

// ── zip 준비 ────────────────────────────────────────────────────────────────────

const IMPORT_SKILL_MD =
  "---\nname: e2e18b-imported\ndescription: 가져오기 시험용 외부 스킬\n---\n\n# 외부 스킬\n\n지침 본문.\n";
const IMPORT_ZIP_SOURCE_MD = "# 원래 출처\n\n- zip 안에 이미 있던 출처 메모\n";
const RUN_SH = "#!/bin/sh\necho e2e18b\n";

/** 정상 zip: 맨 위 폴더 하나 + SKILL.md + 스크립트 2개(하나는 실행 비트) + zip 안 SOURCE.md. */
function normalZipEntries(): ZipEntry[] {
  return [
    { name: "e2e18b-imported/", mode: 0o040755 },
    { name: "e2e18b-imported/SKILL.md", data: IMPORT_SKILL_MD },
    { name: "e2e18b-imported/SOURCE.md", data: IMPORT_ZIP_SOURCE_MD },
    { name: "e2e18b-imported/reference.md", data: "참고 문서\n" },
    { name: "e2e18b-imported/scripts/run.sh", data: RUN_SH, mode: 0o100755 },
    { name: "e2e18b-imported/scripts/helper.py", data: "print('e2e18b')\n" },
  ];
}

async function chooseZip(dialog: Locator, zipPath: string): Promise<void> {
  await dialog.locator('input[type="file"]').setInputFiles(zipPath);
}

test.beforeEach(async ({ page }) => {
  await gotoReady(page, "/skills");
  await expect(skillList(page)).toBeVisible();
});

test.afterAll(() => {
  for (const name of CREATED_SKILLS) {
    removeFixturePath(skillDir(name));
  }
});

// ── 08 목록 캡처 (버튼이 다 붙은 상태) ────────────────────────────────────────────

test("[FR-020-E2][E2E-18] 08 제목 줄에 `가져오기`·`스킬 만들기`, 행에 `수정`·`삭제`가 활성이고 가져온 스킬 `수정`은 비활성 사유가 보인다 → 첫 행을 펼쳐 캡처 `08-skills@1920x1080`", async ({
  page,
}) => {
  await expect(pageButton(page, "가져오기")).toBeEnabled();
  await expect(pageButton(page, "스킬 만들기")).toBeEnabled();
  await expect(page.getByText("쓰기 권한 없음", { exact: true })).toHaveCount(0);

  const normal = skillRow(page, "design-review");
  await expect(normal.getByRole("button", { name: "수정", exact: true })).toBeEnabled();
  await expect(normal.getByRole("button", { name: "삭제", exact: true })).toBeEnabled();

  // FR-018-AC5(같은 흐름): 가져온 스킬은 `수정`이 비활성이고 사유가 보인다
  const imported = skillRow(page, "imported-lint");
  await expect(imported.getByText("가져온 스킬", { exact: true })).toBeVisible();
  await expect(imported.getByRole("button", { name: "수정", exact: true })).toBeDisabled();
  await expect(imported.getByText("가져온 스킬은 수정할 수 없습니다", { exact: true })).toBeVisible();

  // 캡처: 첫 행 펼침(ui-spec 배치 12 — 08-skills)
  const firstToggle = skillList(page)
    .getByRole("listitem")
    .first()
    .getByRole("button", { name: /펼치기$/ });
  await firstToggle.click();
  await expect(skillList(page).locator('[data-wf="08-13"]').first()).toBeVisible();
  await capture(page, "08-skills", ["08-1", "08-2", "08-3", "08-5", "08-12", "08-13"]);
});

// ── 08-1 만들기 ─────────────────────────────────────────────────────────────────

test("[FR-020-AC2][FR-020-AC1][FR-020-AC5][E2E-18] 스킬 만들기 `design-token-audit`: 접두어 안내·캡처 `08-1-skill-form@1920x1080` → 저장하면 SKILL.md frontmatter 순서가 name → description → disable-model-invocation이고 본문이 붙으며 안내 줄·새 행이 보인다", async ({
  page,
}) => {
  const skill = "design-token-audit";
  const description = "디자인 토큰 사용을 점검한다";
  const body = "# 지침\n\n1. 토큰 이름을 확인한다\n2. 값 대신 토큰을 쓰는지 본다\n";
  await expect.poll(() => titleCount(page)).not.toBeNull();
  const base = (await titleCount(page)) as number;

  await pageButton(page, "스킬 만들기").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "스킬 만들기", exact: true })).toBeVisible();
  const fields = formFields(dialog);

  // FR-020-AC1: 안내 두 줄, 빈 값이면 저장 비활성
  await expect(
    dialog.getByText("소문자·숫자·하이픈, 1~64자 · 같은 이름 불가 · 만든 뒤에는 바꿀 수 없음", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("부서 접두어를 붙이세요 — 예: design-, web-, invest-, video-", { exact: true }),
  ).toBeVisible();
  await expect(fields.save).toBeDisabled();

  await fields.name.fill(skill);
  await expect(dialog.getByText(`AojiStudio/.claude/skills/${skill}/SKILL.md`)).toBeVisible();
  await choose(fields.userOnly);
  await fields.description.fill(description);
  await fields.body.fill(body);
  await expect(fields.save).toBeEnabled();

  // 캡처(ui-spec 배치 12 순서 1 — 저장 전)
  await capture(page, "08-1-skill-form", ["08-1-1", "08-1-2", "08-1-3", "08-1-4", "08-1-5", "08-1-6"]);

  await fields.save.click();
  await expect(dialog).toHaveCount(0);

  // FR-020-AC2: 새 행 + 스킬 수 증가 + 사용자 전용 칩
  const row = skillRow(page, skill);
  await expect(row).toHaveCount(1);
  await expect(row.getByText("사용자 전용", { exact: true })).toBeVisible();
  await expect.poll(() => titleCount(page)).toBe(base + 1);
  // FR-020-AC5: 저장 직후 안내 줄
  await expect(page.locator('[data-wf="08-4"]')).toContainText(SAVE_NOTICE);

  // 파일: frontmatter 순서와 본문
  const content = readFixtureFile(skillFile(skill));
  const { lines, body: savedBody } = splitSkillMd(content);
  const keys = lines.map((line) => /^([A-Za-z-]+):/.exec(line)?.[1]);
  expect(keys, `frontmatter 줄: ${JSON.stringify(lines)}`).toEqual(["name", "description", "disable-model-invocation"]);
  expect(lines[0]).toBe(`name: ${skill}`);
  expect(lines[1]).toContain(description);
  expect(lines[2]).toBe("disable-model-invocation: true");
  expect(savedBody.trim()).toBe(body.trim());
});

// ── 08-1 수정: 폼에 없는 줄·본문 보존 ──────────────────────────────────────────────

test("[FR-020-AC3][E2E-18] 스킬 수정: 이름은 고정 글자이고, 설명·`사용자만 호출`만 바꿔 저장해도 폼에 없는 frontmatter 줄의 값·순서와 본문 바이트·같은 폴더 다른 파일이 그대로다", async ({
  page,
}) => {
  const skill = "e2e18b-keep";
  const frontmatter = [
    `name: ${skill}`,
    "allowed-tools: Read, Grep",
    "description: 원래 설명",
    "model: sonnet",
    "disable-model-invocation: false",
    'argument-hint: "[대상]"',
  ];
  const body = "\n# 지침\n\n  - 들여쓴 줄  \n\t탭으로 시작하는 줄\n\n\n끝 줄 (개행 없음)";
  writeFixtureFile(skillFile(skill), `---\n${frontmatter.join("\n")}\n---\n${body}`);
  const notes = join(skillDir(skill), "notes.txt");
  writeFixtureFile(notes, "같은 폴더의 다른 파일\n");
  const notesBefore = readFixtureFile(notes);
  await expect(skillRow(page, skill)).toHaveCount(1);

  const dialog = await openEdit(page, skill);
  const fields = formFields(dialog);
  // 수정에서는 이름이 입력이 아니라 고정 글자다
  await expect(dialog.getByText(skill, { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("이름(폴더 이름)은 바꿀 수 없습니다", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /^이름/ })).toHaveCount(0);
  await expect(dialog.getByText("폼에 없는 frontmatter 항목(allowed-tools 등)은 값과 순서를 그대로 둡니다")).toBeVisible();
  await expect(fields.description).toHaveValue("원래 설명");
  await expect(fields.userOnly).not.toBeChecked();

  // ① 설명만 바꿔 저장 — 나머지 줄·순서와 본문 바이트는 그대로, `disable-model-invocation: false` 줄도 그대로
  await fields.description.fill("고친 설명");
  await fields.save.click();
  await expect(dialog).toHaveCount(0);
  let saved = splitSkillMd(readFixtureFile(skillFile(skill)));
  expect(saved.body).toBe(body);
  expect(saved.lines.filter((line) => !line.startsWith("description:"))).toEqual(
    frontmatter.filter((line) => !line.startsWith("description:")),
  );
  const descriptionLines = saved.lines.filter((line) => line.startsWith("description:"));
  expect(descriptionLines).toHaveLength(1);
  expect(descriptionLines[0]).toContain("고친 설명");
  expect(saved.lines.indexOf(descriptionLines[0] as string)).toBe(2);

  // ② `사용자만 호출`을 켜고 저장 — 폼 키 외의 줄은 여전히 값·순서 그대로
  const dialog2 = await openEdit(page, skill);
  await expect(formFields(dialog2).description).toHaveValue("고친 설명");
  await choose(formFields(dialog2).userOnly);
  await formFields(dialog2).save.click();
  await expect(dialog2).toHaveCount(0);
  saved = splitSkillMd(readFixtureFile(skillFile(skill)));
  expect(saved.body).toBe(body);
  const formKeys = (line: string) => line.startsWith("description:") || line.startsWith("disable-model-invocation:");
  expect(saved.lines.filter((line) => !formKeys(line))).toEqual(frontmatter.filter((line) => !formKeys(line)));
  expect(saved.lines.filter((line) => line === "disable-model-invocation: true")).toHaveLength(1);
  expect(saved.lines.some((line) => line === "disable-model-invocation: false")).toBe(false);

  // 같은 폴더의 다른 파일은 건드리지 않는다
  expect(readFixtureFile(notes)).toBe(notesBefore);
});

// ── 08-4 충돌 ───────────────────────────────────────────────────────────────────

test("[FR-020-AC4][E2E-18] 08-4 충돌: 폼을 연 뒤 밖에서 SKILL.md가 바뀌면 저장 시 08-4(캡처 `08-4-skill-conflict@1920x1080`) → `최신 파일 다시 불러오기`는 파일을 쓰지 않고 폼을 새로 채우고, `덮어쓰기`는 폼 내용으로 저장한다", async ({
  page,
}) => {
  const skill = "e2e18b-conflict";
  const original = `---\nname: ${skill}\ndescription: 충돌 시험 처음 설명\n---\n\n처음 본문.\n`;
  writeFixtureFile(skillFile(skill), original);
  await expect(skillRow(page, skill)).toHaveCount(1);

  // ① 최신 파일 다시 불러오기
  const hostFirst = `${original}밖에서 덧붙인 첫 줄.\n`;
  let dialog = await openEdit(page, skill);
  await expect(formFields(dialog).body).toHaveValue(/처음 본문/);
  writeFixtureFile(skillFile(skill), hostFirst);
  await formFields(dialog).save.click();

  const conflict = page.getByRole("alertdialog");
  await expect(conflict.getByRole("heading", { name: "파일이 다른 곳에서 수정되었습니다", exact: true })).toBeVisible();
  await expect(conflict).toContainText(`${skill}/SKILL.md`);
  await expect(conflict).toContainText("덮어쓰면 그 변경이 사라집니다");
  await capture(page, "08-4-skill-conflict", ["08-4-1", "08-4-2"]);

  await conflict.getByRole("button", { name: "최신 파일 다시 불러오기", exact: true }).click();
  await expect(conflict).toHaveCount(0);
  // 폼은 열린 채로 최신 내용으로 다시 채워지고, 파일은 우리가 쓰지 않았다
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(formFields(page.getByRole("dialog")).body).toHaveValue(/밖에서 덧붙인 첫 줄/);
  expect(readFixtureFile(skillFile(skill))).toBe(hostFirst);
  await page.getByRole("dialog").getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(readFixtureFile(skillFile(skill))).toBe(hostFirst);

  // ② 덮어쓰기
  dialog = await openEdit(page, skill);
  await formFields(dialog).description.fill("덮어쓴 설명");
  writeFixtureFile(skillFile(skill), `${hostFirst}밖에서 덧붙인 둘째 줄.\n`);
  await formFields(dialog).save.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "덮어쓰기", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const saved = readFixtureFile(skillFile(skill));
  expect(saved).toContain("덮어쓴 설명");
  expect(saved).toContain("밖에서 덧붙인 첫 줄"); // 폼이 다시 불러온 내용은 남는다
  expect(saved).not.toContain("밖에서 덧붙인 둘째 줄"); // 덮어쓰기로 사라진 밖의 변경
});

// ── 가져온 스킬 수정 거부 (API 직접) ───────────────────────────────────────────────

test("[FR-020-AC6][E2E-18] 가져온 스킬(`imported-lint`, SOURCE.md 있음)에 API로 직접 PUT 하면 409 `IMPORTED_SKILL` `가져온 스킬은 수정할 수 없습니다`이고 파일은 그대로다", async ({
  request,
}) => {
  const state = readE2eState();
  const headers = { ...(await mutationHeaders(request, state.baseUrl)), "Content-Type": "application/json" };
  const skill = "imported-lint";
  const before = readFixtureFile(skillFile(skill));

  const detail = await request.get(`${state.baseUrl}/api/skills/${skill}`, { headers: { Origin: state.baseUrl } });
  expect(detail.status()).toBe(200);
  const current = (await detail.json()) as { imported: boolean; revision: string; description: string; userOnly: boolean; body: string };
  expect(current.imported).toBe(true);

  const response = await request.put(`${state.baseUrl}/api/skills/${skill}`, {
    headers,
    data: {
      description: "웹에서 고치려는 설명",
      userOnly: current.userOnly,
      body: current.body,
      expectedRevision: current.revision,
    },
  });
  expect(response.status()).toBe(409);
  const error = (await response.json()) as { code: string; message: string };
  expect(error.code).toBe("IMPORTED_SKILL");
  expect(error.message).toBe("가져온 스킬은 수정할 수 없습니다");

  // force로도 뚫리지 않는다
  const forced = await request.put(`${state.baseUrl}/api/skills/${skill}`, {
    headers,
    data: {
      description: "강제로 고치려는 설명",
      userOnly: current.userOnly,
      body: current.body,
      expectedRevision: current.revision,
      force: true,
    },
  });
  expect(forced.status()).toBe(409);
  expect(((await forced.json()) as { code: string }).code).toBe("IMPORTED_SKILL");

  expect(readFixtureFile(skillFile(skill))).toBe(before);
});

// ── 08-2 가져오기 ───────────────────────────────────────────────────────────────

test("[FR-021-AC4][E2E-18] 08-2: 정상 zip(스크립트 2개)을 고르면 미리보기·`스크립트`/`실행 파일` 칩·경고 상자가 보이고 출처를 넣은 뒤 캡처 `08-2-skill-import@1920x1080` → `취소`하면 아무것도 쓰지 않는다", async ({
  page,
}, testInfo) => {
  const zipPath = testInfo.outputPath("e2e18b-imported.zip");
  writeZip(zipPath, normalZipEntries());
  const before = mountSnapshot();

  await pageButton(page, "가져오기").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "스킬 가져오기", exact: true })).toBeVisible();
  const importButton = dialog.getByRole("button", { name: "가져오기", exact: true });
  await expect(importButton).toBeDisabled();
  await expect(dialog.getByText("zip 파일을 먼저 고르세요", { exact: true })).toBeVisible();

  await chooseZip(dialog, zipPath);
  const preview = dialog.locator('[data-wf="08-2-3"]');
  await expect(preview).toContainText("e2e18b-imported");
  await expect(preview).toContainText("가져오기 시험용 외부 스킬");
  await expect(preview).toContainText("파일 5개");
  await expect(preview).toContainText("스크립트 2개");
  await expect(preview.getByText("scripts/run.sh", { exact: true })).toBeVisible();
  await expect(preview.getByText("scripts/helper.py", { exact: true })).toBeVisible();
  await expect(preview.getByText("스크립트", { exact: true })).toHaveCount(2);
  await expect(preview.getByText("실행 파일", { exact: true })).toHaveCount(1);
  const warning = dialog.locator('[data-wf="08-2-4"]');
  await expect(warning).toContainText("Claude가 이 스킬을 쓸 때 스크립트를 실행할 수 있습니다");
  await expect(warning).toContainText("가져오기 전에 scripts/ 내용을 확인하세요");
  await expect(dialog.getByText(today())).toBeVisible();

  const source = dialog.locator('[data-wf="08-2-5"]');
  await source.getByRole("textbox", { name: /^출처/ }).fill("https://example.test/aoji-fixture/e2e18b-imported");
  await source.getByRole("textbox", { name: /^커밋/ }).fill("1a2b3c4");
  await source.getByRole("textbox", { name: /^라이선스/ }).fill("MIT");
  await expect(importButton).toBeEnabled();

  await capture(page, "08-2-skill-import", ["08-2-1", "08-2-2", "08-2-3", "08-2-4", "08-2-5", "08-2-6"]);

  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixturePathExists(skillDir("e2e18b-imported"))).toBe(false);
  expect(mountSnapshot()).toEqual(before);
});

test("[FR-021-AC1][FR-021-AC4][FR-021-AC5][FR-021-AC6][E2E-18] 정상 zip 가져오기: 폴더·파일이 그대로 들어가고 SOURCE.md는 zip 안 내용 뒤에 출처·커밋·라이선스·가져온 날짜가 덧붙으며 08에 `가져온 스킬` 칩 행이 생기고 `수정`은 비활성이다", async ({
  page,
}, testInfo) => {
  const skill = "e2e18b-imported";
  const zipPath = testInfo.outputPath("e2e18b-imported.zip");
  writeZip(zipPath, normalZipEntries());
  await expect.poll(() => titleCount(page)).not.toBeNull();
  const base = (await titleCount(page)) as number;
  const when = today();

  await pageButton(page, "가져오기").click();
  const dialog = page.getByRole("dialog");
  await chooseZip(dialog, zipPath);
  await expect(dialog.locator('[data-wf="08-2-3"]')).toContainText(skill);
  const source = dialog.locator('[data-wf="08-2-5"]');
  await source.getByRole("textbox", { name: /^출처/ }).fill("https://example.test/aoji-fixture/e2e18b-imported");
  await source.getByRole("textbox", { name: /^커밋/ }).fill("1a2b3c4");
  await source.getByRole("textbox", { name: /^라이선스/ }).fill("MIT");
  await dialog.getByRole("button", { name: "가져오기", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // 08: 새 행 + `가져온 스킬` 칩 + 안내 줄 + 스킬 수
  const row = skillRow(page, skill);
  await expect(row).toHaveCount(1);
  await expect(row.getByText("가져온 스킬", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "수정", exact: true })).toBeDisabled();
  await expect(row.getByRole("button", { name: "삭제", exact: true })).toBeEnabled();
  await expect.poll(() => titleCount(page)).toBe(base + 1);
  await expect(page.locator('[data-wf="08-4"]')).toContainText(SAVE_NOTICE);

  // 폴더·파일 (FR-021-AC1)
  expect(readFixtureFile(skillFile(skill))).toBe(IMPORT_SKILL_MD);
  expect(readFixtureFile(join(skillDir(skill), "scripts", "run.sh"))).toBe(RUN_SH);
  expect(readFixtureFile(join(skillDir(skill), "scripts", "helper.py"))).toBe("print('e2e18b')\n");
  expect(readFixtureFile(join(skillDir(skill), "reference.md"))).toBe("참고 문서\n");

  // SOURCE.md (FR-021-AC5): zip 안 내용이 먼저, 그 뒤에 이 기록
  const sourceMd = readFixtureFile(join(skillDir(skill), "SOURCE.md"));
  expect(sourceMd.startsWith(IMPORT_ZIP_SOURCE_MD)).toBe(true);
  const appended = sourceMd.slice(IMPORT_ZIP_SOURCE_MD.length);
  expect(appended).toContain("https://example.test/aoji-fixture/e2e18b-imported");
  expect(appended).toContain("1a2b3c4");
  expect(appended).toContain("MIT");
  expect(appended).toContain(when);

  // FR-021-AC6: 임시 폴더가 남지 않는다
  expect(mountSnapshot().filter((entry) => /\.import-|\.tmp/.test(entry))).toEqual([]);
});

test("[FR-021-AC1][E2E-18] 이름 정하기: 맨 위에 SKILL.md가 있으면 frontmatter `name`, `name`이 없으면 맨 위 폴더 이름 (미리보기 API, 마운트는 그대로)", async ({
  request,
}, testInfo) => {
  const state = readE2eState();
  const before = mountSnapshot();
  const preview = async (zipName: string, entries: ZipEntry[]) => {
    const zipPath = testInfo.outputPath(zipName);
    const content = writeZip(zipPath, entries);
    const response = await request.post(`${state.baseUrl}/api/skills/import/preview`, {
      headers: await mutationHeaders(request, state.baseUrl),
      multipart: { file: { name: zipName, mimeType: "application/zip", buffer: content } },
    });
    expect(response.status(), await response.text()).toBe(200);
    return (await response.json()) as { name: string; description: string; fileCount: number; scriptCount: number };
  };

  // ① 맨 위에 SKILL.md
  const top = await preview("top.zip", [
    { name: "SKILL.md", data: "---\nname: e2e18b-top\ndescription: 맨 위 SKILL.md\n---\n\n본문\n" },
    { name: "notes.md", data: "메모\n" },
  ]);
  expect(top.name).toBe("e2e18b-top");
  expect(top.fileCount).toBe(2);
  expect(top.scriptCount).toBe(0);

  // ② 맨 위 폴더 하나 + frontmatter에 name 없음 → 폴더 이름
  const nameless = await preview("nameless.zip", [
    { name: "e2e18b-nameless/SKILL.md", data: "---\ndescription: 이름 없는 frontmatter\n---\n\n본문\n" },
  ]);
  expect(nameless.name).toBe("e2e18b-nameless");

  expect(mountSnapshot()).toEqual(before);
});

// ── 위험 zip 4종 거부 + 마운트에 남은 것 0 ──────────────────────────────────────────

interface DangerousZip {
  title: string;
  zipName: string;
  entries: ZipEntry[];
  reason: string;
  messages: string[];
}

const GOOD_SKILL_MD = (name: string) => `---\nname: ${name}\ndescription: 위험 zip 시험\n---\n\n본문\n`;
const OVERSIZE_BYTES = 10 * 1024 * 1024 + 1024;

const DANGEROUS_ZIPS: DangerousZip[] = [
  {
    title: "경로 이탈(`..`)",
    zipName: "traversal.zip",
    entries: [
      { name: "e2e18b-evil/SKILL.md", data: GOOD_SKILL_MD("e2e18b-evil") },
      { name: "e2e18b-evil/../../escape-e2e18b.txt", data: "밖으로 나가려는 파일\n" },
    ],
    reason: "PATH_TRAVERSAL",
    messages: ["가져올 수 없는 항목이 있습니다", "경로 이탈"],
  },
  {
    title: "심볼릭 링크",
    zipName: "symlink.zip",
    entries: [
      { name: "e2e18b-link/SKILL.md", data: GOOD_SKILL_MD("e2e18b-link") },
      { name: "e2e18b-link/passwd-link", data: "/etc/passwd", mode: 0o120777 },
    ],
    reason: "SYMLINK",
    messages: ["가져올 수 없는 항목이 있습니다", "심볼릭 링크"],
  },
  {
    title: "크기 초과(10MB)",
    zipName: "oversize.zip",
    entries: [
      { name: "e2e18b-big/SKILL.md", data: GOOD_SKILL_MD("e2e18b-big") },
      { name: "e2e18b-big/blob.bin", data: Buffer.alloc(OVERSIZE_BYTES, 7), store: true },
    ],
    reason: "TOO_LARGE",
    messages: ["zip이 10MB를 넘습니다"],
  },
  {
    title: "SKILL.md 없음",
    zipName: "no-skill-md.zip",
    entries: [
      { name: "e2e18b-empty/README.md", data: "SKILL.md가 없는 폴더\n" },
      { name: "e2e18b-empty/notes.md", data: "메모\n" },
    ],
    reason: "NO_SKILL_MD",
    messages: ["맨 위나 맨 위 폴더 하나 안에 SKILL.md가 없습니다"],
  },
];

for (const dangerous of DANGEROUS_ZIPS) {
  test(`[FR-021-E1][FR-021-E2][FR-021-AC3][FR-021-AC2][E2E-18] 위험 zip 거부 — ${dangerous.title}: 08-2 \`Alert\`에 사유, 미리보기 없음, \`가져오기\` 비활성, 400 \`IMPORT_REJECTED\`(${dangerous.reason}), 마운트에 남은 것 0`, async ({
    page,
    request,
  }, testInfo) => {
    const state = readE2eState();
    const zipPath = testInfo.outputPath(dangerous.zipName);
    const content = writeZip(zipPath, dangerous.entries);
    const mountBefore = mountSnapshot();

    // API: 400 IMPORT_REJECTED + details.reason (ADR-93)
    const response = await request.post(`${state.baseUrl}/api/skills/import/preview`, {
      headers: await mutationHeaders(request, state.baseUrl),
      multipart: { file: { name: dangerous.zipName, mimeType: "application/zip", buffer: content } },
    });
    expect(response.status(), await response.text()).toBe(400);
    const error = (await response.json()) as { code: string; message: string; details?: { reason?: string } };
    expect(error.code).toBe("IMPORT_REJECTED");
    expect(error.details?.reason).toBe(dangerous.reason);
    expect(mountSnapshot()).toEqual(mountBefore);

    // 화면: 같은 zip을 08-2에서 고른다
    await pageButton(page, "가져오기").click();
    const dialog = page.getByRole("dialog");
    await chooseZip(dialog, zipPath);
    for (const message of dangerous.messages) {
      await expect(dialog).toContainText(message);
    }
    await expect(dialog.locator('[data-wf="08-2-3"]').getByText("파일 목록", { exact: true })).toHaveCount(0);
    await expect(dialog.locator('[data-wf="08-2-4"]')).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "가져오기", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // 마운트에 남은 것 0: 스킬 폴더·임시 폴더·밖으로 나간 파일이 없고 크기도 그대로다
    expect(mountSnapshot()).toEqual(mountBefore);
    expect(fixturePathExists(fixturePath("escape-e2e18b.txt"))).toBe(false);
    expect(fixturePathExists(fixturePath(".claude", "escape-e2e18b.txt"))).toBe(false);
    expect(fixturePathExists(join(trashDir(), "escape-e2e18b.txt"))).toBe(false);
  });
}
