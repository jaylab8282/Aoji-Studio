// E2E-13 순서 6 + E2E-16 순서 7 (v1.2.0, T-R4-22, 배치 13). fixture: `project-usage` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-basic`.
//   배치 13 순서 6  `07-settings` 3크기 캡처 + 영역·배치 판정 — 전역 4항목 연결됨·상태줄 마지막 수신 있음(E2E-22 뒤)
//   배치 13 순서 7  E2E-16 — 07·08·09·10 × 1512×982·1280×800·900×1600 가로 스크롤·잘림·겹침 0 (12경우)
//
// 파일 이름순으로 e2e-22-statusline(상태줄 값을 받은 뒤, 마지막 테스트의 pause/unpause가 끝난 뒤) **바로 뒤**, e2e-24·25·26 앞에서 돈다.
// 읽기만 한다(파일·설정을 바꾸지 않는다). 08은 첫 행, 09는 `github` 행을 펼친 상태에서 판정한다(펼친 내용이 넘침이 생기기 쉬운 자리).
// 목킹 없음: 실제 컨테이너·재생 상태만 본다(conventions.md §8).
import { expect, test, type Page } from "@playwright/test";

import { expandMcpRow, mcpList } from "./mcp-helpers";
import {
  BETWEEN_SIZES,
  COST_REGIONS,
  MCP_REGIONS,
  SKILLS_REGIONS,
  captureBaseSizes,
  collectLayoutViolations,
  expectCostLayout,
  expectMcpLayout,
  expectNavWidth,
  expectRegionsVisible,
  expectSettingsLayout,
  expectSkillsLayout,
  navRegions,
  settle,
  sizeLabel,
  type Size,
} from "./screen-helpers";
import { SETTINGS_REGIONS, assertFixture, check } from "./showcase-helpers";
import { gotoReady } from "./ui-helpers";

test.use({ reducedMotion: "reduce" });

test.beforeAll(() => {
  assertFixture("project-usage");
});

// ── 순서 6 — 07-settings ──────────────────────────────────────────────────────────

test("[E2E-13][FR-014-AC1][FR-014-AC6][NFR-11] 배치 13 순서 6 — 07-settings: 전역 4항목 연결됨·상태줄 마지막 수신 있음 → 3크기 캡처 + 영역·배치 판정", async ({
  page,
}) => {
  await gotoReady(page, "/settings");
  await expect(page.getByRole("heading", { name: "설정", level: 2, exact: true })).toBeVisible();

  // 시안 상태: 전역 Claude 설정 연결됨(4항목), 상태줄 값을 받은 적 있음(e2e-22가 보냈다).
  const global = page.locator('[data-wf="07-7"]');
  await expect(global).toContainText("전역 Claude 설정 연결");
  await expect(global.getByText("연결됨 · 읽기 전용", { exact: true })).toHaveCount(4);
  await expect(global.getByText("연결 안 됨", { exact: true })).toHaveCount(0);
  const received = page.getByTestId("settings-row-statusline-received");
  await expect(received).toBeVisible();
  await expect(received).not.toContainText("받은 적 없음");
  await expect(received).toContainText(/\d{2}:\d{2}:\d{2}/);

  await captureBaseSizes(
    page,
    "07-settings",
    check(page, "07 설정", SETTINGS_REGIONS, async (size) => {
      await expectSettingsLayout(page, size);
    }),
  );
});

// ── 순서 7 — E2E-16 (07·08·09·10) ─────────────────────────────────────────────────

interface Screen {
  label: string;
  path: string;
  regions: readonly string[];
  /** 화면을 시안과 같은 상태로 만든다(행 펼침 등). */
  prepare?: (page: Page) => Promise<void>;
  layout: (page: Page, size: Size) => Promise<void>;
}

const SCREENS: readonly Screen[] = [
  {
    label: "07 설정",
    path: "/settings",
    regions: SETTINGS_REGIONS,
    layout: (page, size) => expectSettingsLayout(page, size),
  },
  {
    label: "08 스킬",
    path: "/skills",
    regions: SKILLS_REGIONS,
    prepare: async (page) => {
      const first = page.locator('[data-wf="08-5"]').getByRole("listitem").first();
      await first.getByRole("button", { name: /펼치기$/ }).click();
      await expect(page.locator('[data-wf="08-13"]').first()).toBeVisible();
    },
    layout: (page, size) => expectSkillsLayout(page, size),
  },
  {
    label: "09 MCP",
    path: "/mcp",
    regions: MCP_REGIONS,
    prepare: async (page) => {
      await expect(mcpList(page)).toBeVisible();
      await expandMcpRow(page, "github");
    },
    layout: (page, size) => expectMcpLayout(page, size),
  },
  {
    label: "10 비용",
    path: "/cost",
    regions: COST_REGIONS,
    prepare: async (page) => {
      const all = page.getByRole("group", { name: "기간", exact: true }).getByRole("button", { name: "전체", exact: true });
      await all.click();
      await expect(all).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator('[data-wf="10-4"]')).toContainText(/\d/);
    },
    layout: (page, size) => expectCostLayout(page, size, true),
  },
];

test.describe("[E2E-16] 배치 13 순서 7 — 07·08·09·10 사이 크기 넘침 판정(4화면 × 3크기 = 12경우)", () => {
  for (const screen of SCREENS) {
    for (const size of BETWEEN_SIZES) {
      test(`[E2E-16][NFR-11] ${screen.label} @${sizeLabel(size)} — 가로 스크롤·잘림·겹침 0`, async ({ page }) => {
        await page.setViewportSize(size);
        await gotoReady(page, screen.path);
        if (screen.prepare !== undefined) await screen.prepare(page);
        await settle(page);

        // 영역과 배치 규칙은 기준 크기와 같은 규칙이 사이 크기에서도 적용된다(ui-spec "크기별 배치 차이").
        await expect(async () => {
          await expectRegionsVisible(page, [...navRegions(size), ...screen.regions], `${screen.label} ${sizeLabel(size)}`);
          await expectNavWidth(page, size);
          await screen.layout(page, size);
        }).toPass({ timeout: 10_000 });

        let violations: string[] = [];
        await expect(async () => {
          violations = await collectLayoutViolations(page);
          expect(violations, `${sizeLabel(size)} ${screen.label}\n${violations.join("\n")}`).toEqual([]);
        }).toPass({ timeout: 10_000 });
        expect(violations).toEqual([]);
      });
    }
  }
});
