// Windows 도우미 분기 단위 테스트 (FR-013-AC6·AC7·AC11·AC12·AC13, FR-013-E1~E3)
// wt.exe·wsl.exe를 실행하지 않는다: spawn은 가짜를 주입한다. 토큰 파일은 임시 폴더에서만 만든다.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  HELPER_HOST,
  createHelperServer,
  createOpenTerminal,
  createOpenWindowsTerminal,
  ensureTokenFile,
  parseArgs,
} from '../aojistudio-helper.mjs';
import { WSL_CLAUDE_LAUNCH, buildWtArgs, windowsTokenPath } from '../lib/wt.mjs';

const TOKEN = 'c'.repeat(64);
const ORIGIN = 'http://127.0.0.1:4180';
const DISTRO = 'Ubuntu-24.04';
const WSL_DIR = '/home/jaybee/AojiStudio';

const tempRoot = mkdtempSync(join(tmpdir(), 'aojistudio-helper-win-test-'));
after(() => rmSync(tempRoot, { recursive: true, force: true }));

function createFakeSpawn() {
  const calls = [];
  function fakeSpawn(file, args, options) {
    calls.push({ file, args, options });
    const child = new EventEmitter();
    child.unrefCalled = false;
    child.unref = () => {
      child.unrefCalled = true;
    };
    queueMicrotask(() => child.emit('spawn'));
    return child;
  }
  return { calls, fakeSpawn };
}

async function withWindowsServer(overrides, run) {
  const opened = [];
  const out = [];
  const server = createHelperServer({
    platform: 'windows',
    wslDistro: DISTRO,
    projectDir: WSL_DIR,
    allowedOrigins: overrides.allowedOrigins ?? [ORIGIN],
    token: TOKEN,
    dryRun: overrides.dryRun ?? false,
    openTerminal:
      overrides.openTerminal ??
      (async (wtArgs) => {
        opened.push(wtArgs);
      }),
    stdout: { write: (chunk) => out.push(chunk) },
  });
  await new Promise((resolve) => server.listen(0, HELPER_HOST, resolve));
  try {
    await run({ baseUrl: `http://${HELPER_HOST}:${server.address().port}`, opened, out });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(baseUrl, body, { origin = ORIGIN, token = TOKEN } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin !== null) headers.Origin = origin;
  if (token !== null) headers['X-AojiStudio-Helper-Token'] = token;
  return fetch(`${baseUrl}/open`, { method: 'POST', headers, body: JSON.stringify(body) });
}

test('[FR-013-AC12] 기본 세션 wt 인자 배열', () => {
  assert.deepEqual(buildWtArgs({ distro: DISTRO, projectDir: WSL_DIR }), [
    '-w', '0', 'new-tab', '--title', 'Aoji Studio', 'wsl.exe', '-d', DISTRO, '--cd', WSL_DIR,
    '--', 'bash', '-lic', "'exec", 'claude', '"$@"\'', 'claude',
  ]);
});

test('[FR-013-AC12] 팀장 wt 인자 배열은 --agent <name>이 붙는다', () => {
  assert.deepEqual(buildWtArgs({ distro: DISTRO, projectDir: WSL_DIR, leadName: 'web-develop-tech-lead' }), [
    '-w', '0', 'new-tab', '--title', 'Aoji Studio', 'wsl.exe', '-d', DISTRO, '--cd', WSL_DIR,
    '--', 'bash', '-lic', "'exec", 'claude', '"$@"\'', 'claude',
    '--agent', 'web-develop-tech-lead',
  ]);
});

const AFTER_WSL = (a) => a.slice(a.indexOf('wsl.exe') + 1);
const AFTER_DASH = (a) => a.slice(a.indexOf('--', a.indexOf('wsl.exe')) + 1);

test('[FR-013-AC12] wsl.exe 뒤 원소에 공백·탭·; 없음', () => {
  const args = buildWtArgs({ distro: DISTRO, projectDir: WSL_DIR, leadName: 'lead-a' });
  for (const el of AFTER_WSL(args)) assert.equal(/[\s;]/.test(el), false, el);
  assert.equal(args.slice(0, args.indexOf('wsl.exe')).some((e) => e.includes(';')), false);
});

test('[FR-013-AC12] -- 뒤 원소 공백 잇기 = FR-013-AC1·AC2 꼬리', () => {
  const base = buildWtArgs({ distro: DISTRO, projectDir: WSL_DIR });
  const lead = buildWtArgs({ distro: DISTRO, projectDir: WSL_DIR, leadName: 'lead-a' });
  assert.equal(AFTER_DASH(base).join(' '), `bash -lic 'exec claude "$@"' claude`);
  assert.equal(AFTER_DASH(lead).join(' '), `bash -lic 'exec claude "$@"' claude --agent lead-a`);
});

test('[FR-013-AC11] WSL 스크립트 원소는 고정 상수이고 이름·경로가 들어가지 않는다', () => {
  const lead = buildWtArgs({ distro: DISTRO, projectDir: WSL_DIR, leadName: 'lead-a' });
  const i = lead.indexOf('--', lead.indexOf('wsl.exe'));
  assert.deepEqual(lead.slice(i, i + WSL_CLAUDE_LAUNCH.length), [...WSL_CLAUDE_LAUNCH]);
  assert.equal(Object.isFrozen(WSL_CLAUDE_LAUNCH), true);
  for (const el of WSL_CLAUDE_LAUNCH) {
    assert.equal(el.includes(DISTRO) || el.includes(WSL_DIR) || el.includes('lead-a'), false);
  }
});

test('[FR-013-AC11] spawn 옵션 shell:false·windowsVerbatimArguments 없음', async () => {
  const { calls, fakeSpawn } = createFakeSpawn();
  await createOpenWindowsTerminal(fakeSpawn)(buildWtArgs({ distro: DISTRO, projectDir: WSL_DIR }));
  assert.deepEqual(calls[0].options, { shell: false, detached: true, stdio: 'ignore' });
  assert.equal('windowsVerbatimArguments' in calls[0].options, false);
});

test('[FR-013-AC11] 실행 함수가 wt.exe·배열·shell:false로 spawn을 부른다', async () => {
  const { calls, fakeSpawn } = createFakeSpawn();
  const args = buildWtArgs({ distro: DISTRO, projectDir: WSL_DIR, leadName: 'lead-a' });
  await createOpenWindowsTerminal(fakeSpawn)(args);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'wt.exe');
  assert.deepEqual(calls[0].args, args);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.stdio, 'ignore');
});

test('[FR-013-AC11] 맥북 실행 함수는 그대로 osascript 인자 배열을 쓴다', async () => {
  const { calls, fakeSpawn } = createFakeSpawn();
  await createOpenTerminal(fakeSpawn)('cd "/x" && claude');
  assert.equal(calls[0].file, '/usr/bin/osascript');
  assert.equal(calls[0].options.shell, undefined);
});

test('[FR-013-AC11][FR-013-AC12] 서버가 가짜 spawn으로 wt.exe를 팀장 인자와 함께 부른다', async () => {
  const { calls, fakeSpawn } = createFakeSpawn();
  await withWindowsServer({ openTerminal: createOpenWindowsTerminal(fakeSpawn) }, async ({ baseUrl }) => {
    const response = await post(baseUrl, { target: 'lead', leadName: 'web-develop-tech-lead' });
    assert.equal(response.status, 204);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'wt.exe');
  assert.deepEqual(calls[0].args.slice(-3), ['claude', '--agent', 'web-develop-tech-lead']);
  assert.equal(calls[0].options.shell, false);
});

test('[FR-013-AC6] 요청 본문의 경로·명령 키는 무시된다', async () => {
  await withWindowsServer({}, async ({ baseUrl, opened }) => {
    const response = await post(baseUrl, {
      target: 'default',
      projectDir: '/etc',
      distro: 'Evil',
      command: 'calc.exe',
      args: ['--x'],
      cwd: '/tmp',
    });
    assert.equal(response.status, 204);
    assert.deepEqual(opened, [buildWtArgs({ distro: DISTRO, projectDir: WSL_DIR })]);
    assert.ok(!opened[0].includes('/etc') && !opened[0].includes('Evil') && !opened[0].includes('calc.exe'));
  });
});

test('[FR-013-AC7] Windows 분기도 Origin·토큰을 검사한다 [FR-013-E2] 403', async () => {
  await withWindowsServer({}, async ({ baseUrl, opened }) => {
    const badOrigin = await post(baseUrl, { target: 'default' }, { origin: 'http://127.0.0.1:9999' });
    assert.equal(badOrigin.status, 403);
    assert.equal((await badOrigin.json()).code, 'FORBIDDEN_ORIGIN');

    const noOrigin = await post(baseUrl, { target: 'default' }, { origin: null });
    assert.equal(noOrigin.status, 403);

    const badToken = await post(baseUrl, { target: 'default' }, { token: 'd'.repeat(64) });
    assert.equal(badToken.status, 403);
    assert.equal((await badToken.json()).code, 'UNAUTHORIZED_TOKEN');

    const noToken = await post(baseUrl, { target: 'default' }, { token: null });
    assert.equal(noToken.status, 403);
    assert.deepEqual(opened, []);
  });
});

test('[FR-013-AC7] 허용 Origin 기본값은 http://127.0.0.1:4180', () => {
  const dir = mkdtempSync(join(tempRoot, 'args-'));
  const parsed = parseArgs([
    '--platform', 'windows', '--wsl-distro', DISTRO, '--project-dir', WSL_DIR, '--token-file', join(dir, 't'),
  ]);
  assert.deepEqual(parsed.allowedOrigins, ['http://127.0.0.1:4180']);
  assert.equal(parsed.port, 4181);
  assert.equal(parsed.platform, 'windows');
  assert.equal(parsed.wslDistro, DISTRO);
});

test('[FR-013-E3] leadName a;b · A · 65자는 400 INVALID_NAME, 실행 안 함', async () => {
  await withWindowsServer({}, async ({ baseUrl, opened }) => {
    for (const leadName of ['a;b', 'A', 'a'.repeat(65)]) {
      const response = await post(baseUrl, { target: 'lead', leadName });
      assert.equal(response.status, 400, leadName);
      assert.equal((await response.json()).code, 'INVALID_NAME', leadName);
    }
    assert.deepEqual(opened, []);
  });
});

test('[FR-013-E1] Windows 분기 /health 응답 형식이 맥북과 같다', async () => {
  await withWindowsServer({}, async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/health`, { headers: { Origin: ORIGIN } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, version: '1' });
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
    const denied = await fetch(`${baseUrl}/health`, { headers: { Origin: 'http://127.0.0.1:1' } });
    assert.equal(denied.status, 403);
  });
});

test('[FR-013-AC12] --dry-run은 spawn 없이 DRY-RUN wt.exe 한 줄과 204', async () => {
  const { calls, fakeSpawn } = createFakeSpawn();
  await withWindowsServer(
    { dryRun: true, openTerminal: createOpenWindowsTerminal(fakeSpawn) },
    async ({ baseUrl, out }) => {
      const response = await post(baseUrl, { target: 'lead', leadName: 'lead-a' });
      assert.equal(response.status, 204);
      assert.deepEqual(out, [
        `DRY-RUN wt.exe -w 0 new-tab --title Aoji Studio wsl.exe -d ${DISTRO} --cd ${WSL_DIR} -- bash -lic 'exec claude "$@"' claude --agent lead-a\n`,
      ]);
    },
  );
  assert.equal(calls.length, 0);
});

test('[FR-013-E1] 실행 실패는 500 OPEN_FAILED, 상세 비노출', async () => {
  await withWindowsServer(
    {
      openTerminal: async () => {
        throw new Error('spawn wt.exe ENOENT C:\\secret');
      },
    },
    async ({ baseUrl }) => {
      const response = await post(baseUrl, { target: 'default' });
      assert.equal(response.status, 500);
      const text = await response.text();
      assert.equal(JSON.parse(text).code, 'OPEN_FAILED');
      assert.ok(!text.includes('ENOENT') && !text.includes('secret'));
    },
  );
});

test('[FR-013-AC13] windowsTokenPath 구성', () => {
  assert.equal(
    windowsTokenPath('Ubuntu-24.04', '/home/jaybee/AojiStudio'),
    '\\\\wsl.localhost\\Ubuntu-24.04\\home\\jaybee\\AojiStudio\\.aojistudio\\helper-token',
  );
  assert.equal(
    windowsTokenPath('Ubuntu-24.04', '/home/jaybee/AojiStudio/'),
    '\\\\wsl.localhost\\Ubuntu-24.04\\home\\jaybee\\AojiStudio\\.aojistudio\\helper-token',
  );
});

test('[FR-013-AC13] 기본 --token-file은 windowsTokenPath이고, 토큰 파일이 없으면 만든다', () => {
  const parsed = parseArgs(['--platform', 'windows', '--wsl-distro', DISTRO, '--project-dir', WSL_DIR]);
  assert.equal(parsed.tokenFile, windowsTokenPath(DISTRO, WSL_DIR));

  const tokenFile = join(tempRoot, 'new-dir', '.aojistudio', 'helper-token');
  assert.equal(existsSync(tokenFile), false);
  const stderr = [];
  const token = ensureTokenFile(tokenFile, { enforceMode: false, stderr: { write: (c) => stderr.push(c) } });
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(tokenFile, 'utf8'), token);
  assert.equal(ensureTokenFile(tokenFile, { enforceMode: false }), token);
  assert.deepEqual(stderr, []);
});

test('[FR-013-AC12][FR-013-AC13] Windows 기동 검증 실패 5종', () => {
  const base = ['--platform', 'windows', '--wsl-distro', DISTRO, '--project-dir', WSL_DIR];
  const withArg = (flag, value) => {
    const copy = [...base];
    copy[copy.indexOf(flag) + 1] = value;
    return copy;
  };
  const cases = {
    '배포판 없음': ['--platform', 'windows', '--project-dir', WSL_DIR],
    '배포판 형식 위반(;)': withArg('--wsl-distro', 'Ubuntu;calc'),
    '경로 공백': withArg('--project-dir', '/home/jay bee/AojiStudio'),
    '경로 ; 따옴표': withArg('--project-dir', '/home/a;b"c'),
    '경로 ..': withArg('--project-dir', '/home/jaybee/../etc'),
    '경로 상대': withArg('--project-dir', 'home/jaybee'),
  };
  for (const [name, argv] of Object.entries(cases)) {
    assert.throws(() => parseArgs(argv), Error, name);
  }
  assert.throws(() => parseArgs([...base, '--platform', 'linux']), /--platform/);
  assert.throws(() => parseArgs(['--platform', 'macos', '--wsl-distro', DISTRO, '--project-dir', tempRoot]), /windows/);
});

test('[FR-013-AC12] 맥북 분기 기본 결과는 그대로(platform macos)', () => {
  const dir = join(tempRoot, 'mac');
  mkdirSync(dir, { recursive: true });
  const parsed = parseArgs(['--platform', 'macos', '--project-dir', dir]);
  assert.equal(parsed.platform, 'macos');
  assert.equal(parsed.wslDistro, null);
});

test('[FR-013-AC12] 서버 생성도 잘못된 배포판·경로를 거부한다', () => {
  for (const [wslDistro, projectDir] of [['bad;x', WSL_DIR], [DISTRO, '/a b'], [DISTRO, '/a/../b'], [undefined, WSL_DIR]]) {
    assert.throws(() =>
      createHelperServer({ platform: 'windows', wslDistro, projectDir, allowedOrigins: [ORIGIN], token: TOKEN }),
    );
  }
});
