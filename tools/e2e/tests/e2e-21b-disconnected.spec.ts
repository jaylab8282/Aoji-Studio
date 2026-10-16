// E2E-21b: 전역 Claude 설정이 연결되지 않은 상태(대역 `연결 안 됨`)의 v1.2.0 화면. fixture: `project-configured`, `E2E_CLAUDE_HOME_FIXTURE` 없음(배치 6).
// 09 부분(T-R4-17): FR-023-E2. 10 부분(T-R4-18: FR-025-E1)은 아래 `[E2E-21b] 10` describe 자리에 더한다.
// 목킹 없음(conventions §8).
import { expect, test } from "@playwright/test";

import { mcpList } from "./mcp-helpers";
import { gotoReady } from "./ui-helpers";

test.describe("[E2E-21b] 09 MCP 연결 안 됨", () => {
  test("[FR-023-E2] 전역 설정 연결 안 됨 → 전역 칸 `연결 안 됨` + 출처 오류 줄 `설정 열기` → 07 `/settings`, 프로젝트·호출 기록·커넥터 안내는 그대로", async ({
    page,
  }) => {
    await gotoReady(page, "/mcp");

    const sources = page.locator('[data-wf="09-3"]');
    await expect(sources).toBeVisible();
    await expect(sources.getByText("연결 안 됨").first()).toBeVisible();
    // 읽기 전용 글자가 붙은 `연결됨`은 전역·플러그인 어디에도 없다
    await expect(sources).not.toContainText("연결됨");

    const errorLine = page.locator('[data-wf="09-10"]');
    await expect(errorLine).toContainText(/~\/\.claude\.json\s*·\s*연결 안 됨/);
    await expect(errorLine).toContainText("이 출처만 빼고 표시합니다");

    // 프로젝트 칸과 커넥터 안내, 목록 카드(또는 빈 상태)는 그대로 보인다
    await expect(sources).toContainText(/프로젝트[\s\S]*읽음/);
    await expect(page.locator('[data-wf="09-4"]')).toContainText("claude.ai 커넥터");
    // 빈 상태 카드도 `09-5`(ui-spec)라 목록·빈 카드·제목이 한꺼번에 잡히므로 첫 요소로 단언한다.
    await expect(mcpList(page).or(page.getByText("설치된 MCP가 없습니다", { exact: true })).first()).toBeVisible();

    await errorLine.getByText("설정 열기", { exact: true }).click();
    await expect(page).toHaveURL(/\/settings(?:[?#].*)?$/);
  });
});

// T-R4-18이 `test.describe("[E2E-21b] 10 비용 연결 안 됨", …)`를 이 파일 아래에 더한다(같은 배치 6, fixture·연결 안 됨 전제 같음).
