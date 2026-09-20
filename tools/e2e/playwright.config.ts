import { defineConfig, devices } from "@playwright/test";

// 실제 컨테이너(tools/e2e/compose.e2e.yaml, 127.0.0.1:4190)를 대상으로 실행한다.
// page.route로 /api/**를 가로채지 않는다(conventions.md §8, 목킹 금지).
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4190",
    viewport: { width: 1440, height: 1024 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
