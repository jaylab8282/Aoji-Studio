// E2E-13 배치 8 순서 10~14 — 상태를 바꾸는 캡처·실측 단계 (ui-spec "배치별 캡처 순서").
//
// 이 파일은 `e2e-13.spec.ts`(순서 1~8)와 `e2e-16.spec.ts`(순서 9, E2E-16) **뒤에** 돌아야 한다. 순서 11은
// `web-reviewer.md`를 바꾸고, 순서 12는 워크플로우 밖 5명을 모두 `투자부서`로 옮기며, 순서 14는 live 상태를 바꾼다.
// 파일 이름을 `e2e-16z-…`로 해서 파일 이름순 실행에서 `e2e-16.spec.ts` 다음이 되게 했다(Playwright는 workers=1에서
// 파일을 이름순으로 돌린다 — run-e2e.sh 배치 8 주석 참고). fixture가 다르면 `beforeAll`이 바로 실패한다.
//
//   E2E_FIXTURE=project-showcase npx playwright test tests/e2e-13.spec.ts tests/e2e-16.spec.ts tests/e2e-16z-e2e13-state-changes.spec.ts --grep "project-showcase"
//
// 목킹 없음: 실제 컨테이너·재생 도구·fixture 파일만 쓴다(conventions.md §8).
import { expect, test } from "@playwright/test";

import { SCENARIOS_DIR, replayScenarioLines, scenarioLines } from "../lib/replay";
import { COLUMN_PITCH, STATUS_LINE_PATTERN, assertSuffixPair, deskMetrics, round2, statusOverlaps, waitForSuffix } from "./desk-metrics";
import {
  captureBaseSizes,
  expectDialogWidth,
  expectRegionsVisible,
  sizeLabel,
} from "./screen-helpers";
import { DEV, OUTSIDE_COUNT, assertFixture, fetchLive } from "./showcase-helpers";
import {
  SETUP_REFLECT_TIMEOUT_MS,
  agentFile,
  agentFileContent,
  choose,
  fixturePath,
  floorHeader,
  gotoReady,
  listFixtureDir,
  readFixtureFile,
  removeFixturePath,
  spriteBox,
  spriteSvg,
  teamFile,
  writeFixtureFile,
} from "./ui-helpers";
import { join } from "node:path";

const SPAN1_CLAMP_SCENARIO = join(SCENARIOS_DIR, "span1-status-clamp.jsonl");
/** `scenarios/README.md` span1-status-clamp 대응표의 줄 수. */
const SPAN1_CLAMP_LINE_COUNT = 7;
const DESIGN = "디자인부서";
const REVIEWER = "web-reviewer";
const EDIT_FORM_PATH = `/workflows/${encodeURIComponent(DEV)}?dialog=agent-edit&agent=${REVIEWER}`;

test.describe("[E2E-13] project-showcase 배치 8 순서 10~14 — 상태를 바꾸는 캡처·실측", () => {
  test.use({ reducedMotion: "reduce" });
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    assertFixture("project-showcase");
    // e2e-13(순서 1~8)이 showcase.jsonl을 재생한 뒤의 상태여야 한다(`web-reviewer`는 실제 idle).
    const live = await fetchLive(request);
    expect(live.agents[REVIEWER]?.status, "e2e-13.spec.ts(순서 1~8)를 먼저 돌려야 합니다").toBe("idle");
    expect(live.agents["design-lead"]?.status, "e2e-13.spec.ts(순서 1~8)를 먼저 돌려야 합니다").toBe("running");
  });

  test("[E2E-13][FR-012-AC1][NFR-11] 순서 10 — 06-6-agent-remove: 06(web-reviewer 수정) → `워크플로우에서 제거` → 캡처(이름 입력 전) → 취소 두 번", async ({
    page,
  }) => {
    const before = readFixtureFile(agentFile(REVIEWER));
    await gotoReady(page, EDIT_FORM_PATH);
    const form = page.locator('[data-wf="06-1"]');
    await expect(form.getByLabel("이름 (name)", { exact: true })).toHaveValue(REVIEWER);

    await form.getByRole("button", { name: "워크플로우에서 제거", exact: true }).click();
    const dialog = page.locator('[data-wf="06-6-1"]');
    await expect(dialog.getByRole("heading", { name: `${REVIEWER}을(를) ${DEV}에서 제거할까요?`, exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "제거", exact: true })).toBeDisabled();
    await expect(dialog.getByText(`${REVIEWER}을(를) 똑같이 입력하면 제거 버튼이 켜집니다`, { exact: true })).toBeVisible();

    await captureBaseSizes(page, "06-6-agent-remove", async (size) => {
      await expectRegionsVisible(page, ["NAV", "06-1", "06-6-1", "06-6-2", "06-6-3"], `06-6 ${sizeLabel(size)}`);
      await expectDialogWidth(page, size, "06-6-1", "sm");
    });

    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: "취소", exact: true }).click();
    await expect(form).toHaveCount(0);
    // 파일 변경 없음.
    expect(readFixtureFile(agentFile(REVIEWER))).toBe(before);
    expect(listFixtureDir(fixturePath(".aojistudio", "trash")).filter((name) => name.startsWith(`${REVIEWER}.`))).toEqual([]);
  });

  test("[E2E-13][FR-011-AC4][NFR-11] 순서 11 — 06-5-save-conflict: 06 연 뒤 web-reviewer.md 본문 한 줄 추가 → 저장 → 캡처 → 최신 파일 다시 불러오기 → 취소", async ({
    page,
  }) => {
    await gotoReady(page, EDIT_FORM_PATH);
    const form = page.locator('[data-wf="06-1"]');
    await expect(form.getByLabel("이름 (name)", { exact: true })).toHaveValue(REVIEWER);

    // 폼을 연 뒤 바깥에서 같은 파일에 본문 한 줄을 더한다(길이가 달라 revision이 반드시 바뀐다).
    const original = readFixtureFile(agentFile(REVIEWER));
    writeFixtureFile(agentFile(REVIEWER), `${original}\n바깥에서 더한 한 줄 · 06-5 대조용\n`);

    await form.getByRole("button", { name: "저장", exact: true }).click();
    const conflict = page.getByRole("alertdialog", { name: "파일이 다른 곳에서 수정되었습니다", exact: true });
    await expect(conflict).toBeVisible();
    await expect(conflict).toHaveAttribute("data-wf", "06-5-1");
    await expect(conflict).toContainText(`${REVIEWER}.md가 이 창을 연 뒤 `);

    await captureBaseSizes(page, "06-5-save-conflict", async (size) => {
      await expectRegionsVisible(page, ["NAV", "06-1", "06-5-1", "06-5-2"], `06-5 ${sizeLabel(size)}`);
      await expectDialogWidth(page, size, "06-5-1", "sm");
    });

    await conflict.getByRole("button", { name: "최신 파일 다시 불러오기", exact: true }).click();
    await expect(conflict).toHaveCount(0);
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: "취소", exact: true }).click();
    await expect(form).toHaveCount(0);
    // 저장하지 않았으므로 파일은 바깥에서 쓴 내용 그대로다.
    expect(readFixtureFile(agentFile(REVIEWER))).toContain("바깥에서 더한 한 줄");
  });

  test("[E2E-13][FR-009-AC6][NFR-11] 순서 12 — 05R-agent-import-empty: 워크플로우 밖 5명을 모두 투자부서에 가져온 뒤 영상제작부서 층 `가져오기` → 캡처", async ({
    page,
  }) => {
    await gotoReady(page, "/workflows");
    await page.getByRole("button", { name: `워크플로우 밖 에이전트 ${OUTSIDE_COUNT} · 가져오기`, exact: true }).click();
    const importDialog = page.locator('[data-wf="05R-1"]');
    await expect(importDialog).toBeVisible();
    await importDialog.getByLabel("대상 워크플로우", { exact: true }).selectOption("투자부서");
    for (const name of ["code-explainer", "docs-writer", "release-manager", "test-runner", "video-editor"]) {
      await choose(importDialog.getByRole("checkbox", { name: `${name} 선택`, exact: true }));
    }
    await importDialog.getByRole("button", { name: `선택한 ${OUTSIDE_COUNT}명 가져오기`, exact: true }).click();
    await expect(importDialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "워크플로우 밖 에이전트 0 · 가져오기", exact: true })).toBeVisible({
      timeout: SETUP_REFLECT_TIMEOUT_MS,
    });

    // 층의 `가져오기`(대상 고정)로 열면 빈 상태 카드가 나온다.
    await floorHeader(page, "영상제작부서").getByRole("button", { name: "가져오기", exact: true }).click();
    const emptyDialog = page.locator('[data-wf="05R-1"]');
    await expect(emptyDialog.getByRole("heading", { name: "영상제작부서(으)로 기존 에이전트 가져오기", exact: true })).toBeVisible();
    await expect(emptyDialog.getByText("워크플로우 밖 에이전트가 없습니다", { exact: true })).toBeVisible();
    await expect(
      emptyDialog.getByText("모든 정의 파일이 이미 워크플로우에 속해 있습니다. 새로 만들어 이 워크플로우에 넣으세요.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(emptyDialog.getByRole("button", { name: "새로 만들기", exact: true })).toBeEnabled();

    await captureBaseSizes(page, "05R-agent-import-empty", async (size) => {
      await expectRegionsVisible(page, ["NAV", "05R-1", "05R-2", "05R-3", "05R-5"], `05-R 빈 상태 ${sizeLabel(size)}`);
      await expectDialogWidth(page, size, "05R-1", "lg");
    });

    await emptyDialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(emptyDialog).toHaveCount(0);
    // 투자부서가 9명(넓은 층)이 됐고 구성 파일에 반영됐다(팀장 1 + 팀원 3 + 가져온 5).
    const config = JSON.parse(readFixtureFile(teamFile("투자부서"))) as { lead: string; members: string[] };
    expect(config.lead).toBe("invest-lead");
    expect(config.members).toHaveLength(8);
  });

  test("[E2E-13][FR-006-AC4][FR-006-AC1][NFR-11] 순서 13 — 13자 이름을 디자인부서 첫 줄 두 번째 칸에 놓고 이웃 칸 번짐·겹침을 확인한다(보통 층·넓은 층)", async ({
    page,
  }) => {
    const LONG_NAME = "design-longn1"; // 13자 — FR-006-AC4 경계(12자 초과 → 12자 + …)
    expect(LONG_NAME).toHaveLength(13);
    const originalTeam = readFixtureFile(teamFile(DESIGN));

    try {
      await gotoReady(page, "/workflows");
      writeFixtureFile(
        agentFile(LONG_NAME),
        agentFileContent({ name: LONG_NAME, description: "13자 이름 열 번짐 실측용", body: "측정용." }),
      );
      const team = JSON.parse(originalTeam) as { members: string[] };
      team.members = [...team.members, LONG_NAME].sort();
      writeFixtureFile(teamFile(DESIGN), `${JSON.stringify(team, null, 2)}\n`);
      await expect(spriteSvg(page, LONG_NAME)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });

      const desks = await deskMetrics(page, DESIGN);
      // FR-006-AC1: 팀장 첫 자리, 나머지 name 오름차순 → 긴 이름이 첫 줄 두 번째 칸(양쪽에 이웃이 있다).
      expect(desks.map((desk) => desk.name)).toEqual(["design-lead", LONG_NAME, "design-motion", "design-reviewer", "design-ui"]);
      const longDesk = desks.find((desk) => desk.name === LONG_NAME);
      expect(longDesk).toBeDefined();
      const long = longDesk as (typeof desks)[number];
      // FR-006-AC4: 12자 초과 → 12자 + `…`, 전체 이름은 title로.
      expect(long.label, "12자 초과 이름이 말줄임되지 않았습니다").toBe(`${LONG_NAME.slice(0, 12)}…`);
      await expect(spriteBox(page, LONG_NAME).locator("span[title][data-clamp]").first()).toHaveAttribute("title", LONG_NAME);
      // 이름 칩도 칸 폭에서 잘린다(ui-spec §공통 `Desk`).
      expect(round2(long.labelWidth), "13자 이름 칩이 칸 폭을 넘습니다").toBeLessThanOrEqual(COLUMN_PITCH + 1);

      const neighbours = desks.filter((desk) => desk.name === "design-lead" || desk.name === "design-motion");
      expect(neighbours).toHaveLength(2);
      const overlaps = neighbours.filter((desk) => long.labelLeft < desk.labelRight && long.labelRight > desk.labelLeft);
      expect(overlaps.map((desk) => desk.name), "13자 이름 칩이 이웃 칸의 이름 칩과 겹칩니다").toEqual([]);

      // 상태 줄 폭·겹침: 보통 층·넓은 층 모두 문구 형식·폭 > 0·겹침 0.
      for (const desk of desks) {
        expect(desk.statusText, `${desk.name} 상태 줄 문구`).toMatch(STATUS_LINE_PATTERN);
        expect(desk.statusWidth, `${desk.name} 상태 줄 폭`).toBeGreaterThan(0);
      }
      expect(statusOverlaps(desks), "보통 층에서 상태 줄이 이웃 칸 상태 줄과 겹칩니다").toEqual([]);
      const wideDesks = await deskMetrics(page, DEV);
      for (const desk of wideDesks) {
        expect(desk.statusText, `${desk.name} 상태 줄 문구`).toMatch(STATUS_LINE_PATTERN);
      }
      expect(statusOverlaps(wideDesks), "넓은 층에서 상태 줄이 이웃 칸 상태 줄과 겹칩니다").toEqual([]);
    } finally {
      writeFixtureFile(teamFile(DESIGN), originalTeam);
      removeFixturePath(agentFile(LONG_NAME));
    }

    // 복구 단언.
    await gotoReady(page, "/workflows");
    await expect(page.locator(`section[data-floor=${JSON.stringify(DESIGN)}]`)).toContainText("4명", {
      timeout: SETUP_REFLECT_TIMEOUT_MS,
    });
    await expect(spriteSvg(page, LONG_NAME)).toHaveCount(0);
  });

  test("[E2E-13][FR-006-AC10][FR-006-AC4][FR-006-AC1] 순서 14 — 디자인부서 이웃한 두 책상에 부모 접미를 붙이는 재생(짧은 부모·13자 부모)에서 상태 줄 clamp를 실측한다", async ({
    page,
  }) => {
    // 보통 층이 한 줄에 4칸을 두는 폭(ui-spec SCR-02: 1920 = 보통 층 4)에서 잰다 — 2단계에서 5명이 돼도 두 책상이 첫 줄 이웃 칸이다.
    await page.setViewportSize({ width: 1920, height: 1080 });
    const PAIR = ["design-motion", "design-reviewer"] as const;
    const SHORT_PARENT = "design-lead";
    /** 13자 부모 라벨 — FR-006-AC4 경계(12자 초과)를 넘고 부모 접미는 잘리지 않으므로 가장 긴 상태 줄이다. */
    const LONG_PARENT = "des-parentxyz";
    expect(LONG_PARENT).toHaveLength(13);
    expect(
      scenarioLines(SPAN1_CLAMP_SCENARIO).length,
      "span1-status-clamp.jsonl 줄 수가 scenarios/README.md 대응표와 다릅니다",
    ).toBe(SPAN1_CLAMP_LINE_COUNT);
    const originalTeam = readFixtureFile(teamFile(DESIGN));

    try {
      await gotoReady(page, "/workflows");
      // 재생 전: design-ui만 접미가 있다(showcase.jsonl 13줄) — 측정 대상 두 책상에는 접미가 없다.
      const before = await deskMetrics(page, DESIGN);
      expect(before.map((desk) => desk.name)).toEqual(["design-lead", ...PAIR, "design-ui"]);
      expect(before.filter((desk) => desk.statusText.includes("· 부모 ")).map((desk) => desk.name)).toEqual(["design-ui"]);

      // 1단계: 짧은 부모 라벨(design-lead, 11자) — 1~2줄 재생.
      expect(replayScenarioLines({ scenarioPath: SPAN1_CLAMP_SCENARIO, from: 1, to: 2 }).sent).toBe(2);
      for (const name of PAIR) await waitForSuffix(page, name, `작업 중 · 부모 ${SHORT_PARENT}`);
      await assertSuffixPair({
        page,
        workflowName: DESIGN,
        pair: PAIR,
        parentLabel: SHORT_PARENT,
        phase: `부모 ${SHORT_PARENT}(${SHORT_PARENT.length}자)`,
      });

      // 2단계: 13자 부모 라벨 — 3~4줄로 1단계 서브를 비우고 5~7줄 재생.
      expect(replayScenarioLines({ scenarioPath: SPAN1_CLAMP_SCENARIO, from: 3, to: 4 }).sent).toBe(2);
      for (const name of PAIR) {
        await expect(spriteBox(page, name).getByText("대기", { exact: true })).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
      }

      // 13자 부모는 같은 층의 정의 있는 에이전트로 만든다(원본 fixture는 건드리지 않는다).
      writeFixtureFile(
        agentFile(LONG_PARENT),
        agentFileContent({ name: LONG_PARENT, description: "13자 부모 라벨 실측용", body: "측정용." }),
      );
      const team = JSON.parse(originalTeam) as { members: string[] };
      team.members = [...team.members, LONG_PARENT].sort();
      writeFixtureFile(teamFile(DESIGN), `${JSON.stringify(team, null, 2)}\n`);
      await expect(spriteSvg(page, LONG_PARENT)).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });

      expect(replayScenarioLines({ scenarioPath: SPAN1_CLAMP_SCENARIO, from: 5, to: 7 }).sent).toBe(3);
      for (const name of PAIR) await waitForSuffix(page, name, `작업 중 · 부모 ${LONG_PARENT}`);

      // 5명이 되어 첫 줄은 `design-lead · des-parentxyz · design-motion · design-reviewer`, 둘째 줄은 `design-ui`다
      // → 측정 대상 두 책상은 여전히 첫 줄의 인접 열이다.
      const widened = await deskMetrics(page, DESIGN);
      expect(widened.map((desk) => desk.name)).toEqual(["design-lead", LONG_PARENT, ...PAIR, "design-ui"]);
      await assertSuffixPair({
        page,
        workflowName: DESIGN,
        pair: PAIR,
        parentLabel: LONG_PARENT,
        phase: `부모 ${LONG_PARENT}(${LONG_PARENT.length}자)`,
      });
    } finally {
      writeFixtureFile(teamFile(DESIGN), originalTeam);
      removeFixturePath(agentFile(LONG_PARENT));
    }

    // fixture가 원래대로 돌아왔는지 화면으로 확인한다(live 상태는 이 배치의 마지막 테스트라 남겨 둔다).
    await gotoReady(page, "/workflows");
    await expect(page.locator(`section[data-floor=${JSON.stringify(DESIGN)}]`)).toContainText("4명", {
      timeout: SETUP_REFLECT_TIMEOUT_MS,
    });
  });
});
