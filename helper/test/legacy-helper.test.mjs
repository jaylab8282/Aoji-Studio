// v1.0.x 호환 단위 테스트 — 옛 토큰 헤더·옛 토큰 경로·shim·stderr 마스킹 (ADR-57, ADR-53)
// 실제 Terminal.app·launchctl·실제 AojiStudio 폴더는 쓰지 않는다. 자식 프로세스는 PID를 기록하고
// 테스트 안에서 반드시 종료하며, 마지막에 모두 사라졌는지 확인한다.

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
import {
  LEGACY_DATA_DIR_NAME,
  LEGACY_ENV_HEALTH_TIMEOUT_SECONDS,
  LEGACY_ENV_LAUNCH_AGENTS_DIR,
  LEGACY_HELPER_LABEL,
  LEGACY_HELPER_SCRIPT_NAME,
  LEGACY_HELPER_TOKEN_HEADER,
  resolveTokenFile,
} from '../lib/legacy.mjs';

const HELPER_ROOT = dirname(fileURLToPath(new URL('../aojistudio-helper.mjs', import.meta.url)));
const NEW_SCRIPT = join(HELPER_ROOT, 'aojistudio-helper.mjs');
const SHIM_SCRIPT = join(HELPER_ROOT, LEGACY_HELPER_SCRIPT_NAME);
const INSTALL_SH = join(HELPER_ROOT, 'install.sh');
const UNINSTALL_SH = join(HELPER_ROOT, 'uninstall.sh');
const LEGACY_ENV_PREFIX = `${LEGACY_ENV_LAUNCH_AGENTS_DIR.split('_')[0]}_`;
const NEW_HEADER = 'X-AojiStudio-Helper-Token';
const ORIGIN = 'http://127.0.0.1:4180';
const TOKEN = 'a'.repeat(64);
const OTHER_TOKEN = 'b'.repeat(64);

const tempRoot = mkdtempSync(join(tmpdir(), 'aojistudio-legacy-helper-test-'));
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

function freshProject(name) {
  const dir = mkdtempSync(join(tempRoot, `${name}-`));
  return dir;
}

/** 숫자 7이 들어가지 않는 빈 포트를 고른다(마스킹 테스트가 환경 변수 값 '7'을 찾기 때문). */
async function findFreePort() {
  for (;;) {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await new Promise((resolve) => server.close(resolve));
    if (!String(port).includes('7')) {
      return port;
    }
  }
}

/**
 * 도우미 스크립트를 자식 프로세스로 실행한다. 'listening' 줄이 나오거나 종료할 때까지 기다린 뒤
 * 살아 있으면 SIGTERM으로 끝내고 종료를 기다린다. PID는 startedPids에 기록한다.
 * `inspect(child)`가 있으면 기동된 상태에서 호출한다.
 */
async function runHelper(script, args, inspect) {
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
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
    return { started: outcome === true, code, stdout, stderr, pid: child.pid, inspected };
  } finally {
    clearTimeout(timer);
  }
}

function openRequest(port, headers) {
  return fetch(`http://${HELPER_HOST}:${port}/open`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ target: 'default' }),
  });
}

// ── 토큰 헤더 두 이름 [FR-013-AC7][FR-013-E2][ADR-57] ──────────────────────────

async function withServer(run) {
  const projectDir = freshProject('headers');
  const commands = [];
  const server = createHelperServer({
    projectDir,
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

test("[FR-013-AC7][ADR-57] X-AojiStudio-Helper-Token 일치 → 204 실행", async () => {
  await withServer(async ({ port, commands }) => {
    const response = await openRequest(port, { [NEW_HEADER]: TOKEN });
    assert.equal(response.status, 204);
    assert.equal(commands.length, 1);
  });
});

test("[FR-013-AC7][ADR-57] 옛 X-JayStudio-Helper-Token 일치 → 204 실행(v1.0.x 브라우저)", async () => {
  await withServer(async ({ port, commands }) => {
    const response = await openRequest(port, { [LEGACY_HELPER_TOKEN_HEADER]: TOKEN });
    assert.equal(response.status, 204);
    assert.equal(commands.length, 1);
  });
});

test("[FR-013-E2][ADR-57] 새 헤더 불일치 → 403 UNAUTHORIZED_TOKEN, 옛 헤더가 맞아도 새 헤더만 검사해 실행 안 함", async () => {
  await withServer(async ({ port, commands }) => {
    const both = await openRequest(port, { [NEW_HEADER]: OTHER_TOKEN, [LEGACY_HELPER_TOKEN_HEADER]: TOKEN });
    assert.equal(both.status, 403);
    assert.equal((await both.json()).code, 'UNAUTHORIZED_TOKEN');

    const newOnlyWrong = await openRequest(port, { [NEW_HEADER]: OTHER_TOKEN });
    assert.equal(newOnlyWrong.status, 403);
    assert.equal(commands.length, 0);
  });
});

test("[FR-013-E2][ADR-57] 옛 헤더 불일치·헤더 없음 → 403, 실행 안 함", async () => {
  await withServer(async ({ port, commands }) => {
    const legacyWrong = await openRequest(port, { [LEGACY_HELPER_TOKEN_HEADER]: OTHER_TOKEN });
    assert.equal(legacyWrong.status, 403);
    assert.equal((await legacyWrong.json()).code, 'UNAUTHORIZED_TOKEN');
    const none = await openRequest(port, {});
    assert.equal(none.status, 403);
    assert.equal(commands.length, 0);
  });
});

test("[FR-013-AC7][ADR-57] preflight Allow-Headers에 두 이름이 모두 있다", async () => {
  await withServer(async ({ port }) => {
    const response = await fetch(`http://${HELPER_HOST}:${port}/open`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(response.status, 204);
    const allowed = response.headers.get('access-control-allow-headers');
    assert.equal(allowed, `Content-Type, ${LEGACY_HELPER_TOKEN_HEADER}, ${NEW_HEADER}`);
    assert.equal(preflightHeaders(ORIGIN)['Access-Control-Allow-Headers'], allowed);
  });
});

// ── 토큰 경로 [ADR-57] ─────────────────────────────────────────────────────────

test("[ADR-57] resolveTokenFile(순수): 재지정 / 옛 경로 유지 / 선생성 금지 / 그 밖은 그대로", () => {
  const project = '/virtual/project';
  const legacyFile = join(project, LEGACY_DATA_DIR_NAME, 'helper-token');
  const newFile = join(project, '.aojistudio', 'helper-token');
  const dirs = (...present) => (path) => present.includes(path);

  assert.deepEqual(
    resolveTokenFile({ projectDir: project, tokenFile: legacyFile, isDirectory: dirs(join(project, '.aojistudio')) }),
    { tokenFile: newFile, notice: 'redirected', refuse: false },
  );
  assert.deepEqual(
    resolveTokenFile({ projectDir: project, tokenFile: legacyFile, isDirectory: dirs() }),
    { tokenFile: legacyFile, notice: 'kept', refuse: false },
  );
  assert.deepEqual(
    resolveTokenFile({ projectDir: project, tokenFile: newFile, isDirectory: dirs(join(project, LEGACY_DATA_DIR_NAME)) }),
    { tokenFile: newFile, notice: null, refuse: true },
  );
  assert.deepEqual(
    resolveTokenFile({ projectDir: project, tokenFile: newFile, isDirectory: dirs() }),
    { tokenFile: newFile, notice: null, refuse: false },
  );
  assert.deepEqual(
    resolveTokenFile({ projectDir: project, tokenFile: '/elsewhere/custom-token', isDirectory: dirs(join(project, LEGACY_DATA_DIR_NAME)) }),
    { tokenFile: '/elsewhere/custom-token', notice: null, refuse: false },
  );
});

test("[ADR-57] --token-file <p>/옛 폴더/helper-token + <p>/.aojistudio/ 있음 → .aojistudio/helper-token 사용 + stderr [legacy] helper-token-path", async () => {
  const project = freshProject('redirect');
  mkdirSync(join(project, '.aojistudio'));
  writeFileSync(join(project, '.aojistudio', 'helper-token'), TOKEN, { mode: 0o600 });
  mkdirSync(join(project, LEGACY_DATA_DIR_NAME));
  writeFileSync(join(project, LEGACY_DATA_DIR_NAME, 'helper-token'), OTHER_TOKEN, { mode: 0o600 });
  const port = await findFreePort();

  const result = await runHelper(
    NEW_SCRIPT,
    ['--dry-run', '--port', String(port), '--project-dir', project, '--token-file', join(project, LEGACY_DATA_DIR_NAME, 'helper-token')],
    async () => {
      const withNew = await openRequest(port, { [LEGACY_HELPER_TOKEN_HEADER]: TOKEN });
      const withOld = await openRequest(port, { [LEGACY_HELPER_TOKEN_HEADER]: OTHER_TOKEN });
      return { newFileToken: withNew.status, oldFileToken: withOld.status };
    },
  );
  assert.equal(result.started, true, result.stderr);
  assert.deepEqual(result.inspected, { newFileToken: 204, oldFileToken: 403 });
  assert.match(result.stderr, /^aojistudio-helper: \[legacy\] helper-token-path · /m);
  assert.equal(result.stderr.trim().split('\n').length, 1, result.stderr);
  assert.equal(readFileSync(join(project, LEGACY_DATA_DIR_NAME, 'helper-token'), 'utf8'), OTHER_TOKEN);
});

test("[ADR-57] .aojistudio/ 없음 → 옛 경로 그대로 사용 + [legacy] helper-token-path 경고, .aojistudio/ 생성 0", async () => {
  const project = freshProject('kept');
  mkdirSync(join(project, LEGACY_DATA_DIR_NAME));
  writeFileSync(join(project, LEGACY_DATA_DIR_NAME, 'helper-token'), TOKEN, { mode: 0o600 });
  const port = await findFreePort();

  const result = await runHelper(
    NEW_SCRIPT,
    ['--dry-run', '--port', String(port), '--project-dir', project, '--token-file', join(project, LEGACY_DATA_DIR_NAME, 'helper-token')],
    async () => (await openRequest(port, { [LEGACY_HELPER_TOKEN_HEADER]: TOKEN })).status,
  );
  assert.equal(result.started, true, result.stderr);
  assert.equal(result.inspected, 204);
  assert.match(result.stderr, /^aojistudio-helper: \[legacy\] helper-token-path · /m);
  assert.equal(existsSync(join(project, '.aojistudio')), false);
});

test("[ADR-57] 기본 경로인데 옛 폴더만 있음 → 기동 실패(exit 1), .aojistudio/ 생성 0", async () => {
  const project = freshProject('refuse');
  mkdirSync(join(project, LEGACY_DATA_DIR_NAME));
  const port = await findFreePort();

  const result = await runHelper(NEW_SCRIPT, ['--dry-run', '--port', String(port), '--project-dir', project]);
  assert.equal(result.started, false);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /^aojistudio-helper 기동 실패: Aoji Studio 서버\(v1\.0\.1\)를 먼저 기동해 /);
  assert.equal(existsSync(join(project, '.aojistudio')), false);
  assert.deepEqual(readdirSync(project), [LEGACY_DATA_DIR_NAME]);
});

test("[ADR-57] 둘 다 없음 → .aojistudio/helper-token 생성(mode 600, hex 64), 경고 없음", async () => {
  const project = freshProject('fresh');
  const port = await findFreePort();

  const result = await runHelper(NEW_SCRIPT, ['--dry-run', '--port', String(port), '--project-dir', project]);
  assert.equal(result.started, true, result.stderr);
  const tokenFile = join(project, '.aojistudio', 'helper-token');
  assert.match(readFileSync(tokenFile, 'utf8'), /^[0-9a-f]{64}$/);
  assert.equal(statSync(tokenFile).mode & 0o777, 0o600);
  assert.equal(result.stderr, '');
  assert.equal(existsSync(join(project, LEGACY_DATA_DIR_NAME)), false);
});

// ── shim [ADR-57] ──────────────────────────────────────────────────────────────

test("[ADR-57] shim 옛 스크립트 → stderr [legacy] helper-script 1줄, stdout 'aojistudio-helper listening … (dry-run)', 프로세스 정리", async () => {
  const project = freshProject('shim');
  const port = await findFreePort();

  const result = await runHelper(SHIM_SCRIPT, ['--dry-run', '--port', String(port), '--project-dir', project]);
  assert.equal(result.started, true, result.stderr);
  assert.equal(result.stdout, `aojistudio-helper listening on http://127.0.0.1:${port} (dry-run)\n`);
  const lines = result.stderr.trim().split('\n');
  assert.equal(lines.length, 1, result.stderr);
  assert.match(lines[0], /^aojistudio-helper: \[legacy\] helper-script · .* · v1\.1\.0에서 제거됩니다$/);
  assert.equal(Number.isInteger(result.pid), true);
  assert.throws(() => process.kill(result.pid, 0), '종료된 PID여야 한다');
});

test("[ADR-57] shim도 기동 실패는 같은 인자 검증으로 exit 1(스택 없음)", () => {
  const result = spawnSync(process.execPath, [SHIM_SCRIPT, '--dry-run', '--port', 'abc', '--project-dir', tempRoot], { encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[legacy\] helper-script/);
  assert.match(result.stderr, /aojistudio-helper 기동 실패: --port 값이 포트 번호가 아닙니다/);
  assert.equal(result.stderr.includes('    at '), false);
});

// ── stderr 일괄 마스킹 [NFR-08][ADR-53] ────────────────────────────────────────

function runShell(script, args, env) {
  const base = { ...process.env, HOME: tempRoot };
  for (const key of Object.keys(base)) {
    if (key.startsWith('AOJISTUDIO_') || key.startsWith(LEGACY_ENV_PREFIX)) {
      delete base[key];
    }
  }
  const fakeBin = join(tempRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  const launchctl = join(fakeBin, 'launchctl');
  if (!existsSync(launchctl)) {
    // 실제 launchctl이 호출되면 안 된다: --dry-run·조기 실패 경로만 쓰지만 만약을 위해 가짜를 앞에 둔다.
    writeFileSync(launchctl, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  }
  const result = spawnSync('/bin/bash', [script, ...args], {
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...base, PATH: `${fakeBin}:${base.PATH ?? ''}`, ...env },
  });
  return result;
}

test("[NFR-08][ADR-53] stderr 전 종류 일괄 — 토큰 값·project-dir 절대 경로·환경 변수 값 0건", async () => {
  const captured = [];
  const secrets = new Set([TOKEN, OTHER_TOKEN]);
  const projectDirs = [];

  // helper-script(shim) + helper-token-path(재지정) — 알려진 토큰 hex가 든 파일을 읽는다.
  const redirectProject = freshProject('mask-redirect');
  projectDirs.push(redirectProject);
  mkdirSync(join(redirectProject, '.aojistudio'));
  writeFileSync(join(redirectProject, '.aojistudio', 'helper-token'), TOKEN, { mode: 0o600 });
  const redirectPort = await findFreePort();
  const redirected = await runHelper(SHIM_SCRIPT, [
    '--dry-run', '--port', String(redirectPort), '--project-dir', redirectProject,
    '--token-file', join(redirectProject, LEGACY_DATA_DIR_NAME, 'helper-token'),
  ]);
  assert.equal(redirected.started, true, redirected.stderr);
  assert.match(redirected.stderr, /\[legacy\] helper-script/);
  assert.match(redirected.stderr, /\[legacy\] helper-token-path · .*재지정/);
  captured.push(redirected.stdout, redirected.stderr);

  // helper-token-path(옛 경로 그대로)
  const keptProject = freshProject('mask-kept');
  projectDirs.push(keptProject);
  mkdirSync(join(keptProject, LEGACY_DATA_DIR_NAME));
  writeFileSync(join(keptProject, LEGACY_DATA_DIR_NAME, 'helper-token'), OTHER_TOKEN, { mode: 0o600 });
  const keptPort = await findFreePort();
  const kept = await runHelper(NEW_SCRIPT, [
    '--dry-run', '--port', String(keptPort), '--project-dir', keptProject,
    '--token-file', join(keptProject, LEGACY_DATA_DIR_NAME, 'helper-token'),
  ]);
  assert.equal(kept.started, true, kept.stderr);
  assert.match(kept.stderr, /\[legacy\] helper-token-path · .*그대로/);
  captured.push(kept.stdout, kept.stderr);

  // 기동 실패 메시지(옛 폴더만 있음)
  const refuseProject = freshProject('mask-refuse');
  projectDirs.push(refuseProject);
  mkdirSync(join(refuseProject, LEGACY_DATA_DIR_NAME));
  writeFileSync(join(refuseProject, LEGACY_DATA_DIR_NAME, 'helper-token'), TOKEN, { mode: 0o600 });
  const refused = await runHelper(NEW_SCRIPT, ['--dry-run', '--port', String(await findFreePort()), '--project-dir', refuseProject]);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /기동 실패/);
  captured.push(refused.stdout, refused.stderr);

  // env(옛 변수 사용 중 / 무시) · launchd-label — 스크립트. 값: 임시 LaunchAgents 폴더 경로, 7.
  const envProject = freshProject('mask-env');
  projectDirs.push(envProject);
  const legacyAgents = freshProject('mask-legacy-agents');
  const newAgents = freshProject('mask-new-agents');
  const envValues = [legacyAgents, newAgents, '7'];
  // 포트 오류로 일찍 끝나므로 stdout·stderr 전체에 경로가 나올 이유가 없다 → 전체를 검사한다.
  const early = runShell(INSTALL_SH, ['--project-dir', envProject, '--port', 'abc', '--dry-run'], {
    [LEGACY_ENV_LAUNCH_AGENTS_DIR]: legacyAgents,
    [LEGACY_ENV_HEALTH_TIMEOUT_SECONDS]: '7',
  });
  assert.notEqual(early.status, 0);
  assert.match(early.stderr, /install\.sh: \[legacy\] env · .* 사용 중/);
  captured.push(early.stdout, early.stderr);
  const ignored = runShell(INSTALL_SH, ['--project-dir', envProject, '--port', 'abc', '--dry-run'], {
    AOJISTUDIO_LAUNCH_AGENTS_DIR: newAgents,
    [LEGACY_ENV_LAUNCH_AGENTS_DIR]: legacyAgents,
    AOJISTUDIO_HEALTH_TIMEOUT_SECONDS: '5',
    [LEGACY_ENV_HEALTH_TIMEOUT_SECONDS]: '7',
  });
  assert.match(ignored.stderr, /install\.sh: \[legacy\] env · .* 무시/);
  captured.push(ignored.stdout, ignored.stderr);

  // 정상 dry-run은 plist·경로를 출력하는 것이 목적이므로 [legacy] 경고 줄만 모은다.
  const happy = runShell(INSTALL_SH, ['--project-dir', envProject, '--dry-run'], {
    [LEGACY_ENV_LAUNCH_AGENTS_DIR]: legacyAgents,
    [LEGACY_ENV_HEALTH_TIMEOUT_SECONDS]: '7',
  });
  assert.equal(happy.status, 0, happy.stderr);
  captured.push(...happy.stderr.split('\n').filter((line) => line.includes('[legacy]')));

  // launchd-label: 옛 plist가 있는 폴더에서 install(거부)·uninstall(안내).
  const oldPlistAgents = freshProject('mask-old-plist');
  writeFileSync(join(oldPlistAgents, `${LEGACY_HELPER_LABEL}.plist`), '<plist version="1.0"><dict/></plist>');
  envValues.push(oldPlistAgents);
  const labelInstall = runShell(INSTALL_SH, ['--project-dir', envProject, '--dry-run'], { AOJISTUDIO_LAUNCH_AGENTS_DIR: oldPlistAgents });
  assert.equal(labelInstall.status, 1);
  assert.match(labelInstall.stderr, /install\.sh: \[legacy\] launchd-label/);
  captured.push(labelInstall.stdout, labelInstall.stderr);
  const labelUninstall = runShell(UNINSTALL_SH, ['--dry-run'], { AOJISTUDIO_LAUNCH_AGENTS_DIR: oldPlistAgents });
  assert.match(labelUninstall.stderr, /uninstall\.sh: \[legacy\] launchd-label/);
  captured.push(...labelUninstall.stderr.split('\n').filter((line) => line.includes('[legacy]')));

  // 설치 거부(옛 폴더만 있음) 메시지
  const legacyOnly = freshProject('mask-install-refuse');
  projectDirs.push(legacyOnly);
  mkdirSync(join(legacyOnly, LEGACY_DATA_DIR_NAME));
  const refuseInstall = runShell(INSTALL_SH, ['--project-dir', legacyOnly, '--dry-run'], { AOJISTUDIO_LAUNCH_AGENTS_DIR: newAgents });
  assert.equal(refuseInstall.status, 1);
  captured.push(refuseInstall.stdout, refuseInstall.stderr);

  const everything = captured.join('\n');
  assert.match(everything, /\[legacy\] /);
  for (const secret of secrets) {
    assert.equal(everything.includes(secret), false, '토큰 값이 출력에 있다');
  }
  for (const dir of projectDirs) {
    assert.equal(everything.includes(dir), false, `project-dir 절대 경로가 출력에 있다: ${dir}`);
  }
  for (const value of envValues) {
    // '7' 같은 짧은 값은 127.0.0.1·포트 번호의 일부와 구분하기 위해 단독 토큰(앞뒤가 영숫자·점이 아님)으로 찾는다.
    const found =
      value.length > 3
        ? everything.includes(value)
        : new RegExp(`(?<![0-9A-Za-z.])${value}(?![0-9A-Za-z.])`).test(everything);
    assert.equal(found, false, `환경 변수 값이 출력에 있다: ${value}`);
  }
  assert.equal(everything.includes(tempRoot), false, '임시 루트 절대 경로가 출력에 있다');
});
