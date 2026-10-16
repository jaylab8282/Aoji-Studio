// E2E-21b: 전역 Claude 설정이 연결되지 않은 상태(대역 `연결 안 됨`)의 v1.2.0 화면. fixture: `project-configured`, `E2E_CLAUDE_HOME_FIXTURE` 없음(배치 6).
// 09 부분(T-R4-17): FR-023-E2. 10 부분(T-R4-18): FR-025-E1(대화 기록 연결 안 됨), FR-027-E1(상태줄 값을 받은 적 없음).
// 목킹 없음(conventions §8).
import { expect, test } from "@playwright/test";

import { readingStrip, tokenTile } from "./cost-helpers";
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

test.describe("[E2E-21b] 10 비용 연결 안 됨", () => {
  test("[FR-025-E1] 대화 기록 연결 안 됨 → 띠 `대화 기록 · 연결 안 됨`·토큰 칸 `-`·안내 카드, `설정 열기` → `/settings`, 금액 문구는 그대로", async ({
    page,
  }) => {
    await gotoReady(page, "/cost");

    const strip = readingStrip(page);
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("대화 기록 · 연결 안 됨");
    await expect(strip).toContainText("~/.claude/projects/");
    await expect(strip).toContainText("이 폴더가 컨테이너에 연결되지 않아 토큰 사용량을 읽을 수 없습니다");
    // 읽는 중 표시(읽은 파일 N / 전체)는 없다
    await expect(strip).not.toContainText("읽은 파일");

    // 토큰 4칸과 추정 금액 칸은 값 자리가 `-`, 금액 문구는 그대로(ui-rules 10)
    for (const label of ["입력 토큰", "출력 토큰", "캐시 생성 토큰", "캐시 읽기 토큰"]) {
      await expect(tokenTile(page, label), label).toHaveText(new RegExp(`^\\s*${label}\\s*-\\s*$`));
    }
    const amount = page.locator('[data-wf="10-5"]');
    await expect(amount).toContainText("추정 금액 (USD)");
    await expect(amount).toHaveText(/-/);
    await expect(amount).not.toContainText("$");
    await expect(amount).toContainText("API 단가 환산 · 실제 청구액 아님");

    // 차트·나눔 표 자리에는 안내 카드
    const notice = page.locator('[data-wf="10-7"]');
    await expect(notice).toContainText("대화 기록이 연결되지 않았습니다");
    await expect(notice).toContainText(
      "설정의 전역 Claude 설정 연결에서 ~/.claude/projects/를 연결하면 날짜·모델·세션·에이전트별 토큰 사용량이 보입니다.",
    );
    await expect(page.getByRole("tab", { name: "모델별", exact: true })).toHaveCount(0);

    // 띠의 `설정 열기` → 07
    await strip.getByText("설정 열기", { exact: true }).click();
    await expect(page).toHaveURL(/\/settings(?:[?#].*)?$/);

    // 안내 카드의 `설정 열기` → 07
    await gotoReady(page, "/cost");
    await expect(page.locator('[data-wf="10-7"]')).toContainText("대화 기록이 연결되지 않았습니다");
    await page.locator('[data-wf="10-7"]').getByText("설정 열기", { exact: true }).click();
    await expect(page).toHaveURL(/\/settings(?:[?#].*)?$/);
  });

  test("[FR-027-E1] 상태줄·한도 캐시 어디에서도 값을 받지 못함 → 한도 카드 `받은 적 없음`·상태줄 연동 안내·`설정 열기` → `/settings`, 상태줄 안내는 항상", async ({
    page,
  }) => {
    await gotoReady(page, "/cost");

    const card = page.locator('[data-wf="10-6"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText("받은 적 없음");
    await expect(card).toContainText("설정의 상태줄 연동 예시를 Claude Code 설정에 넣으면 구독 플랜과 한도 값이 들어옵니다");
    await expect(card.getByRole("meter")).toHaveCount(0);
    await expect(page.locator('[data-wf="10-8"]')).toContainText(
      "Claude Code CLI 세션이 돌 때만 상태줄 값이 갱신되고, 데스크톱 앱 세션에서는 상태줄이 돌지 않을 수 있습니다",
    );

    await card.getByText("설정 열기", { exact: true }).click();
    await expect(page).toHaveURL(/\/settings(?:[?#].*)?$/);
  });
});
