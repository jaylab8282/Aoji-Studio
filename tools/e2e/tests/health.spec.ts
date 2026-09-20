import { test, expect } from "@playwright/test";

// 실제로 기동한 컨테이너(tools/e2e/compose.e2e.yaml)를 대상으로 한다. 목킹 없음.
// T-001 Done when: `docker compose up` 후 `GET /`가 200.
test("[T-001] GET / → 200, 루트 화면 렌더", async ({ page, request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "에이전트 관제" })).toBeVisible();
});
