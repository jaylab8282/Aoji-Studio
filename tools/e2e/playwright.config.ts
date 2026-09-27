import { defineConfig, devices } from "@playwright/test";

// 실제 컨테이너(tools/e2e/compose.e2e.yaml, 127.0.0.1:4185)를 대상으로 실행한다.
// page.route로 /api/**를 가로채지 않는다(conventions.md §8, 목킹 금지).
// globalSetup이 fixture 임시 사본 → compose up → dry-run 도우미(4191) → 다른 Origin 서버(4192)까지 준비한다.
const VIEWPORT = { width: 1440, height: 1024 } as const;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./globalSetup.ts",
  globalTeardown: "./globalTeardown.ts",
  timeout: 30_000,
  fullyParallel: false,
  // 모든 spec이 같은 컨테이너와 같은 fixture 폴더를 쓴다(파일 쓰기·SSE 상태 공유).
  // 파일 사이 병렬 실행은 서로의 상태를 덮으므로 워커를 1로 고정한다.
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4185",
    viewport: VIEWPORT,
  },
  projects: [
    {
      name: "chromium",
      // devices 프리셋의 1280×720 viewport를 덮어 기준 캡처와 같은 1440×1024로 고정한다(T-FIX-03 m4).
      use: { ...devices["Desktop Chrome"], viewport: VIEWPORT },
    },
  ],
});
