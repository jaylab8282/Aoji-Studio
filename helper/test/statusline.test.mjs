// 상태줄 연동 스크립트 단위 테스트 (FR-027-AC2·AC3·AC7, ADR-83, conventions.md §3 Helper 다섯 규칙)
// 실제 Claude Code·실제 서버·실제 ~/.claude 는 쓰지 않는다. 가짜 HTTP 서버와 임시 폴더만 쓴다.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { buildBody, isLoopbackHttp, parseArgs, shouldSend, statePath } from '../aojistudio-statusline.mjs';

const HELPER_ROOT = dirname(fileURLToPath(new URL('../aojistudio-statusline.mjs', import.meta.url)));
const SOURCE = join(HELPER_ROOT, 'aojistudio-statusline.mjs');
const FIXTURES = join(HELPER_ROOT, '..', 'tools', 'fixtures', 'statusline');
const MARKER = 'AOJI-MARKER-STATUS-3b1e';
const TOKEN = 'c0ffee'.repeat(10);

const work = mkdtempSync(join(tmpdir(), 'aojistudio-statusline-test-'));
const scriptDir = join(work, 'dot-aojistudio');
const stateTmp = join(work, 'tmp');
const script = join(scriptDir, 'statusline.mjs');
const tokenFile = join(scriptDir, 'collect-token');

let requests = [];
let serverDelayMillis = 0;
let server;
let url;
const openSockets = new Set();

before(async () => {
  mkdirSync(scriptDir, { recursive: true });
  mkdirSync(stateTmp, { recursive: true });
  copyFileSync(SOURCE, script);
  server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8'), method: req.method, path: req.url });
      setTimeout(() => res.writeHead(204).end(), serverDelayMillis);
    });
  });
  server.on('connection', (socket) => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/hooks/statusline`;
});

after(() => {
  for (const socket of openSockets) socket.destroy();
  server.close();
  rmSync(work, { recursive: true, force: true });
});

function reset({ token = true, delayMillis = 0 } = {}) {
  requests = [];
  serverDelayMillis = delayMillis;
  rmSync(stateTmp, { recursive: true, force: true });
  mkdirSync(stateTmp, { recursive: true });
  if (token) writeFileSync(tokenFile, `${TOKEN}\n`);
  else rmSync(tokenFile, { force: true });
}

/** 스크립트를 실행한다. 상태 파일은 TMPDIR(os.tmpdir()) 아래 임시 폴더로 보낸다. */
function run(args, stdin) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, TMPDIR: stateTmp, TMP: stateTmp, TEMP: stateTmp },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let firstOutputAt = null;
    child.stdout.on('data', (chunk) => {
      firstOutputAt ??= performance.now();
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => resolve({ code, stdout, stderr, firstOutputAt, closedAt: performance.now() }));
    child.stdin.end(stdin);
  });
}

async function waitFor(predicate, timeoutMillis = 4000) {
  const deadline = Date.now() + timeoutMillis;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(25);
  }
  return predicate();
}

const full = readFileSync(join(FIXTURES, 'full.json'), 'utf8');
const noLimits = readFileSync(join(FIXTURES, 'no-limits.json'), 'utf8');
const badType = readFileSync(join(FIXTURES, 'bad-type.json'), 'utf8');
const echoStdin = [process.execPath, '-e', 'process.stdin.pipe(process.stdout)'];

test('[FR-027-AC2] 응답이 3초 늦는 서버에서도 출력 뒤 200ms 안에 부모가 종료한다', async () => {
  reset({ delayMillis: 3000 });
  const started = performance.now();
  const result = await run(['--url', url, '--', process.execPath, '-e', "process.stdout.write('OUT')"], full);
  assert.equal(result.stdout, 'OUT');
  assert.equal(result.code, 0);
  assert.ok(result.closedAt - result.firstOutputAt < 200, `출력 뒤 종료까지 ${result.closedAt - result.firstOutputAt}ms`);
  assert.ok(result.closedAt - started < 2500, `전체 ${result.closedAt - started}ms — 전송을 기다리면 3초 이상이다`);
  assert.ok(await waitFor(() => requests.length === 1), '분리 자식이 느린 서버에 전송은 했다');
});

test('[FR-027-AC2] 서버가 없어도 출력은 그대로이고 stderr는 비어 있다', async () => {
  reset();
  const dead = createServer();
  await new Promise((resolve) => dead.listen(0, '127.0.0.1', resolve));
  const deadUrl = `http://127.0.0.1:${dead.address().port}/hooks/statusline`;
  await new Promise((resolve) => dead.close(resolve));
  const result = await run(['--url', deadUrl, '--', process.execPath, '-e', "process.stdout.write('line-1')"], full);
  assert.equal(result.stdout, 'line-1');
  assert.equal(result.stderr, '');
  assert.equal(result.code, 0);
});

test('[FR-027-AC2] 같은 값은 60초 안에 다시 보내지 않고 값이 바뀌면 보낸다, 상태 파일은 os.tmpdir() 아래', async () => {
  reset();
  const args = ['--url', url, '--', ...echoStdin];
  await run(args, full);
  assert.ok(await waitFor(() => requests.length === 1));
  await run(args, full);
  await delay(500);
  assert.equal(requests.length, 1, '같은 값 60초 안 → 전송 0');

  const changed = JSON.parse(full);
  changed.rate_limits.five_hour.used_percentage = 38;
  await run(args, JSON.stringify(changed));
  assert.ok(await waitFor(() => requests.length === 2), '값이 바뀌면 전송');
  assert.equal(JSON.parse(requests[1].body).rate_limits.five_hour.used_percentage, 38);

  const stateFiles = readdirSync(stateTmp);
  assert.equal(stateFiles.length, 1);
  assert.match(stateFiles[0], /^aojistudio-statusline-.+\.json$/);
  assert.equal(readdirSync(scriptDir).sort().join(','), 'collect-token,statusline.mjs', '마운트(스크립트 폴더)에는 상태 파일을 쓰지 않는다');
});

test('[FR-027-AC2] shouldSend: 같은 본문은 60초 미만 false, 60초 이상 true, 다른 본문·상태 없음 true', () => {
  const state = { body: '{"a":1}', sentAt: 1_000_000 };
  assert.equal(shouldSend('{"a":1}', state, 1_000_000 + 59_999), false);
  assert.equal(shouldSend('{"a":1}', state, 1_000_000 + 60_000), true);
  assert.equal(shouldSend('{"a":2}', state, 1_000_001), true);
  assert.equal(shouldSend('{"a":1}', null, 1_000_001), true);
  assert.ok(statePath(1000).startsWith(tmpdir()) || statePath(1000).startsWith(process.env.TMPDIR ?? tmpdir()));
});

test('[FR-027-AC3] 쓰던 명령은 같은 stdin을 받고 출력은 바이트 그대로 나온다', async () => {
  reset();
  const result = await run(['--', ...echoStdin], full);
  assert.equal(result.stdout, full);
  const printer = await run(['--', process.execPath, '-e', "process.stdout.write('A\\u00e9 \\u2588 B')"], full);
  assert.equal(printer.stdout, 'Aé █ B');
});

test('[FR-027-AC3] shell:false — 셸 문자는 해석되지 않고 인자 그대로 전달된다', async () => {
  reset();
  const marker = join(work, 'must-not-exist');
  const literal = `;touch ${marker} $(id) | cat`;
  const result = await run(['--', process.execPath, '-e', 'process.stdout.write(process.argv[1])', literal], full);
  assert.equal(result.stdout, literal);
  assert.equal(existsSync(marker), false);
  const source = readFileSync(SOURCE, 'utf8');
  assert.match(source, /shell: false/);
  assert.doesNotMatch(source, /\bexec(Sync|File|FileSync)?\s*\(/);
  assert.doesNotMatch(source, /shell:\s*true/);
});

test('[FR-027-AC3] 인자 분리 — "--" 앞은 옵션, 뒤는 명령', () => {
  assert.deepEqual(parseArgs(['--url', 'http://127.0.0.1:1/x', '--', 'a', '--url', 'b']), {
    options: { send: false, url: 'http://127.0.0.1:1/x', body: null },
    command: ['a', '--url', 'b'],
  });
  assert.deepEqual(parseArgs(['--url', 'http://127.0.0.1:1/x']).command, []);
});

test('[FR-027-AC3] "--"가 없으면 아무것도 출력하지 않는다(그래도 값은 보낸다)', async () => {
  reset();
  const result = await run(['--url', url], full);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(result.code, 0);
  assert.ok(await waitFor(() => requests.length === 1));
});

test('[FR-027-AC3] 쓰던 명령이 없는 실행 파일이면 출력 없음, stderr 없음', async () => {
  reset();
  const result = await run(['--', join(work, 'no-such-command')], full);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(result.code, 0);
});

test('[FR-027-AC3] 보내는 본문은 세 키만 — 그 밖 키의 표지는 0회', async () => {
  reset();
  assert.ok(full.includes(MARKER), 'fixture에 표지가 있어야 이 테스트가 의미가 있다');
  await run(['--url', url, '--', ...echoStdin], full);
  assert.ok(await waitFor(() => requests.length === 1));
  const [request] = requests;
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['x-aojistudio-collect-token'], TOKEN);
  assert.equal(request.body.includes(MARKER), false);
  assert.deepEqual(JSON.parse(request.body), {
    subscription_type: 'max',
    rate_limits: {
      five_hour: { used_percentage: 37.5, resets_at: 4070908800 },
      seven_day: { used_percentage: 12.25, resets_at: 4071513600 },
    },
  });
});

test('[FR-027-AC3] 한도 키가 없는 입력은 subscription_type만, 형식 오류 입력도 표지 없이 값만', async () => {
  assert.deepEqual(buildBody(noLimits), { subscription_type: 'pro' });
  const bad = buildBody(badType);
  assert.deepEqual(Object.keys(bad).sort(), ['rate_limits', 'subscription_type']);
  assert.equal(JSON.stringify(bad).includes(MARKER), false);
  assert.equal(JSON.stringify(bad).includes('nested'), false, '객체 값은 보내지 않는다');
  assert.equal(buildBody('not json'), null);
  assert.equal(buildBody('[1]'), null);
});

test('[FR-027-AC2] 토큰 파일이 없으면 보내지 않고 조용히 끝난다, JSON이 아닌 입력도 출력은 그대로', async () => {
  reset({ token: false });
  const noToken = await run(['--url', url, '--', ...echoStdin], full);
  assert.equal(noToken.stdout, full);
  assert.equal(noToken.stderr, '');
  await delay(600);
  assert.equal(requests.length, 0);

  reset();
  const notJson = await run(['--url', url, '--', ...echoStdin], 'plain text');
  assert.equal(notJson.stdout, 'plain text');
  await delay(600);
  assert.equal(requests.length, 0);
});

test('[FR-027-AC1] 수집 주소는 http 루프백만 허용한다(토큰이 밖으로 나가지 않는다)', () => {
  assert.equal(isLoopbackHttp('http://127.0.0.1:4180/hooks/statusline'), true);
  assert.equal(isLoopbackHttp('http://localhost:4180/hooks/statusline'), true);
  assert.equal(isLoopbackHttp('https://127.0.0.1:4180/hooks/statusline'), false);
  assert.equal(isLoopbackHttp('http://example.com/hooks/statusline'), false);
  assert.equal(isLoopbackHttp('not a url'), false);
});

test('[FR-027-AC7] 정적 검사 — 스크립트는 .credentials·Anthropic 주소·node: 밖 import가 없다', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.doesNotMatch(source, /\.credentials/);
  assert.doesNotMatch(source, /anthropic/i);
  const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);
  assert.ok(imports.length > 0);
  for (const specifier of imports) assert.match(specifier, /^node:/);
});
