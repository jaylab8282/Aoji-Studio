// E2E-06 04-5·04-6 (architecture.md §8.2 E2E-06 행).
// 검증 ID: FR-001-AC4·E1, FR-002-AC1~AC6, FR-006-E1·E2, FR-011-E3, ADR-42.
//
// 이 시나리오는 fixture 두 개를 쓴다. spec 파일이 fixture를 고를 수는 없으므로 실행 단위를
// `test.describe` 두 개로 나누고 playwright 실행을 나눠 돌린다(`test.skip()`을 쓰지 않는다):
//   E2E_FIXTURE=project-no-agents-dir npx playwright test tests/e2e-06.spec.ts --grep "project-no-agents-dir"
//   E2E_FIXTURE=project-format-errors npx playwright test tests/e2e-06.spec.ts --grep "project-format-errors"
// `scripts/run-e2e.sh`가 두 배치를 순서대로 돌린다. fixture가 어긋나면 `beforeAll`이 바로 실패한다.
// 목킹 없음: 실제 컨테이너와 fixture 임시 사본의 파일 변경만 쓴다(conventions.md §8).
import { existsSync, mkdirSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
import {
  SETUP_REFLECT_TIMEOUT_MS,
  agentFile,
  fixturePath,
  gotoReady,
  removeFixturePath,
  writeFixtureFile,
} from "./ui-helpers";

/** FR-001-AC4 "`다시 읽기`를 누르면 즉시 다시 읽고 1초 이내에 응답한다". */
const RESCAN_DEADLINE_MS = 1000;

/** 이 describe가 전제하는 fixture인지 확인한다(상태 파일은 테스트 실행 중에만 읽는다). */
function assertFixture(expected: string): void {
  const state = readE2eState();
  expect(
    state.fixtureName,
    `이 실행 단위는 fixture \`${expected}\`로 돌려야 합니다(E2E_FIXTURE 확인).`,
  ).toBe(expected);
}

test.describe("[E2E-06] project-no-agents-dir — 04-5 에이전트 폴더 읽기 실패", () => {
  test.beforeAll(() => {
    assertFixture("project-no-agents-dir");
  });

  test("[FR-001-E1][E2E-06] 01 KPI 1·2 자리가 04-5로 바뀌고 `다시 읽기`·`설정 열기`가 있다", async ({
    page,
  }) => {
    const hostPath = readE2eState().fixtureDir;
    await gotoReady(page, "/");
    const body = page.locator("main").first();

    await expect(body.getByText("에이전트 폴더를 찾을 수 없습니다", { exact: true })).toBeVisible();
    await expect(body.getByText(`${hostPath}/.claude/agents`, { exact: true })).toBeVisible();
    await expect(
      body.getByText("컨테이너 실행 시 마운트한 폴더에 .claude가 있는지 확인하세요.", { exact: true }),
    ).toBeVisible();
    await expect(
      body.getByText("쓰기 권한이 없으면 추가·수정·삭제 버튼은 비활성.", { exact: true }),
    ).toBeVisible();
    // ADR-42: 01·02의 04-5에는 `설정 열기`가 있다.
    await expect(body.getByRole("button", { name: "다시 읽기", exact: true })).toBeEnabled();
    await expect(body.getByRole("button", { name: "설정 열기", exact: true })).toBeEnabled();

    // KPI 1·2 자리가 04-5로 대체되고 에이전트 수는 표시하지 않는다(FR-001-E1).
    await expect(body.getByText("실행 중 에이전트", { exact: true })).toHaveCount(0);
    await expect(body.getByText("에이전트 수", { exact: true })).toHaveCount(0);
    // 스킬 수·수집 상태 KPI는 그대로다. 상태 막대는 숨긴다.
    await expect(body.getByText("스킬 수", { exact: true })).toBeVisible();
    await expect(body.getByText("수집 상태", { exact: true })).toBeVisible();
    await expect(body.getByText("에이전트 상태", { exact: true })).toHaveCount(0);
  });

  test("[FR-006-E1][E2E-06] 02 층 그리드 자리가 04-5로 바뀌고 요약 줄의 에이전트 수는 `-`다", async ({
    page,
  }) => {
    await gotoReady(page, "/workflows");
    const body = page.locator("main").first();

    await expect(body.getByText("에이전트 폴더를 찾을 수 없습니다", { exact: true })).toBeVisible();
    await expect(body.getByText("에이전트 - · 스킬 0 · 워크플로우 0", { exact: true })).toBeVisible();
    await expect(body.getByRole("button", { name: "다시 읽기", exact: true })).toBeEnabled();
    await expect(body.getByRole("button", { name: "설정 열기", exact: true })).toBeEnabled();
    // 04-7(워크플로우 0개) 대신 04-5가 그려진다.
    await expect(body.getByText("아직 워크플로우가 없습니다", { exact: true })).toHaveCount(0);
  });

  test("[FR-001-E1][E2E-06] 07 프로젝트 폴더 카드 본문이 04-5로 바뀌고 `설정 열기`는 그리지 않는다(ADR-42)", async ({
    page,
  }) => {
    const hostPath = readE2eState().fixtureDir;
    await gotoReady(page, "/settings");
    const body = page.locator("main").first();

    await expect(body.getByText("에이전트 폴더를 찾을 수 없습니다", { exact: true })).toBeVisible();
    await expect(body.getByText(`${hostPath}/.claude/agents`, { exact: true })).toBeVisible();
    await expect(body.getByRole("button", { name: "다시 읽기", exact: true }).first()).toBeEnabled();
    // ADR-42: 07의 04-5에는 `설정 열기`가 없다.
    await expect(body.getByRole("button", { name: "설정 열기", exact: true })).toHaveCount(0);
    // 카드 1 본문이 대체되므로 값 행도 보이지 않는다.
    await expect(body.getByText("마운트 폴더", { exact: true })).toHaveCount(0);
  });

  test("[FR-001-AC4][E2E-06] `.claude/agents`를 만든 뒤 `다시 읽기` → 1초 이내에 04-5가 사라지고 에이전트 수가 나온다", async ({
    page,
  }, testInfo) => {
    await gotoReady(page, "/");
    await expect(page.getByText("에이전트 폴더를 찾을 수 없습니다", { exact: true })).toBeVisible();

    // 폴더와 정의 파일을 바깥에서 만든다. 폴링(2초)이 아니라 `다시 읽기`로 즉시 반영되는지를 본다.
    mkdirSync(fixturePath(".claude", "agents"), { recursive: true });
    writeFixtureFile(
      agentFile("e2e06-recovered"),
      "---\nname: e2e06-recovered\ndescription: 다시 읽기 확인\n---\n\n본문.\n",
    );

    const startedAt = Date.now();
    await page.getByRole("button", { name: "다시 읽기", exact: true }).click();
    await expect(page.getByText("에이전트 수", { exact: true })).toBeVisible({
      timeout: RESCAN_DEADLINE_MS,
    });
    const elapsedMs = Date.now() - startedAt;
    testInfo.annotations.push({
      type: "FR-001-AC4 다시 읽기 응답 시간",
      description: `${elapsedMs}ms (기한 ${RESCAN_DEADLINE_MS}ms)`,
    });
    expect(elapsedMs).toBeLessThanOrEqual(RESCAN_DEADLINE_MS);

    await expect(page.getByText("에이전트 폴더를 찾을 수 없습니다", { exact: true })).toHaveCount(0);
    const body = page.locator("main").first();
    await expect(body.getByText("실행 중 에이전트", { exact: true })).toBeVisible();
    await expect(body.getByText("에이전트 수", { exact: true }).locator("xpath=..")).toContainText("1");
  });
});

test.describe("[E2E-06] project-format-errors — 04-6 정의 파일 형식 오류", () => {
  /** FR-002-AC1의 5종 + AC5 깨진 참조 + AC6 구성 파일 오류. 02 04-6 목록의 확정 표시 순서다. */
  const FORMAT_ERROR_ROWS = [
    "Invalid-Name.md · name 형식 위반",
    "bad-utf8.md · UTF-8 인코딩 오류",
    "broken-frontmatter.md · frontmatter 형식 오류",
    "dup-one.md · name 중복 (.claude/agents/dup-two.md)",
    "dup-two.md · name 중복 (.claude/agents/dup-one.md)",
    "missing-name.md · name 누락",
    "no-such-agent · 구성 파일 참조 깨짐 (broken-ref)",
    "malformed-json.json · 구성 파일 형식 오류",
    "schema-error.json · 구성 파일 형식 오류",
  ];

  test.beforeAll(() => {
    assertFixture("project-format-errors");
  });

  test("[FR-002-AC1][FR-002-AC2][FR-002-AC5][FR-002-AC6][FR-006-E2][E2E-06] 02 04-6 목록에 5종 오류 + 깨진 참조 + 구성 파일 오류가 사유와 함께 나온다", async ({
    page,
  }) => {
    await gotoReady(page, "/workflows");
    const body = page.locator("main").first();

    await expect(body.getByText("읽지 못한 정의 파일 9개", { exact: true })).toBeVisible();
    const rows = body.locator("li").filter({ hasText: "·" });
    await expect(rows).toHaveText(FORMAT_ERROR_ROWS);
    await expect(
      body.getByText("오류 파일은 층에 표시하지 않고 목록만 표시 · 수정은 에디터에서", { exact: true }),
    ).toBeVisible();
    await expect(body.getByText("정상 파일은 수정 팝업에서 편집 →", { exact: true })).toBeVisible();

    // FR-002-AC2·AC5·AC6: 오류 파일·깨진 참조는 에이전트 수와 층에서 제외된다.
    await expect(body.getByText("에이전트 2 · 스킬 0 · 워크플로우 3", { exact: true })).toBeVisible();
    await expect(body.getByRole("img", { name: "no-such-agent", exact: true })).toHaveCount(0);
    await expect(body.getByRole("img", { name: "duplicate-agent", exact: true })).toHaveCount(0);
    // 구성 파일 자체가 깨진 워크플로우는 층에 올리지 않는다(FR-002-AC6).
    await expect(body.getByRole("heading", { level: 3, name: "malformed-json" })).toHaveCount(0);
    await expect(body.getByRole("heading", { level: 3, name: "schema-error" })).toHaveCount(0);
    // 정상 파일은 층에 있다.
    await expect(body.getByRole("img", { name: "valid-agent", exact: true })).toBeVisible();
  });

  test("[FR-002-AC3][FR-011-E3][E2E-06] 형식 오류 파일 수정 시도 → 06을 열지 않고 02의 04-6 목록으로 돌아온다", async ({
    page,
  }) => {
    await gotoReady(page, "/workflows?dialog=agent-edit&agent=missing-name");

    // 06 폼은 열리지 않고 `?dialog`가 사라진 02로 대체된다(FR-011-E3, ADR-14).
    await expect(page.getByTestId("agent-form-dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/workflows$/);
    await expect(page.getByText("읽지 못한 정의 파일 9개", { exact: true })).toBeVisible();
    await expect(page.getByText("missing-name.md · name 누락", { exact: true })).toBeVisible();
  });

  test("[FR-002-AC4][E2E-06] description이 없는 정의 파일은 형식 오류가 아니라 정상 파일이고 설명이 비어 보인다", async ({
    page,
  }) => {
    const agent = "e2e06-no-description";
    await gotoReady(page, "/workflows");
    await expect(page.getByText("읽지 못한 정의 파일 9개", { exact: true })).toBeVisible();

    try {
      writeFixtureFile(agentFile(agent), `---\nname: ${agent}\n---\n\ndescription 없는 정상 파일.\n`);
      // 정상 파일로 집계되어 에이전트 수가 늘고 04-6 목록은 그대로 9개다.
      await expect(page.getByText("에이전트 3 · 스킬 0 · 워크플로우 3", { exact: true })).toBeVisible({
        timeout: SETUP_REFLECT_TIMEOUT_MS,
      });
      await expect(page.getByText("읽지 못한 정의 파일 9개", { exact: true })).toBeVisible();
      await expect(page.getByText(`${agent}.md`, { exact: false })).toHaveCount(0);

      // 05-R 가져오기 목록(워크플로우 밖 에이전트)에서 설명 칸이 비어 있다.
      await page.getByRole("button", { name: "워크플로우 밖 에이전트 1 · 가져오기", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator("tbody tr td:nth-child(2)")).toHaveText([agent]);
      await expect(dialog.locator("tbody tr td:nth-child(3)")).toHaveText([""]);
    } finally {
      removeFixturePath(agentFile(agent));
      expect(existsSync(agentFile(agent))).toBe(false);
    }
  });
});
