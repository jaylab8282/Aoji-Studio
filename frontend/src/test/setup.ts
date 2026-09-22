import "@testing-library/jest-dom/vitest";

// @types/node 없이 Vitest(Node) 전역 `process`만 최소로 타입 선언한다.
declare const process: { env: Record<string, string | undefined> };

// lib/format/time.ts는 브라우저 로컬 시각으로 변환한다(conventions.md §3).
// 실행 환경에 따라 시각 표기 테스트가 흔들리지 않도록 앱이 실제로 도는 시간대로 고정한다.
process.env.TZ = "Asia/Seoul";
