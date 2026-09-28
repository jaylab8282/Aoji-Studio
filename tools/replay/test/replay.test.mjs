// 이벤트 재생 도구 단위 테스트 (T-023 Done when: "재생 도구", FR-003-AC9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseArguments, replay } from "../replay.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPLAY_SCRIPT = path.join(__dirname, "..", "replay.mjs");
const SCENARIOS_DIR = path.join(__dirname, "..", "scenarios");

const HOOK_EVENTS = new Set([
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "Stop",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
]);

function readJsonl(fileName) {
  return readFileSync(path.join(SCENARIOS_DIR, fileName), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function makeTempScenario(lines) {
  const dir = mkdtempSync(path.join(tmpdir(), "jaystudio-replay-test-"));
  const scenarioPath = path.join(dir, "scenario.jsonl");
  writeFileSync(scenarioPath, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const tokenFile = path.join(dir, "collect-token");
  writeFileSync(tokenFile, "test-collect-token-value\n");
  return { dir, scenarioPath, tokenFile, token: "test-collect-token-value" };
}

// ---------------------------------------------------------------------------
// FR-003-AC9: 시나리오 파일 내용 검증
// ---------------------------------------------------------------------------

for (const fileName of ["states.jsonl", "showcase.jsonl"]) {
  test(`[FR-003-AC9] ${fileName}의 hook_event_name이 12종 안에만 있음`, () => {
    const events = readJsonl(fileName);
    assert.ok(events.length > 0, `${fileName}에 이벤트가 있어야 한다`);
    for (const event of events) {
      assert.ok(
        HOOK_EVENTS.has(event.hook_event_name),
        `허용되지 않은 hook_event_name: ${event.hook_event_name}`,
      );
    }
  });

  test(`[FR-003-AC9] ${fileName}의 각 이벤트에 공통 필드 session_id·cwd·hook_event_name·permission_mode 존재`, () => {
    const events = readJsonl(fileName);
    for (const [index, event] of events.entries()) {
      for (const field of ["session_id", "cwd", "hook_event_name", "permission_mode"]) {
        assert.equal(
          typeof event[field],
          "string",
          `${fileName} 줄 ${index + 1}에 ${field}가 문자열로 있어야 한다`,
        );
        assert.notEqual(event[field].length, 0, `${fileName} 줄 ${index + 1}의 ${field}가 비어 있으면 안 된다`);
      }
    }
  });

  test(`[FR-003-AC9] ${fileName}의 모든 줄은 독립적으로 JSON.parse가 되는 JSONL이다`, () => {
    const raw = readFileSync(path.join(SCENARIOS_DIR, fileName), "utf8");
    const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line));
    }
  });
}

test("[FR-003-AC9] states.jsonl은 12종 이벤트를 각각 최소 1번 포함한다", () => {
  const events = readJsonl("states.jsonl");
  const seen = new Set(events.map((e) => e.hook_event_name));
  for (const eventName of HOOK_EVENTS) {
    assert.ok(seen.has(eventName), `states.jsonl에 ${eventName}이 없다`);
  }
});

// ---------------------------------------------------------------------------
// parseArguments
// ---------------------------------------------------------------------------

test("parseArguments: --delay-ms 기본값은 50이다", () => {
  const args = parseArguments(["--url", "http://127.0.0.1:4180/hooks/events", "--token-file", "/tmp/x", "scenario.jsonl"]);
  assert.equal(args.delayMs, 50);
  assert.equal(args.url, "http://127.0.0.1:4180/hooks/events");
  assert.equal(args.tokenFile, "/tmp/x");
  assert.equal(args.scenarioPath, "scenario.jsonl");
});

test("parseArguments: --delay-ms 값을 그대로 받는다", () => {
  const args = parseArguments([
    "--url",
    "http://127.0.0.1:4180/hooks/events",
    "--token-file",
    "/tmp/x",
    "--delay-ms",
    "0",
    "scenario.jsonl",
  ]);
  assert.equal(args.delayMs, 0);
});

test("parseArguments: --url·--token-file·시나리오 경로가 없으면 던진다", () => {
  assert.throws(() => parseArguments([]), /사용법/);
  assert.throws(() => parseArguments(["--url", "http://x"]), /사용법/);
  assert.throws(
    () => parseArguments(["--url", "http://x", "--token-file", "/tmp/x"]),
    /사용법/,
  );
});

test("parseArguments: --delay-ms가 음수·숫자가 아니면 던진다", () => {
  for (const bad of ["-1", "abc", ""]) {
    assert.throws(
      () =>
        parseArguments([
          "--url",
          "http://x",
          "--token-file",
          "/tmp/x",
          "--delay-ms",
          bad,
          "scenario.jsonl",
        ]),
      /--delay-ms/,
    );
  }
});

// ---------------------------------------------------------------------------
// 재생 도구: 순서대로 POST, 헤더 Content-Type·토큰
// ---------------------------------------------------------------------------

test("재생 도구: 시나리오 줄 순서대로 POST하고 Content-Type·토큰 헤더를 싣는다", async () => {
  const { dir, scenarioPath, tokenFile, token } = makeTempScenario([
    { session_id: "s1", cwd: "/workspace", hook_event_name: "SessionStart", permission_mode: "default" },
    { session_id: "s1", cwd: "/workspace", hook_event_name: "Stop", permission_mode: "default" },
    { session_id: "s1", cwd: "/workspace", hook_event_name: "SessionEnd", permission_mode: "default" },
  ]);

  const received = [];
  const fetchImpl = async (url, init) => {
    received.push({ url, method: init.method, headers: init.headers, body: init.body });
    return new Response(null, { status: 204 });
  };

  const count = await replay(
    { url: "http://127.0.0.1:4180/hooks/events", tokenFile, scenarioPath, delayMs: 0 },
    { fetchImpl },
  );

  assert.equal(count, 3);
  assert.equal(received.length, 3);
  assert.deepEqual(
    received.map((r) => JSON.parse(r.body).hook_event_name),
    ["SessionStart", "Stop", "SessionEnd"],
  );
  for (const r of received) {
    assert.equal(r.url, "http://127.0.0.1:4180/hooks/events");
    assert.equal(r.method, "POST");
    assert.equal(r.headers["Content-Type"], "application/json");
    assert.equal(r.headers["X-JayStudio-Collect-Token"], token);
  }

  rmSync(dir, { recursive: true, force: true });
});

test("재생 도구: 비 2xx 응답을 받으면 던지고, 이후 줄은 보내지 않는다", async () => {
  const { dir, scenarioPath, tokenFile } = makeTempScenario([
    { session_id: "s1", cwd: "/workspace", hook_event_name: "SessionStart", permission_mode: "default" },
    { session_id: "s1", cwd: "/workspace", hook_event_name: "Stop", permission_mode: "default" },
  ]);

  let callCount = 0;
  const fetchImpl = async () => {
    callCount++;
    return new Response(null, { status: 401 });
  };

  await assert.rejects(
    () =>
      replay(
        { url: "http://127.0.0.1:4180/hooks/events", tokenFile, scenarioPath, delayMs: 0 },
        { fetchImpl },
      ),
    /2xx가 아닌 응답/,
  );
  assert.equal(callCount, 1, "실패한 줄 이후로는 더 보내지 않아야 한다");

  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// --delay-ms: 실제로 기다리지 않고 결정론적으로 검증
// ---------------------------------------------------------------------------

test("--delay-ms: 줄 사이에 지정한 지연을 적용하고, 줄 개수-1번만 호출한다(실제 대기 없음)", async () => {
  const { dir, scenarioPath, tokenFile } = makeTempScenario([
    { session_id: "s1", cwd: "/workspace", hook_event_name: "SessionStart", permission_mode: "default" },
    { session_id: "s1", cwd: "/workspace", hook_event_name: "UserPromptSubmit", permission_mode: "default" },
    { session_id: "s1", cwd: "/workspace", hook_event_name: "Stop", permission_mode: "default" },
  ]);

  const delays = [];
  const delayImpl = async (ms) => {
    delays.push(ms);
    // 실제로 기다리지 않는다 — 결정론적 테스트(지시사항 8).
  };
  const fetchImpl = async () => new Response(null, { status: 204 });

  const count = await replay(
    { url: "http://127.0.0.1:4180/hooks/events", tokenFile, scenarioPath, delayMs: 777 },
    { fetchImpl, delayImpl },
  );

  assert.equal(count, 3);
  assert.deepEqual(delays, [777, 777]);

  rmSync(dir, { recursive: true, force: true });
});

test("--delay-ms 0이면 delayImpl을 호출하지 않는다", async () => {
  const { dir, scenarioPath, tokenFile } = makeTempScenario([
    { session_id: "s1", cwd: "/workspace", hook_event_name: "SessionStart", permission_mode: "default" },
    { session_id: "s1", cwd: "/workspace", hook_event_name: "Stop", permission_mode: "default" },
  ]);

  let delayCalls = 0;
  const delayImpl = async () => {
    delayCalls++;
  };
  const fetchImpl = async () => new Response(null, { status: 204 });

  await replay(
    { url: "http://127.0.0.1:4180/hooks/events", tokenFile, scenarioPath, delayMs: 0 },
    { fetchImpl, delayImpl },
  );

  assert.equal(delayCalls, 0);

  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// CLI 통합 확인: 실제 로컬 스텁 서버 + 실제 프로세스 종료 코드(비 2xx → exit 1)
// ---------------------------------------------------------------------------

/**
 * CLI 자식 프로세스 기한. 스텁 서버는 같은 프로세스에서 즉시 응답하므로 정상 실행은 수십 ms다.
 * 기한을 넘기면 스텁이 멈춘 것이므로 자식을 죽이고 실패시킨다 — 기한이 없으면 `node --test`의
 * 기본 타임아웃도 없어 테스트가 무한 대기한다(T-023 리뷰 Suggestion).
 */
const CLI_TIMEOUT_MS = 10_000;

/**
 * CLI 자식 프로세스를 비동기로 실행한다. `spawnSync`를 쓰면 부모 프로세스의 이벤트 루프가
 * 멈춰서 같은 프로세스 안의 스텁 HTTP 서버가 자식의 요청에 응답하지 못해 교착 상태가 된다 —
 * 반드시 `spawn` + Promise로 이벤트 루프를 계속 돌려야 한다.
 *
 * `CLI_TIMEOUT_MS`를 넘기면 SIGKILL로 끊고 stdout·stderr를 담은 오류로 reject한다.
 */
function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [REPLAY_SCRIPT, ...args], { encoding: "utf8" });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, CLI_TIMEOUT_MS);
    const settle = (finish) => {
      clearTimeout(timer);
      finish();
    };
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (error) => settle(() => reject(error)));
    child.on("close", (status, signal) =>
      settle(() => {
        if (timedOut) {
          reject(
            new Error(
              `CLI가 ${CLI_TIMEOUT_MS}ms 안에 끝나지 않아 SIGKILL로 끊었습니다(signal ${signal}). ` +
                `인자: ${args.join(" ")} / stdout: ${stdout.trim()} / stderr: ${stderr.trim()}`,
            ),
          );
          return;
        }
        resolve({ status, stdout, stderr });
      }),
    );
  });
}

function withStubServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        handler(req, res, body);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

test("CLI: 모든 줄이 204를 받으면 exit 0이고 완료 메시지를 stdout에 남긴다", async () => {
  let requestCount = 0;
  const server = await withStubServer((req, res) => {
    requestCount++;
    res.writeHead(204).end();
  });
  const { dir, scenarioPath, tokenFile } = makeTempScenario([
    { session_id: "s1", cwd: "/workspace", hook_event_name: "SessionStart", permission_mode: "default" },
    { session_id: "s1", cwd: "/workspace", hook_event_name: "Stop", permission_mode: "default" },
  ]);

  try {
    const port = server.address().port;
    const result = await runCli([
      "--url",
      `http://127.0.0.1:${port}/hooks/events`,
      "--token-file",
      tokenFile,
      "--delay-ms",
      "0",
      scenarioPath,
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /재생 완료: 2건 전송/);
    assert.equal(requestCount, 2);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: 비 2xx 응답을 받으면 exit 1이고 사유를 stderr에 남긴다", async () => {
  const server = await withStubServer((req, res) => {
    res.writeHead(401).end();
  });
  const { dir, scenarioPath, tokenFile } = makeTempScenario([
    { session_id: "s1", cwd: "/workspace", hook_event_name: "SessionStart", permission_mode: "default" },
  ]);

  try {
    const port = server.address().port;
    const result = await runCli([
      "--url",
      `http://127.0.0.1:${port}/hooks/events`,
      "--token-file",
      tokenFile,
      "--delay-ms",
      "0",
      scenarioPath,
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /2xx가 아닌 응답/);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
