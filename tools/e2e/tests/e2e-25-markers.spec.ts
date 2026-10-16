// E2E-25: 표지 문자열 0 (T-R4-20, 배치 13). fixture: `project-usage` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-basic`(architecture §8.2 배치 13).
// 검증 ID: NFR-14·FR-025-AC5(대화 본문), NFR-08·FR-023-AC2(MCP `env`·`headers` 값), NFR-15·FR-027-AC7(`.claude.json` 계정·`.credentials.json`·상태줄 입력의 보내지 않는 값).
//
// fixture에 심은 표지(`AOJI-MARKER-<종류>-<해시>`, conventions §8 표지 문자열 규칙)가 아래 어디에도 0회임을 단언한다.
//   ① API 응답 본문 전부(화면이 쓰는 GET API를 직접 호출 + 화면을 열며 브라우저가 받은 응답)
//   ② SSE 수신 전체(`/api/stream` 5종 이벤트)
//   ③ 컨테이너 로그
//   ④ `docker cp`로 꺼낸 `/data`(`events.db`·`-wal` 포함) 바이트
// 표지가 fixture에 실제로 있다는 대조(양성 대조)를 먼저 한다 — 대조가 깨지면 "0회"가 아무 뜻이 없다.
//
// 파일 이름순으로 e2e-19~22 뒤에 돈다: 재생(usage.jsonl)·대화 기록 읽기·상태줄 수신(표지가 든 입력 `full.json`)이 모두 끝난 상태에서 본다.
// e2e-21-cost 마지막 테스트가 대화 기록에 줄을 덧붙이지만 표지 없는 줄이라 이 검사에 영향이 없다(양성 대조는 표지 있는 줄이 남아 있음을 확인한다).
// 목킹 없음.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { FIXTURES_DIR, readE2eState } from "../lib/e2e-state";
import { containerId, containerLogs, containerStatus } from "./container-helpers";
import { gotoReady } from "./ui-helpers";

test.describe.configure({ mode: "serial" });

/** 표지 문자열 — fixture(`tools/fixtures/claude-home-basic`·`project-usage`·`statusline`)와 이 상수 두 곳에만 둔다. */
const MARKERS = {
  CONVO: "AOJI-MARKER-CONVO-7f3a",
  ENV: "AOJI-MARKER-ENV-91c2",
  EMAIL: "AOJI-MARKER-EMAIL-55d0",
  CRED: "AOJI-MARKER-CRED-2e9a",
  STATUS: "AOJI-MARKER-STATUS-3b1e",
} as const;
const MARKER_PREFIX = "AOJI-MARKER";

/** 표지가 들어 있어야 하는 fixture 파일(claude-home 사본 기준 상대 경로 → 표지). */
const FIXTURE_SOURCES: Array<{ file: string; marker: string }> = [
  { file: ".claude/projects/-home-fixture-work-aoji-fixture-app/e5f6a7b8-0000-4000-8000-000000000002.jsonl", marker: MARKERS.CONVO },
  { file: ".claude/plugins/cache/aoji-fixture-market/demo-tools/1.0.0/.mcp.json", marker: MARKERS.ENV },
  { file: ".claude.json", marker: MARKERS.EMAIL },
  { file: ".claude/.credentials.json", marker: MARKERS.CRED },
];

const originHeaders = (): Record<string, string> => ({ Origin: readE2eState().baseUrl });

/** 표지 prefix가 한 번이라도 나오면 어느 곳에 나왔는지 알 수 있게 문맥을 돌려준다. */
function findMarkers(haystack: Buffer | string, where: string): string[] {
  const buffer = typeof haystack === "string" ? Buffer.from(haystack, "utf8") : haystack;
  const hits: string[] = [];
  for (const [kind, marker] of Object.entries(MARKERS)) {
    if (buffer.includes(marker)) {
      hits.push(`${where}: ${kind} 표지 ${marker}`);
    }
  }
  if (hits.length === 0 && buffer.includes(MARKER_PREFIX)) {
    hits.push(`${where}: 알 수 없는 ${MARKER_PREFIX} 표지`);
  }
  return hits;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

test.beforeAll(() => {
  expect(containerStatus(), "e2e 컨테이너가 running이 아닙니다(e2e-22의 pause 뒤 unpause 확인)").toBe("running");
});

test("[NFR-14][NFR-08][NFR-15][E2E-25] 양성 대조: 표지는 fixture(전역 연결 사본)에 실제로 들어 있다", () => {
  const state = readE2eState();
  expect(state.claudeHomeDir, "전역 연결 fixture가 연결되지 않았습니다(E2E_CLAUDE_HOME_FIXTURE=claude-home-basic)").not.toBeNull();
  for (const { file, marker } of FIXTURE_SOURCES) {
    const path = join(state.claudeHomeDir as string, file);
    expect(existsSync(path), `${file} 없음`).toBe(true);
    expect(readFileSync(path, "utf8"), `${file}에 ${marker}`).toContain(marker);
  }
  // 상태줄 입력 fixture의 보내지 않는 값(ADR-83 — 세 가지 값만 보낸다. e2e-22가 이 입력으로 스크립트를 실행했다)
  expect(readFileSync(join(FIXTURES_DIR, "statusline", "full.json"), "utf8")).toContain(MARKERS.STATUS);
});

test("[NFR-14][NFR-08][FR-023-AC2][FR-025-AC5][E2E-25] API 응답 전부와 화면이 받은 응답에 표지 0", async ({ page, request }) => {
  const state = readE2eState();
  const hits: string[] = [];
  const bodies: string[] = [];

  page.on("response", async (response) => {
    const type = response.request().resourceType();
    const contentType = response.headers()["content-type"] ?? "";
    if (!["fetch", "xhr", "document"].includes(type) || contentType.includes("event-stream")) {
      return;
    }
    try {
      const text = await response.text();
      bodies.push(response.url());
      hits.push(...findMarkers(text, `화면 응답 ${response.url()}`));
    } catch {
      // 이동 중 닫힌 응답은 건너뛴다(직접 호출한 API 쪽에서 같은 경로를 다시 본다).
    }
  });
  for (const path of ["/", "/workflows", "/settings", "/skills", "/mcp", "/cost"]) {
    await gotoReady(page, path);
    await page.waitForTimeout(500);
  }
  expect(bodies.length, "화면 응답을 모으지 못했습니다(수집 장치 점검)").toBeGreaterThan(0);

  const endpoints = [
    "/api/state",
    "/api/events",
    "/api/agents/proj-dev/events",
    "/api/skills/release-notes",
    "/api/settings",
    "/api/skills?period=all&tz=Asia/Seoul",
    "/api/mcp?period=all&tz=Asia/Seoul",
    "/api/cost?period=all&tz=Asia/Seoul",
    "/api/pricing",
    "/api/limits",
  ];
  for (const endpoint of endpoints) {
    const response = await request.get(`${state.baseUrl}${endpoint}`, { headers: originHeaders() });
    expect(response.status(), `${endpoint} ${await response.text()}`).toBe(200);
    hits.push(...findMarkers(await response.text(), `API ${endpoint}`));
  }
  expect(hits).toEqual([]);
});

test("[NFR-14][NFR-15][E2E-25] SSE 수신 전체에 표지 0", async ({ page }) => {
  await gotoReady(page, "/");
  const received = await page.evaluate(async () => {
    const { token } = (await (await fetch("/api/auth/browser-token")).json()) as { token: string };
    const source = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    const frames: string[] = [];
    for (const type of ["snapshot", "event", "live", "heartbeat", "usage-changed", "message"]) {
      source.addEventListener(type, (event) => frames.push(`${type}\n${(event as MessageEvent).data}`));
    }
    await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 4_000));
    source.close();
    return frames;
  });
  expect(received.length, "SSE 첫 snapshot조차 받지 못했습니다").toBeGreaterThan(0);
  expect(received.some((frame) => frame.startsWith("snapshot\n"))).toBe(true);
  expect(findMarkers(received.join("\n"), "SSE")).toEqual([]);
});

test("[NFR-14][NFR-15][E2E-25] 컨테이너 로그에 표지 0", () => {
  const logs = containerLogs();
  expect(logs.length, "컨테이너 로그가 비었습니다(수집 장치 점검)").toBeGreaterThan(0);
  expect(findMarkers(logs, "컨테이너 로그")).toEqual([]);
});

test("[NFR-14][NFR-08][NFR-15][FR-025-AC5][E2E-25] docker cp로 꺼낸 /data(events.db·-wal 포함) 바이트에 표지 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "aojistudio-e2e-25-"));
  try {
    execFileSync("docker", ["cp", `${containerId()}:/data/.`, dir], { stdio: ["ignore", "pipe", "pipe"] });
    const files = listFiles(dir);
    const relative = files.map((file) => file.slice(dir.length + 1));
    test.info().annotations.push({ type: "E2E-25 /data 파일", description: relative.join(", ") });
    process.stdout.write(`[E2E-25 /data 파일] ${relative.map((name, i) => `${name}(${statSync(files[i] as string).size}B)`).join(", ")}\n`);
    expect(relative, "events.db를 꺼내지 못했습니다").toContain("events.db");
    expect(statSync(join(dir, "events.db")).size, "events.db가 비었습니다").toBeGreaterThan(0);
    const hits = files.flatMap((file) => findMarkers(readFileSync(file), file.slice(dir.length + 1)));
    expect(hits).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
