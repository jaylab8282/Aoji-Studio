// E2E-16 사이 크기 넘침 판정 (architecture.md §8.4, ADR-75 4, NFR-11).
// 01·02·03·07을 1512×982·1280×800·900×1600에서 열어(E2E-13과 같은 showcase 상태) 네 가지를 자동 판정한다:
// ① 페이지 가로 스크롤 ② 가로로 넘치는 overflow 요소(의도한 말줄임 = `data-clamp`만 제외) ③ 영역 안 버튼·링크·입력·칩의 잘림
// ④ 같은 영역 안·서로 다른 최상위 영역끼리의 겹침. 실패 메시지에 크기·화면·요소(`data-wf` + 태그 + 글자 앞 20자)·수치를 적는다.
//
// 실행: E2E_FIXTURE=project-showcase — 배치 8 순서 9. 파일 이름순으로 e2e-13(순서 1~8) 바로 뒤, 상태를 바꾸는
// 순서 10~14(e2e-16z-e2e13-state-changes.spec.ts) 앞에서 돈다(ui-spec "배치별 캡처 순서"):
//   E2E_FIXTURE=project-showcase npx playwright test tests/e2e-13.spec.ts tests/e2e-16.spec.ts tests/e2e-16z-e2e13-state-changes.spec.ts --grep "project-showcase"
// 목킹 없음: 실제 컨테이너·재생 상태만 본다(conventions.md §8).
import { expect, test, type Page } from "@playwright/test";

import {
  BETWEEN_SIZES,
  collectLayoutViolations,
  expectFloorLayout,
  expectHomeLayout,
  expectNavWidth,
  expectOfficeLayout,
  expectRegionsVisible,
  expectSettingsLayout,
  navRegions,
  settle,
  sizeLabel,
  type Size,
} from "./screen-helpers";
import {
  detailRegions,
  DEV,
  HOME_REGIONS,
  SETTINGS_REGIONS,
  WORKFLOWS_REGIONS,
  assertFixture,
} from "./showcase-helpers";
import { gotoReady } from "./ui-helpers";

interface Screen {
  label: string;
  path: string;
  regions: readonly string[] | ((size: Size) => readonly string[]);
  layout: (page: Page, size: Size) => Promise<void>;
}

const SCREENS: readonly Screen[] = [
  {
    label: "01 홈",
    path: "/",
    regions: HOME_REGIONS,
    layout: (page, size) => expectHomeLayout(page, size),
  },
  {
    label: "02 워크플로우",
    path: "/workflows",
    regions: WORKFLOWS_REGIONS,
    layout: (page, size) => expectFloorLayout(page, size, [DEV]),
  },
  {
    label: "03 워크플로우 상세",
    path: `/workflows/${encodeURIComponent(DEV)}`,
    regions: detailRegions,
    layout: (page, size) => expectOfficeLayout(page, size),
  },
  {
    label: "07 설정",
    path: "/settings",
    regions: SETTINGS_REGIONS,
    layout: (page, size) => expectSettingsLayout(page, size),
  },
];

test.describe("[E2E-16] project-showcase 배치 8 순서 9 — 사이 크기 넘침 판정(4화면 × 3크기 = 12경우)", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeAll(() => {
    assertFixture("project-showcase");
  });

  for (const screen of SCREENS) {
    for (const size of BETWEEN_SIZES) {
      test(`[E2E-16][NFR-11] ${screen.label} @${sizeLabel(size)} — 가로 스크롤·잘림·겹침 0`, async ({ page }) => {
        await page.setViewportSize(size);
        await gotoReady(page, screen.path);
        await settle(page);

        // 영역과 배치 규칙은 기준 크기와 같은 규칙이 사이 크기에서도 적용된다(ui-spec "크기별 배치 차이").
        await expect(async () => {
          const regions = typeof screen.regions === "function" ? screen.regions(size) : screen.regions;
          await expectRegionsVisible(page, [...navRegions(size), ...regions], `${screen.label} ${sizeLabel(size)}`);
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
