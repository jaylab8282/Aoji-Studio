// 열기 도우미 서버 단위 테스트 (FR-013-AC1·AC2·AC7·AC11, FR-013-E2·E3, NFR-04, NFR-05)
// 실제 Terminal.app을 열지 않는다: openTerminal·spawn을 주입해 인자 배열만 확인한다.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { connect, createServer as createNetServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_PORT,
  HELPER_HOST,
  OSASCRIPT_PATH,
  buildOsascriptArgs,
  createHelperServer,
  createOpenTerminal,
  ensureTokenFile,
  parseArgs,
} from '../aojistudio-helper.mjs';

const HELPER_ROOT = dirname(fileURLToPath(new URL('../aojistudio-helper.mjs', import.meta.url)));
const HELPER_SCRIPT = join(HELPER_ROOT, 'aojistudio-helper.mjs');
const TOKEN = 'a'.repeat(64);
const ORIGIN = 'http://127.0.0.1:4180';
const DEV_ORIGIN = 'http://127.0.0.1:5173';

const tempRoot = mkdtempSync(join(tmpdir(), 'aojistudio-helper-test-'));
const startedPids = [];
after(() => {
  // 정리 확인: 시작한 자식 프로세스가 하나도 남아 있지 않아야 한다.
  const alive = startedPids.filter((pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  });
  rmSync(tempRoot, { recursive: true, force: true });
  assert.deepEqual(alive, [], `남은 자식 프로세스: ${alive.join(',')}`);
});

function makeProjectDir(name) {
  const dir = join(tempRoot, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createFakeSpawn() {
  const calls = [];
  function fakeSpawn(file, args, options) {
    calls.push({ file, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('spawn'));
    return child;
  }
  return { calls, fakeSpawn };
}

/** 서버를 127.0.0.1의 임시 포트에 띄우고, 끝나면 반드시 닫는다. */
async function withServer(overrides, run) {
  const commands = [];
  const stdoutChunks = [];
  const server = createHelperServer({
    projectDir: overrides.projectDir,
    allowedOrigins: overrides.allowedOrigins ?? [ORIGIN],
    token: overrides.token ?? TOKEN,
    dryRun: overrides.dryRun ?? false,
    openTerminal:
      overrides.openTerminal ??
      (async (command) => {
        commands.push(command);
      }),
    stdout: { write: (chunk) => stdoutChunks.push(chunk) },
  });
  await new Promise((resolve) => server.listen(0, HELPER_HOST, resolve));
  const context = {
    server,
    commands,
    stdoutChunks,
    baseUrl: `http://${HELPER_HOST}:${server.address().port}`,
  };
  try {
    await run(context);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function openRequest(baseUrl, { origin = ORIGIN, token = TOKEN, body = { target: 'default' }, contentType = 'application/json' } = {}) {
  const headers = {};
  if (origin !== null) headers.Origin = origin;
  if (token !== null) headers['X-AojiStudio-Helper-Token'] = token;
  if (contentType !== null) headers['Content-Type'] = contentType;
  return fetch(`${baseUrl}/open`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test("[FR-013-AC7] Origin 불일치 → 403 실행 안 함 [FR-013-E2]", async () => {
  const projectDir = makeProjectDir('origin-mismatch');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const response = await openRequest(baseUrl, { origin: 'http://127.0.0.1:9999' });
    assert.equal(response.status, 403);
    assert.deepEqual(Object.keys(await response.clone().json()).sort(), ['code', 'message']);
    assert.equal((await response.json()).code, 'FORBIDDEN_ORIGIN');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.deepEqual(commands, []);

    const noOrigin = await openRequest(baseUrl, { origin: null });
    assert.equal(noOrigin.status, 403);
    assert.equal((await noOrigin.json()).code, 'FORBIDDEN_ORIGIN');
    assert.deepEqual(commands, []);
  });
});

test("[FR-013-AC7] 토큰 불일치 → 403 [FR-013-E2]", async () => {
  const projectDir = makeProjectDir('token-mismatch');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const wrong = await openRequest(baseUrl, { token: 'b'.repeat(64) });
    assert.equal(wrong.status, 403);
    assert.equal((await wrong.json()).code, 'UNAUTHORIZED_TOKEN');
    assert.equal(wrong.headers.get('access-control-allow-origin'), ORIGIN);

    const missing = await openRequest(baseUrl, { token: null });
    assert.equal(missing.status, 403);
    assert.equal((await missing.json()).code, 'UNAUTHORIZED_TOKEN');

    const shorter = await openRequest(baseUrl, { token: 'a'.repeat(10) });
    assert.equal(shorter.status, 403);
    assert.deepEqual(commands, []);
  });
});

test("[FR-013-AC7] Origin 허용 목록 인자 반영(기본 4180, 추가 5173)", async () => {
  const projectDir = makeProjectDir('allowed-origins');
  const base = parseArgs(['--project-dir', projectDir]);
  assert.deepEqual(base.allowedOrigins, [ORIGIN]);
  assert.equal(base.port, DEFAULT_PORT);

  const dev = parseArgs([
    '--project-dir',
    projectDir,
    '--allowed-origins',
    `${ORIGIN},${DEV_ORIGIN}`,
  ]);
  assert.deepEqual(dev.allowedOrigins, [ORIGIN, DEV_ORIGIN]);

  await withServer({ projectDir, allowedOrigins: base.allowedOrigins }, async ({ baseUrl }) => {
    const allowed = await fetch(`${baseUrl}/health`, { headers: { Origin: ORIGIN } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { ok: true, version: '1' });
    assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);

    const blocked = await fetch(`${baseUrl}/health`, { headers: { Origin: DEV_ORIGIN } });
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, 'FORBIDDEN_ORIGIN');
  });

  await withServer({ projectDir, allowedOrigins: dev.allowedOrigins }, async ({ baseUrl }) => {
    for (const origin of [ORIGIN, DEV_ORIGIN]) {
      const response = await fetch(`${baseUrl}/health`, { headers: { Origin: origin } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
    }
  });
});

test("[FR-013-AC7] name 'Bad Name' → 400 실행 안 함 [FR-013-E3]", async () => {
  const projectDir = makeProjectDir('bad-name');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    for (const leadName of ['Bad Name', 'dev_lead', 'dev lead', '팀장', 'a'.repeat(65), '', '../x']) {
      const response = await openRequest(baseUrl, { body: { target: 'lead', leadName } });
      assert.equal(response.status, 400, `leadName=${leadName}`);
      assert.equal((await response.json()).code, 'INVALID_NAME', `leadName=${leadName}`);
    }
    assert.deepEqual(commands, []);
  });
});

test("[FR-013-E3] 응답 본문 { code: 'INVALID_NAME', message }", async () => {
  const projectDir = makeProjectDir('invalid-name-body');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const response = await openRequest(baseUrl, { body: { target: 'lead', leadName: 'Bad Name' } });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['code', 'message']);
    assert.equal(body.code, 'INVALID_NAME');
    assert.equal(typeof body.message, 'string');
    assert.ok(body.message.length > 0);
    assert.doesNotMatch(body.message, /Error|at .*:\d+/);

    const shapeError = await openRequest(baseUrl, { body: { target: 'unknown' } });
    assert.equal(shapeError.status, 400);
    assert.equal((await shapeError.json()).code, 'INVALID_BODY');
    assert.deepEqual(commands, []);
  });
});

test("[FR-013-AC1] target default → 'cd \"<dir>\" && claude'", async () => {
  const projectDir = makeProjectDir('target-default');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const response = await openRequest(baseUrl, { body: { target: 'default' } });
    assert.equal(response.status, 204);
    assert.deepEqual(commands, [`cd "${projectDir}" && claude`]);
  });
});

test("[FR-013-AC2] target lead → 'cd \"<dir>\" && claude --agent dev-lead'", async () => {
  const projectDir = makeProjectDir('target-lead');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const response = await openRequest(baseUrl, { body: { target: 'lead', leadName: 'dev-lead' } });
    assert.equal(response.status, 204);
    assert.deepEqual(commands, [`cd "${projectDir}" && claude --agent dev-lead`]);
  });
});

test("[FR-013-AC11] spawn 인자 배열 검증: 실행 파일 '/usr/bin/osascript', shell 옵션 없음, 마지막 인자 == 'cd \"<dir>\" && claude --agent dev-lead'", async () => {
  const projectDir = makeProjectDir('spawn-args');
  const { calls, fakeSpawn } = createFakeSpawn();
  await withServer(
    { projectDir, openTerminal: createOpenTerminal(fakeSpawn) },
    async ({ baseUrl }) => {
      const response = await openRequest(baseUrl, { body: { target: 'lead', leadName: 'dev-lead' } });
      assert.equal(response.status, 204);
    },
  );

  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.file, '/usr/bin/osascript');
  assert.equal(call.file, OSASCRIPT_PATH);
  assert.ok(Array.isArray(call.args));
  assert.equal(call.options.shell, undefined);
  assert.ok(!('shell' in call.options));
  assert.equal(call.args.at(-1), `cd "${projectDir}" && claude --agent dev-lead`);
  assert.deepEqual(call.args.slice(0, -1), [
    '-e',
    'on run argv',
    '-e',
    'tell application "Terminal"',
    '-e',
    'activate',
    '-e',
    'do script (item 1 of argv)',
    '-e',
    'end tell',
    '-e',
    'end run',
  ]);
  assert.deepEqual(buildOsascriptArgs('cd "/x" && claude').at(-1), 'cd "/x" && claude');
});

test("[FR-013-AC11] projectDir에 '\"' 포함 → 기동 실패", () => {
  const badDir = join(tempRoot, 'bad"dir');
  mkdirSync(badDir, { recursive: true });
  assert.ok(statSync(badDir).isDirectory());
  assert.throws(() => parseArgs(['--project-dir', badDir]), /허용되지 않는 문자/);

  const result = spawnSync(process.execPath, [HELPER_SCRIPT, '--project-dir', badDir], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /기동 실패/);
  assert.match(result.stderr, /허용되지 않는 문자/);
  assert.doesNotMatch(result.stdout, /listening/);

  for (const bad of ['/tmp/a`b', '/tmp/a$b', '/tmp/a\\b', '/tmp/a\nb']) {
    assert.throws(() => parseArgs(['--project-dir', bad]), /허용되지 않는 문자/);
  }
});

test("[FR-013-AC11] --dry-run → stdout 'DRY-RUN <command>' 1줄, 204, openTerminal 미호출", async () => {
  const projectDir = makeProjectDir('dry-run');
  const { calls, fakeSpawn } = createFakeSpawn();
  await withServer(
    { projectDir, dryRun: true, openTerminal: createOpenTerminal(fakeSpawn) },
    async ({ baseUrl, stdoutChunks }) => {
      const response = await openRequest(baseUrl, { body: { target: 'lead', leadName: 'dev-lead' } });
      assert.equal(response.status, 204);
      assert.equal(await response.text(), '');
      assert.equal(stdoutChunks.join(''), `DRY-RUN cd "${projectDir}" && claude --agent dev-lead\n`);
      assert.equal(stdoutChunks.join('').trimEnd().split('\n').length, 1);
      assert.equal(calls.length, 0);
    },
  );
});

test("[NFR-04] listen host '127.0.0.1'", async () => {
  const sourceFiles = [
    HELPER_SCRIPT,
    join(HELPER_ROOT, 'lib', 'validate.mjs'),
    join(HELPER_ROOT, 'lib', 'cors.mjs'),
    join(HELPER_ROOT, 'lib', 'plist.mjs'),
    join(HELPER_ROOT, 'install.sh'),
    join(HELPER_ROOT, 'uninstall.sh'),
    join(HELPER_ROOT, 'launchd', 'com.aojistudio.helper.plist.template'),
  ];
  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    assert.equal(source.includes(['0', '0', '0', '0'].join('.')), false, file);
  }
  const helperSource = readFileSync(HELPER_SCRIPT, 'utf8');
  assert.match(helperSource, /HELPER_HOST = '127\.0\.0\.1'/);
  assert.match(helperSource, /server\.listen\(options\.port, HELPER_HOST/);
  assert.equal(HELPER_HOST, '127.0.0.1');

  const projectDir = makeProjectDir('listen-host');
  await withServer({ projectDir }, async ({ server, baseUrl }) => {
    const address = server.address();
    assert.equal(address.address, '127.0.0.1');
    assert.equal(address.family, 'IPv4');
    const response = await fetch(`${baseUrl}/health`, { headers: { Origin: ORIGIN } });
    assert.equal(response.status, 200);
  });
});

test("[NFR-05] 첫 실행 시 helper-token 생성 mode 600 hex 64, 기존 파일 있으면 재사용", () => {
  const projectDir = makeProjectDir('token-file');
  const tokenFile = join(projectDir, '.aojistudio', 'helper-token');
  assert.equal(parseArgs(['--project-dir', projectDir]).tokenFile, tokenFile);

  const created = ensureTokenFile(tokenFile);
  assert.match(created, /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(tokenFile, 'utf8'), created);
  assert.equal(statSync(tokenFile).mode & 0o777, 0o600);

  const reused = ensureTokenFile(tokenFile);
  assert.equal(reused, created);
  assert.equal(readFileSync(tokenFile, 'utf8'), created);

  const emptyFile = join(projectDir, 'empty-token');
  writeFileSync(emptyFile, '', { mode: 0o600 });
  assert.throws(() => ensureTokenFile(emptyFile), /비어 있습니다/);

  const brokenFile = join(projectDir, 'broken-token');
  writeFileSync(brokenFile, 'not-a-token', { mode: 0o600 });
  assert.throws(() => ensureTokenFile(brokenFile), /형식이 올바르지 않습니다/);
});

test("[FR-013-E3] 본문 초과 → 400", async () => {
  // 4096바이트 상한을 넘겨도 소켓이 끊기지 않고 api-spec `/open`의 400 { code: 'INVALID_BODY' }가 온다.
  const projectDir = makeProjectDir('body-too-large');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const padding = 'x'.repeat(8 * 1024);
    const response = await openRequest(baseUrl, {
      body: JSON.stringify({ target: 'default', padding }),
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['code', 'message']);
    assert.equal(body.code, 'INVALID_BODY');
    assert.equal(typeof body.message, 'string');
    assert.doesNotMatch(body.message, /BODY_TOO_LARGE|Error|at .*:\d+/);
    assert.deepEqual(commands, []);

    // 상한 바로 아래(4096바이트)는 정상 처리된다 — 경계가 맞는지 확인한다.
    const underLimit = { target: 'default', padding: '' };
    const overhead = JSON.stringify(underLimit).length;
    underLimit.padding = 'y'.repeat(4096 - overhead);
    const exact = JSON.stringify(underLimit);
    assert.equal(Buffer.byteLength(exact, 'utf8'), 4096);
    const allowed = await openRequest(baseUrl, { body: exact });
    assert.equal(allowed.status, 204);
    assert.deepEqual(commands, [`cd "${projectDir}" && claude`]);

    // 초과 요청 뒤에도 서버는 계속 응답한다(연결만 정리된다).
    const after = await openRequest(baseUrl, { body: { target: 'default' } });
    assert.equal(after.status, 204);
    assert.equal(commands.length, 2);
  });
});

test("[FR-013-E3][T-FIX-07] 2차 상한(1MiB)을 넘는 본문 → 소켓을 끊는다", async () => {
  // 4096B 초과는 400 INVALID_BODY로 끝내지만 남은 본문을 계속 읽어 흘려보내므로, 초대형 본문은
  // 소켓을 오래 붙잡는다. 2차 상한을 넘으면 서버가 소켓을 끊는지 본다(400 경로는 위 테스트가 고정한다).
  const projectDir = makeProjectDir('body-hard-limit');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const port = Number(new URL(baseUrl).port);
    const socket = connect({ host: HELPER_HOST, port });
    let closed = false;
    let received = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      received += chunk;
    });
    socket.on('close', () => {
      closed = true;
    });
    // 서버가 끊은 뒤의 쓰기 오류(EPIPE)는 이 테스트의 기대 결과다.
    socket.on('error', () => {});
    try {
      await once(socket, 'connect');
      const declaredBytes = 4 * 1024 * 1024;
      socket.write(
        `POST /open HTTP/1.1\r\nHost: ${HELPER_HOST}:${port}\r\nOrigin: ${ORIGIN}\r\n` +
          `X-AojiStudio-Helper-Token: ${TOKEN}\r\nContent-Type: application/json\r\n` +
          `Content-Length: ${declaredBytes}\r\nConnection: keep-alive\r\n\r\n`,
      );
      const chunk = Buffer.alloc(64 * 1024, 0x78);
      let sent = 0;
      while (!closed && sent < declaredBytes) {
        socket.write(chunk);
        sent += chunk.length;
        // 이벤트 루프에 양보해 서버 응답·종료를 그 자리에서 받는다(고정 대기 없음).
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (!closed) {
        // 2차 상한이 없으면 keep-alive 소켓이 그대로 열려 있어 여기서 끝난다.
        await Promise.race([once(socket, 'close'), delay(3000, null, { ref: false })]);
      }
      assert.equal(closed, true, `2차 상한(1MiB)을 넘겼는데 소켓이 열려 있다 (보낸 바이트=${sent})`);
      assert.ok(sent > 1024 * 1024, `2차 상한 전에 끊겼다 (보낸 바이트=${sent})`);
      // 끊기 전에 400 INVALID_BODY 응답은 그대로 나갔다(api-spec `/open` 계약 불변).
      assert.match(received, /^HTTP\/1\.1 400 /);
      assert.match(received, /"code":"INVALID_BODY"/);
      assert.deepEqual(commands, []);
    } finally {
      socket.destroy();
    }
  });
});

test("[NFR-05] 기존 토큰 mode 644 → 기동 실패 또는 600 복구 (600 복구를 택했다)", () => {
  const projectDir = makeProjectDir('token-mode');
  const token = 'c'.repeat(64);

  for (const wideMode of [0o644, 0o664, 0o604, 0o666]) {
    const tokenFile = join(projectDir, `token-${wideMode.toString(8)}`);
    writeFileSync(tokenFile, token, { mode: 0o600 });
    chmodSync(tokenFile, wideMode);
    assert.equal(statSync(tokenFile).mode & 0o777, wideMode);

    const notices = [];
    const reused = ensureTokenFile(tokenFile, { stderr: { write: (chunk) => notices.push(chunk) } });
    assert.equal(reused, token, `mode=${wideMode.toString(8)}`);
    assert.equal(statSync(tokenFile).mode & 0o777, 0o600, `mode=${wideMode.toString(8)}`);
    assert.equal(readFileSync(tokenFile, 'utf8'), token);
    // 조용히 넘기지 않는다. 토큰 값은 남기지 않는다(NFR-08).
    assert.equal(notices.length, 1, `mode=${wideMode.toString(8)}`);
    assert.match(notices[0], /권한을 600으로 고쳤습니다/);
    assert.equal(notices[0].includes(token), false);

    // 이미 600이면 아무 말도 하지 않고 그대로 재사용한다.
    const quiet = [];
    assert.equal(ensureTokenFile(tokenFile, { stderr: { write: (chunk) => quiet.push(chunk) } }), token);
    assert.deepEqual(quiet, []);
    assert.equal(statSync(tokenFile).mode & 0o777, 0o600);
  }
});

test("[FR-013-AC7] OPTIONS /open preflight 204 · 허용 헤더, Content-Type 불일치 → 415", async () => {
  const projectDir = makeProjectDir('preflight');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const preflight = await fetch(`${baseUrl}/open`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST');
    assert.equal(
      preflight.headers.get('access-control-allow-headers'),
      'Content-Type, X-AojiStudio-Helper-Token',
    );

    const blocked = await fetch(`${baseUrl}/open`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://127.0.0.1:9999' },
    });
    assert.equal(blocked.status, 403);

    const wrongType = await openRequest(baseUrl, { contentType: 'text/plain' });
    assert.equal(wrongType.status, 415);
    assert.deepEqual(commands, []);
  });
});

test("[FR-013-AC11] osascript 실행 실패 → 500 OPEN_FAILED", async () => {
  const projectDir = makeProjectDir('open-failed');
  const failingSpawn = () => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('error', new Error('ENOENT /usr/bin/osascript')));
    return child;
  };
  await withServer(
    { projectDir, openTerminal: createOpenTerminal(failingSpawn) },
    async ({ baseUrl }) => {
      const response = await openRequest(baseUrl, { body: { target: 'default' } });
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.code, 'OPEN_FAILED');
      assert.doesNotMatch(body.message, /ENOENT|osascript/);
    },
  );
});

// ── 자식 프로세스·스크립트 실행 보조 ────────────────────────────────────────────

const INSTALL_SH = join(HELPER_ROOT, 'install.sh');
const UNINSTALL_SH = join(HELPER_ROOT, 'uninstall.sh');
const OTHER_TOKEN = 'b'.repeat(64);

/** 숫자 7이 들어가지 않는 빈 포트를 고른다(NFR-08 테스트가 타임아웃 값 '7'을 찾기 때문). */
async function findFreePort() {
  for (;;) {
    const server = createNetServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await new Promise((resolve) => server.close(resolve));
    if (!String(port).includes('7')) {
      return port;
    }
  }
}

/**
 * 도우미를 자식 프로세스로 실행한다. 'listening' 줄이 나오거나 종료할 때까지 기다린 뒤
 * 살아 있으면 SIGTERM으로 끝내고 종료를 기다린다. PID는 startedPids에 기록한다.
 * `inspect()`가 있으면 기동된 상태에서 호출한다.
 */
async function runHelper(args, inspect) {
  const child = spawn(process.execPath, [HELPER_SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  startedPids.push(child.pid);
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const exited = new Promise((resolve) => child.once('close', (code) => resolve(code)));
  let listeningResolve;
  const listening = new Promise((resolve) => {
    listeningResolve = resolve;
  });
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes(' listening on ')) {
      listeningResolve(true);
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
  try {
    const outcome = await Promise.race([listening, exited.then(() => false)]);
    let inspected;
    if (outcome === true && inspect !== undefined) {
      inspected = await inspect();
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
    const code = await exited;
    return { started: outcome === true, code, stdout, stderr, inspected };
  } finally {
    clearTimeout(timer);
  }
}

function rawOpen(port, headers, body = { target: 'default' }) {
  return fetch(`http://${HELPER_HOST}:${port}/open`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** install.sh·uninstall.sh를 임시 HOME과 가짜 launchctl로 실행한다. 실제 launchctl은 호출되지 않는다. */
function runShell(script, args, env, home) {
  const base = { ...process.env, HOME: home };
  for (const key of Object.keys(base)) {
    if (key.startsWith('AOJISTUDIO_')) {
      delete base[key];
    }
  }
  const fakeBin = join(tempRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  const launchctl = join(fakeBin, 'launchctl');
  if (!existsSync(launchctl)) {
    writeFileSync(launchctl, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  }
  return spawnSync('/bin/bash', [script, ...args], {
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...base, PATH: `${fakeBin}:${base.PATH ?? ''}`, ...env },
  });
}

// ── 토큰 헤더 X-AojiStudio-Helper-Token 하나 [FR-013-AC7][FR-013-E2] ───────────

test("[FR-013-AC7] X-AojiStudio-Helper-Token 일치 → 204, 실행 함수 1회 호출", async () => {
  const projectDir = makeProjectDir('header-match');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const response = await rawOpen(Number(new URL(baseUrl).port), { 'X-AojiStudio-Helper-Token': TOKEN });
    assert.equal(response.status, 204);
    assert.deepEqual(commands, [`cd "${projectDir}" && claude`]);
  });
});

test("[FR-013-E2] 토큰 헤더 값 불일치 → 403 UNAUTHORIZED_TOKEN, 실행 함수 호출 0", async () => {
  const projectDir = makeProjectDir('header-mismatch');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const response = await rawOpen(Number(new URL(baseUrl).port), { 'X-AojiStudio-Helper-Token': OTHER_TOKEN });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'UNAUTHORIZED_TOKEN');
    assert.deepEqual(commands, []);
  });
});

test("[FR-013-E2] 토큰 헤더 없음 → 403 UNAUTHORIZED_TOKEN, 실행 함수 호출 0", async () => {
  const projectDir = makeProjectDir('header-missing');
  await withServer({ projectDir }, async ({ baseUrl, commands }) => {
    const response = await rawOpen(Number(new URL(baseUrl).port), {});
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'UNAUTHORIZED_TOKEN');
    assert.deepEqual(commands, []);
  });
});

// ── 토큰 파일 생성 [FR-013-AC8] ────────────────────────────────────────────────

test("[FR-013-AC8] 토큰 파일이 없으면 .aojistudio/helper-token 생성(mode 600, hex 64), .aojistudio/ 없으면 만든다 · --token-file 옵션 유지", async () => {
  const project = makeProjectDir('fresh-token');
  const port = await findFreePort();

  const result = await runHelper(['--dry-run', '--port', String(port), '--project-dir', project]);
  assert.equal(result.started, true, result.stderr);
  const tokenFile = join(project, '.aojistudio', 'helper-token');
  assert.match(readFileSync(tokenFile, 'utf8'), /^[0-9a-f]{64}$/);
  assert.equal(statSync(tokenFile).mode & 0o777, 0o600);
  assert.equal(result.stderr, '');

  // --token-file <경로> 지정 시 그 경로의 토큰을 쓰고(옵션 유지) 기본 경로는 만들지 않는다.
  const customProject = makeProjectDir('custom-token');
  const customFile = join(makeProjectDir('custom-token-dir'), 'my-token');
  writeFileSync(customFile, TOKEN, { mode: 0o600 });
  const customPort = await findFreePort();
  const custom = await runHelper(
    ['--dry-run', '--port', String(customPort), '--project-dir', customProject, '--token-file', customFile],
    async () => ({
      custom: (await rawOpen(customPort, { 'X-AojiStudio-Helper-Token': TOKEN })).status,
      other: (await rawOpen(customPort, { 'X-AojiStudio-Helper-Token': OTHER_TOKEN })).status,
    }),
  );
  assert.equal(custom.started, true, custom.stderr);
  assert.deepEqual(custom.inspected, { custom: 204, other: 403 });
  assert.equal(existsSync(join(customProject, '.aojistudio')), false);
});

// ── 출력 전체 마스킹 [NFR-08] ──────────────────────────────────────────────────

test("[NFR-08] 기동 로그·인증 실패·잘못된 name 400·기동 실패·install/uninstall --dry-run 출력에 토큰 값·project-dir·환경 변수 값 0건", async () => {
  const captured = [];

  // 기동 로그 + 인증 실패(403) + 잘못된 name(400). 토큰은 알려진 hex다.
  const project = makeProjectDir('mask-run');
  mkdirSync(join(project, '.aojistudio'));
  writeFileSync(join(project, '.aojistudio', 'helper-token'), TOKEN, { mode: 0o600 });
  const port = await findFreePort();
  const running = await runHelper(['--dry-run', '--port', String(port), '--project-dir', project], async () => {
    const unauthorized = await rawOpen(port, { 'X-AojiStudio-Helper-Token': OTHER_TOKEN });
    const badName = await rawOpen(port, { 'X-AojiStudio-Helper-Token': TOKEN }, { target: 'lead', leadName: 'Bad Name' });
    return { unauthorized: unauthorized.status, badName: badName.status };
  });
  assert.equal(running.started, true, running.stderr);
  assert.deepEqual(running.inspected, { unauthorized: 403, badName: 400 });
  assert.match(running.stdout, /listening on/);
  captured.push(running.stdout, running.stderr);

  // 기동 실패: 없는 project-dir, 잘못된 port
  const missingDir = join(tempRoot, 'mask-no-such-dir');
  const failedDir = await runHelper(['--dry-run', '--port', String(await findFreePort()), '--project-dir', missingDir]);
  assert.equal(failedDir.code, 1);
  assert.match(failedDir.stderr, /기동 실패/);
  captured.push(failedDir.stdout, failedDir.stderr);
  const failedPort = await runHelper(['--dry-run', '--port', 'abc', '--project-dir', project]);
  assert.equal(failedPort.code, 1);
  captured.push(failedPort.stdout, failedPort.stderr);

  // install.sh 조기 실패(잘못된 포트): 환경 변수 값(임시 LaunchAgents 경로, 타임아웃 7)이 나올 이유가 없다.
  const home = makeProjectDir('mask-home');
  const agents = makeProjectDir('mask-agents');
  const earlyFail = runShell(INSTALL_SH, ['--project-dir', project, '--port', 'abc', '--dry-run'], {
    AOJISTUDIO_LAUNCH_AGENTS_DIR: agents,
    AOJISTUDIO_HEALTH_TIMEOUT_SECONDS: '7',
  }, home);
  assert.notEqual(earlyFail.status, 0);
  captured.push(earlyFail.stdout, earlyFail.stderr);
  const badTimeout = runShell(INSTALL_SH, ['--project-dir', project, '--dry-run'], {
    AOJISTUDIO_LAUNCH_AGENTS_DIR: agents,
    AOJISTUDIO_HEALTH_TIMEOUT_SECONDS: '999',
  }, home);
  assert.equal(badTimeout.status, 1);
  assert.match(badTimeout.stderr, /AOJISTUDIO_HEALTH_TIMEOUT_SECONDS 값은 1~120/);
  captured.push(badTimeout.stdout, badTimeout.stderr);

  const everything = captured.join('\n');
  for (const secret of [TOKEN, OTHER_TOKEN]) {
    assert.equal(everything.includes(secret), false, '토큰 값이 출력에 있다');
  }
  for (const dir of [project, missingDir, agents, tempRoot]) {
    assert.equal(everything.includes(dir), false, `절대 경로가 출력에 있다: ${dir}`);
  }
  assert.equal(/(?<![0-9A-Za-z.])7(?![0-9A-Za-z.])/.test(everything), false, '타임아웃 값이 출력에 있다');

  // --dry-run 정상 출력은 plist·경로를 보여 주는 것이 목적이다. 토큰 값(파일 내용)은 읽지도 쓰지도 않는다.
  const installDry = runShell(INSTALL_SH, ['--project-dir', project, '--dry-run'], {}, home);
  assert.equal(installDry.status, 0, installDry.stderr);
  const uninstallDry = runShell(UNINSTALL_SH, ['--dry-run'], {}, home);
  assert.equal(uninstallDry.status, 0, uninstallDry.stderr);
  const dryOutput = [installDry.stdout, installDry.stderr, uninstallDry.stdout, uninstallDry.stderr].join('\n');
  assert.match(dryOutput, /DRY-RUN/);
  for (const secret of [TOKEN, OTHER_TOKEN]) {
    assert.equal(dryOutput.includes(secret), false, '--dry-run 출력에 토큰 값이 있다');
  }
});
