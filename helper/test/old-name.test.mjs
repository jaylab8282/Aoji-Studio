// 옛 이름 거부 테스트 — ADR-62 예외 경로(이 파일만 옛 이름 문자열을 쓴다), NFR-13 ④, FR-013-E2
// 옛 헤더·옛 토큰 폴더·옛 환경 변수·옛 plist가 더 이상 받아들여지지 않음을 확인한다.
// 실제 launchctl·실제 AojiStudio 폴더는 쓰지 않는다: 임시 HOME, 가짜 launchctl, --dry-run만 쓴다.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HELPER_HOST, createHelperServer } from '../aojistudio-helper.mjs';
import { preflightHeaders } from '../lib/cors.mjs';

const HELPER_ROOT = dirname(fileURLToPath(new URL('../aojistudio-helper.mjs', import.meta.url)));
const HELPER_SCRIPT = join(HELPER_ROOT, 'aojistudio-helper.mjs');
const INSTALL_SH = join(HELPER_ROOT, 'install.sh');
const OLD_HEADER = 'X-JayStudio-Helper-Token';
const OLD_DATA_DIR = '.jaystudio';
const OLD_LABEL = 'com.jaystudio.helper';
const OLD_ENV_AGENTS = 'JAYSTUDIO_LAUNCH_AGENTS_DIR';
const ORIGIN = 'http://127.0.0.1:4180';
const TOKEN = 'a'.repeat(64);
const OLD_TOKEN = 'c'.repeat(64);

const tempRoot = mkdtempSync(join(tmpdir(), 'aojistudio-old-name-test-'));
const startedPids = [];

after(() => {
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

function freshDir(name) {
  return mkdtempSync(join(tempRoot, `${name}-`));
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function runHelper(args) {
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
    const started = await Promise.race([listening, exited.then(() => false)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
    const code = await exited;
    return { started, code, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

async function withServer(run) {
  const commands = [];
  const server = createHelperServer({
    projectDir: freshDir('server'),
    allowedOrigins: [ORIGIN],
    token: TOKEN,
    openTerminal: async (command) => {
      commands.push(command);
    },
  });
  await new Promise((resolve) => server.listen(0, HELPER_HOST, resolve));
  try {
    await run({ port: server.address().port, commands });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function runInstall(args, env, home) {
  const base = { ...process.env, HOME: home };
  for (const key of Object.keys(base)) {
    if (key.startsWith('AOJISTUDIO_') || key.startsWith('JAYSTUDIO_')) {
      delete base[key];
    }
  }
  const fakeBin = join(tempRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  const launchctl = join(fakeBin, 'launchctl');
  if (!existsSync(launchctl)) {
    writeFileSync(launchctl, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  }
  return spawnSync('/bin/bash', [INSTALL_SH, ...args], {
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...base, PATH: `${fakeBin}:${base.PATH ?? ''}`, ...env },
  });
}

test("[NFR-13-4][FR-013-E2] 옛 토큰 헤더만 보내면(값이 맞아도) → 403 UNAUTHORIZED_TOKEN, 실행 함수 호출 0", async () => {
  await withServer(async ({ port, commands }) => {
    const response = await fetch(`http://${HELPER_HOST}:${port}/open`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', [OLD_HEADER]: TOKEN },
      body: JSON.stringify({ target: 'default' }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'UNAUTHORIZED_TOKEN');
    assert.deepEqual(commands, []);
  });
});

test("[NFR-13-4][FR-013-AC7] preflight Allow-Headers = 'Content-Type, X-AojiStudio-Helper-Token' 정확히(옛 헤더 이름 없음)", async () => {
  await withServer(async ({ port }) => {
    const response = await fetch(`http://${HELPER_HOST}:${port}/open`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(response.status, 204);
    const allowed = response.headers.get('access-control-allow-headers');
    assert.equal(allowed, 'Content-Type, X-AojiStudio-Helper-Token');
    assert.equal(allowed.includes(OLD_HEADER), false);
    assert.equal(preflightHeaders(ORIGIN)['Access-Control-Allow-Headers'], allowed);
  });
});

test("[NFR-13-4][FR-013-AC8] 옛 토큰 폴더만 있고 기본 토큰 경로 → .aojistudio/helper-token 생성(모드 600), 옛 파일 바이트 불변", async () => {
  const project = freshDir('old-dir-only');
  mkdirSync(join(project, OLD_DATA_DIR));
  const oldFile = join(project, OLD_DATA_DIR, 'helper-token');
  writeFileSync(oldFile, OLD_TOKEN, { mode: 0o600 });
  const before = readFileSync(oldFile);

  const result = await runHelper(['--dry-run', '--port', String(await findFreePort()), '--project-dir', project]);
  assert.equal(result.started, true, result.stderr);
  assert.equal(result.stderr, '');
  const newFile = join(project, '.aojistudio', 'helper-token');
  const created = readFileSync(newFile, 'utf8');
  assert.match(created, /^[0-9a-f]{64}$/);
  assert.notEqual(created, OLD_TOKEN);
  assert.equal(statSync(newFile).mode & 0o777, 0o600);
  assert.deepEqual(readFileSync(oldFile), before);
  assert.deepEqual(readdirSync(join(project, OLD_DATA_DIR)), ['helper-token']);
});

test("[NFR-13-4][FR-013-AC7] install.sh --dry-run(HOME=임시)에 옛 환경 변수만 → 무시하고 plist 경로가 $HOME/Library/LaunchAgents 아래", () => {
  const home = freshDir('home-env');
  const project = freshDir('project-env');
  const oldAgents = freshDir('old-env-agents');
  const result = runInstall(['--project-dir', project, '--dry-run'], { [OLD_ENV_AGENTS]: oldAgents }, home);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stderr.includes(join(home, 'Library', 'LaunchAgents', 'com.aojistudio.helper.plist')), result.stderr);
  assert.equal(result.stderr.includes(oldAgents), false, result.stderr);
  assert.equal(result.stdout.includes(oldAgents), false);
});

test("[NFR-13-4] LaunchAgents에 옛 plist가 있어도 install.sh --dry-run은 exit 0, 그 파일 불변, 출력에 옛 이름 0건", () => {
  const home = freshDir('home-plist');
  const project = freshDir('project-plist');
  const agents = freshDir('agents-plist');
  const oldPlist = join(agents, `${OLD_LABEL}.plist`);
  writeFileSync(oldPlist, '<plist version="1.0"><dict/></plist>');
  const before = readFileSync(oldPlist);

  const result = runInstall(['--project-dir', project, '--dry-run'], { AOJISTUDIO_LAUNCH_AGENTS_DIR: agents }, home);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(oldPlist), before);
  assert.deepEqual(readdirSync(agents), [`${OLD_LABEL}.plist`]);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(/jaystudio|legacy/i.test(output), false, output);
  assert.ok(result.stderr.includes(join(agents, 'com.aojistudio.helper.plist')), result.stderr);
});
