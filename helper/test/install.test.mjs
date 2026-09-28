// install.sh · uninstall.sh 단위 테스트 (FR-013-AC7, NFR-05)
// 실제 설치를 하지 않는다: --dry-run과 인자 검증만 실행하고, PATH 앞에 가짜 launchctl을 놓아
// launchctl이 호출되지 않았음을 확인한다. LaunchAgents 폴더는 임시 폴더로 바꾼다.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELPER_ROOT = dirname(fileURLToPath(new URL('../jaystudio-helper.mjs', import.meta.url)));
const INSTALL_SH = join(HELPER_ROOT, 'install.sh');
const UNINSTALL_SH = join(HELPER_ROOT, 'uninstall.sh');
const LABEL = 'com.jaystudio.helper';

const tempRoot = mkdtempSync(join(tmpdir(), 'jaystudio-install-test-'));
after(() => rmSync(tempRoot, { recursive: true, force: true }));

// 가짜 launchctl: 호출되면 표시 파일을 남긴다. 실제 launchctl은 실행되지 않는다.
const fakeBin = join(tempRoot, 'bin');
const launchctlMarker = join(tempRoot, 'launchctl-was-called');
mkdirSync(fakeBin, { recursive: true });
writeFileSync(
  join(fakeBin, 'launchctl'),
  `#!/bin/sh\necho "$@" >> '${launchctlMarker}'\nexit 0\n`,
  { mode: 0o755 },
);

const launchAgentsDir = join(tempRoot, 'LaunchAgents');
const projectDir = join(tempRoot, 'JayStudio');
mkdirSync(projectDir, { recursive: true });

function runScript(script, args) {
  return spawnSync('/bin/bash', [script, ...args], {
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      HOME: tempRoot,
      JAYSTUDIO_LAUNCH_AGENTS_DIR: launchAgentsDir,
    },
  });
}

function readProgramArguments(plist) {
  const block = plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  assert.ok(block, 'ProgramArguments 배열이 없습니다');
  return [...block[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((match) => match[1]);
}

test("[FR-013-AC7][NFR-05] install.sh --dry-run은 plist만 출력하고 launchctl·파일을 건드리지 않는다", () => {
  const result = runScript(INSTALL_SH, ['--project-dir', projectDir, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);

  const programArguments = readProgramArguments(result.stdout);
  assert.equal(programArguments[1], join(HELPER_ROOT, 'jaystudio-helper.mjs'));
  assert.deepEqual(programArguments.slice(2), [
    '--project-dir',
    projectDir,
    '--allowed-origins',
    'http://127.0.0.1:4180',
    '--port',
    '4181',
    '--token-file',
    join(projectDir, '.jaystudio', 'helper-token'),
  ]);
  assert.equal(result.stdout.includes('--dry-run'), false);
  assert.match(result.stdout, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(result.stdout, /<key>KeepAlive<\/key>\s*<true\/>/);

  assert.match(result.stderr, /DRY-RUN 아무것도 바꾸지 않습니다/);
  assert.ok(result.stderr.includes(join(launchAgentsDir, `${LABEL}.plist`)));
  assert.match(result.stderr, /launchctl bootstrap/);

  assert.equal(existsSync(launchAgentsDir), false);
  assert.equal(existsSync(launchctlMarker), false);
  assert.deepEqual(readdirSync(projectDir), []);
});

test("[FR-013-AC7] install.sh --dry-run은 포트·허용 Origin 인자를 plist에 반영한다", () => {
  const result = runScript(INSTALL_SH, [
    '--project-dir',
    projectDir,
    '--port',
    '4191',
    '--allowed-origins',
    'http://127.0.0.1:4180,http://127.0.0.1:5173',
    '--token-file',
    join(projectDir, 'custom-token'),
    '--dry-run',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readProgramArguments(result.stdout).slice(2), [
    '--project-dir',
    projectDir,
    '--allowed-origins',
    'http://127.0.0.1:4180,http://127.0.0.1:5173',
    '--port',
    '4191',
    '--token-file',
    join(projectDir, 'custom-token'),
  ]);
  assert.equal(existsSync(launchctlMarker), false);
});

test("[NFR-05] install.sh는 필수·형식 위반 인자를 받으면 아무것도 하지 않고 실패한다", () => {
  const badQuoteDir = join(tempRoot, 'bad"dir');
  mkdirSync(badQuoteDir, { recursive: true });

  const cases = [
    { args: [], pattern: /--project-dir/ },
    { args: ['--project-dir'], pattern: /값이 필요합니다/ },
    { args: ['--project-dir', projectDir, '--unknown'], pattern: /알 수 없는 인자/ },
    { args: ['--project-dir', join(tempRoot, 'no-such-dir'), '--dry-run'], pattern: /찾을 수 없습니다/ },
    { args: ['--project-dir', 'relative/dir', '--dry-run'], pattern: /절대 경로/ },
    { args: ['--project-dir', badQuoteDir, '--dry-run'], pattern: /허용되지 않는 문자/ },
    { args: ['--project-dir', projectDir, '--port', 'abc', '--dry-run'], pattern: /포트 번호가 아닙니다/ },
    { args: ['--project-dir', projectDir, '--port', '70000', '--dry-run'], pattern: /포트 번호가 아닙니다/ },
    { args: ['--project-dir', projectDir, '--node', join(tempRoot, 'no-node'), '--dry-run'], pattern: /node/ },
  ];
  for (const { args, pattern } of cases) {
    const result = runScript(INSTALL_SH, args);
    assert.notEqual(result.status, 0, `args=${args.join(' ')}`);
    assert.match(result.stderr, pattern, `args=${args.join(' ')}`);
    assert.equal(result.stdout.includes('<plist'), false, `args=${args.join(' ')}`);
  }
  assert.equal(existsSync(launchAgentsDir), false);
  assert.equal(existsSync(launchctlMarker), false);
});

test("[NFR-05] uninstall.sh --dry-run은 실행할 명령만 알리고 plist를 지우지 않는다", () => {
  mkdirSync(launchAgentsDir, { recursive: true });
  const plistPath = join(launchAgentsDir, `${LABEL}.plist`);
  writeFileSync(plistPath, '<plist version="1.0"><dict/></plist>');

  const result = runScript(UNINSTALL_SH, ['--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY-RUN 아무것도 바꾸지 않습니다/);
  assert.match(result.stdout, new RegExp(`launchctl bootout gui/\\d+/${LABEL.replace(/\./g, '\\.')}`));
  assert.ok(result.stdout.includes(plistPath));
  assert.equal(existsSync(plistPath), true);
  assert.equal(existsSync(launchctlMarker), false);

  const unknown = runScript(UNINSTALL_SH, ['--unknown']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /알 수 없는 인자/);
  assert.equal(existsSync(plistPath), true);
  assert.equal(existsSync(launchctlMarker), false);

  rmSync(launchAgentsDir, { recursive: true, force: true });
});

// ── [보안] Label 검증 ─────────────────────────────────────────────────────────
// 지우기 전에 검증하는지를 본다: 조작된 label이 가리키는 파일을 미리 만들어 두고,
// 스크립트가 실패한 뒤에도 그 파일이 남아 있는지 확인한다.

const BAD_LABELS = [
  '../victim',
  'com.jaystudio.helper/../victim',
  '/etc/victim',
  '.',
  '..',
  '',
  'has space',
  '-rf',
  'a'.repeat(65),
  'tab\there',
];

test("[보안] 잘못된 label → 아무것도 지우지 않고 실패", () => {
  mkdirSync(launchAgentsDir, { recursive: true });
  // 조작된 label이 겨냥하는 희생 파일. `../victim` → <launchAgentsDir>/../victim.plist
  const victimPath = join(tempRoot, 'victim.plist');
  writeFileSync(victimPath, 'victim');
  const realPlist = join(launchAgentsDir, `${LABEL}.plist`);
  writeFileSync(realPlist, '<plist version="1.0"><dict/></plist>');

  for (const label of BAD_LABELS) {
    for (const extraArgs of [[], ['--dry-run']]) {
      const uninstall = runScript(UNINSTALL_SH, ['--label', label, ...extraArgs]);
      assert.notEqual(uninstall.status, 0, `uninstall label=${JSON.stringify(label)}`);
      assert.match(uninstall.stderr, /--label 값이 올바르지 않습니다|값이 필요합니다/, `uninstall label=${JSON.stringify(label)}`);
      assert.equal(existsSync(victimPath), true, `희생 파일이 지워졌다: label=${JSON.stringify(label)}`);
      assert.equal(existsSync(realPlist), true, `plist가 지워졌다: label=${JSON.stringify(label)}`);
      assert.equal(existsSync(launchctlMarker), false, `launchctl이 호출됐다: label=${JSON.stringify(label)}`);

      const install = runScript(INSTALL_SH, ['--project-dir', projectDir, '--label', label, ...extraArgs]);
      assert.notEqual(install.status, 0, `install label=${JSON.stringify(label)}`);
      assert.match(install.stderr, /--label 값이 올바르지 않습니다|값이 필요합니다/, `install label=${JSON.stringify(label)}`);
      assert.equal(install.stdout.includes('<plist'), false, `install label=${JSON.stringify(label)}`);
      assert.equal(existsSync(victimPath), true, `install이 희생 파일을 건드렸다: label=${JSON.stringify(label)}`);
      assert.equal(existsSync(launchctlMarker), false, `launchctl이 호출됐다: label=${JSON.stringify(label)}`);
    }
  }

  // 정상 label은 계속 동작한다(검증이 지나치게 좁지 않은지 확인).
  for (const label of [LABEL, 'com.example.helper-2', 'Helper_1']) {
    const ok = runScript(UNINSTALL_SH, ['--label', label, '--dry-run']);
    assert.equal(ok.status, 0, `${label}: ${ok.stderr}`);
    assert.ok(ok.stdout.includes(join(launchAgentsDir, `${label}.plist`)));
  }
  assert.equal(existsSync(victimPath), true);
  assert.equal(existsSync(realPlist), true);

  rmSync(victimPath, { force: true });
  rmSync(launchAgentsDir, { recursive: true, force: true });
});

// ── [NFR-05] bootstrap 후 기동 확인 ───────────────────────────────────────────
// 실제 launchd에 등록하지 않는다: PATH 앞의 가짜 launchctl이 호출만 기록하고 아무것도 띄우지 않으므로
// /health 무응답 경로가 그대로 재현된다. 성공 경로는 테스트가 /health 대역 서버를 직접 띄워 만든다.

const verifyRoot = mkdtempSync(join(tmpdir(), 'jaystudio-install-verify-'));
after(() => rmSync(verifyRoot, { recursive: true, force: true }));
const verifyBin = join(verifyRoot, 'bin');
const verifyMarker = join(verifyRoot, 'launchctl-calls');
mkdirSync(verifyBin, { recursive: true });
writeFileSync(
  join(verifyBin, 'launchctl'),
  `#!/bin/sh\necho "$@" >> '${verifyMarker}'\nexit 0\n`,
  { mode: 0o755 },
);
const verifyAgentsDir = join(verifyRoot, 'LaunchAgents');

const VERIFY_ENV = {
  PATH: `${verifyBin}:${process.env.PATH ?? ''}`,
  HOME: verifyRoot,
  JAYSTUDIO_LAUNCH_AGENTS_DIR: verifyAgentsDir,
  JAYSTUDIO_HEALTH_TIMEOUT_SECONDS: '1',
};

/**
 * install.sh를 비동기로 돌린다. spawnSync는 이벤트 루프를 막아 같은 프로세스의
 * /health 대역 서버가 응답할 수 없으므로 여기서는 spawn을 쓴다.
 */
function runInstallWithVerify(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [INSTALL_SH, ...args], {
      env: { ...process.env, ...VERIFY_ENV, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
}

/**
 * 가짜 launchctl이 bootstrap 호출을 기록할 때까지 기다린다. install.sh가 bootstrap **전에**
 * 포트 선점을 확인하므로, 기동 확인 성공 경로의 스텁은 이 시점 뒤에 듣기 시작해야
 * 실제 순서(포트 비어 있음 → 등록 → launchd가 띄움 → /health 응답)와 같아진다.
 */
async function waitForBootstrapCall(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(verifyMarker) && /^bootstrap /m.test(readFileSync(verifyMarker, 'utf8'))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('install.sh가 launchctl bootstrap을 부르지 않았다');
}

/** 임시 포트를 하나 잡았다가 바로 닫아 "아무도 듣지 않는 포트"를 얻는다. */
async function findFreePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("[NFR-05] install.sh는 bootstrap 후 /health 무응답이면 등록을 해제하고 실패한다", async () => {
  const port = await findFreePort();
  const result = await runInstallWithVerify(['--project-dir', projectDir, '--port', String(port)]);

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /도우미가 기동하지 않았습니다/);
  assert.match(result.stderr, new RegExp(`127\\.0\\.0\\.1:${port}/health`));
  assert.equal(result.stdout.includes('설치 완료'), false);
  assert.equal(result.stdout.includes('기동 확인 완료'), false);
  // 로그 파일 경로와 되돌리는 방법을 알려준다.
  assert.ok(result.stderr.includes(join(verifyRoot, 'Library', 'Logs', `${LABEL}.log`)), result.stderr);
  assert.ok(result.stderr.includes(join(verifyAgentsDir, `${LABEL}.plist`)), result.stderr);
  assert.match(result.stderr, /uninstall\.sh/);
  // KeepAlive 재시작 루프를 멈추려고 bootstrap 뒤에 bootout까지 실제로 불렀다.
  const calls = readFileSync(verifyMarker, 'utf8').trim().split('\n');
  const bootstrapIndex = calls.findIndex((line) => line.startsWith('bootstrap '));
  assert.ok(bootstrapIndex >= 0, calls.join(' | '));
  assert.match(calls.at(-1), new RegExp(`^bootout gui/\\d+/${LABEL.replace(/\./g, '\\.')}$`), calls.join(' | '));
  assert.ok(calls.length > bootstrapIndex + 1, calls.join(' | '));

  rmSync(verifyMarker, { force: true });
  rmSync(verifyAgentsDir, { recursive: true, force: true });
});

test("[NFR-05] install.sh는 /health가 응답하면 설치 완료로 끝난다", async () => {
  const healthPaths = [];
  const stub = createServer((request, response) => {
    healthPaths.push(request.url);
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end('{"ok":true,"version":"1"}');
      return;
    }
    response.writeHead(404);
    response.end();
  });
  // 스텁은 launchd가 서비스를 띄우는 자리를 대신하므로 bootstrap 호출 뒤에 듣기 시작한다
  // (install.sh가 bootstrap 전에 포트 선점을 확인한다 — T-FIX-07).
  const port = await findFreePort();
  try {
    const running = runInstallWithVerify(
      ['--project-dir', projectDir, '--port', String(port)],
      { JAYSTUDIO_HEALTH_TIMEOUT_SECONDS: '15' },
    );
    await waitForBootstrapCall();
    await new Promise((resolve) => stub.listen(port, '127.0.0.1', resolve));
    const result = await running;
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /설치 완료/);
    assert.match(result.stdout, /기동 확인 완료/);
    assert.equal(result.stderr.includes('도우미가 기동하지 않았습니다'), false);
    assert.deepEqual(healthPaths, ['/health']);
    assert.equal(existsSync(join(verifyAgentsDir, `${LABEL}.plist`)), true);
    // 마지막 launchctl 호출이 bootstrap이다 — 기동 확인이 통과했으므로 되돌리지 않는다.
    const calls = readFileSync(verifyMarker, 'utf8').trim().split('\n');
    assert.match(calls.at(-1), /^bootstrap gui\/\d+ /, calls.join(' | '));
  } finally {
    stub.closeAllConnections();
    await new Promise((resolve) => stub.close(resolve));
  }
});

test("[NFR-05][T-FIX-07] 포트를 다른 프로세스가 선점했으면 bootstrap 전에 실패하고 '설치 완료'로 끝나지 않는다", async () => {
  // 다른 인자로 이미 돌던 도우미를 흉내낸다: 같은 포트에서 /health에 "ok":true를 돌려주지만
  // 지금 설치하는 서비스가 아니다. 포트만 보는 기동 확인은 이 응답에 속아 설치를 완료로 끝냈다.
  rmSync(verifyMarker, { force: true });
  rmSync(verifyAgentsDir, { recursive: true, force: true });

  const healthPaths = [];
  const squatter = createServer((request, response) => {
    healthPaths.push(request.url);
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end('{"ok":true,"version":"1"}');
  });
  await new Promise((resolve) => squatter.listen(0, '127.0.0.1', resolve));
  const { port } = squatter.address();
  try {
    const result = await runInstallWithVerify(['--project-dir', projectDir, '--port', String(port)]);

    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.includes('설치 완료'), false, result.stdout);
    assert.equal(result.stdout.includes('기동 확인 완료'), false, result.stdout);
    assert.match(result.stderr, new RegExp(`포트 ${port}를 다른 프로세스가 이미 쓰고 있습니다`));
    assert.match(result.stderr, /lsof -nP -iTCP:/);
    assert.match(result.stderr, /uninstall\.sh|--port/);
    assert.ok(result.stderr.includes(join(verifyAgentsDir, `${LABEL}.plist`)), result.stderr);
    // 선점된 포트로는 등록하지 않는다 — 그래야 launchd 재시작 루프가 시작되지 않는다.
    const calls = existsSync(verifyMarker) ? readFileSync(verifyMarker, 'utf8').trim().split('\n') : [];
    assert.equal(
      calls.some((line) => line.startsWith('bootstrap ')),
      false,
      calls.join(' | '),
    );
    // 선점 프로세스의 /health를 기동 확인 근거로 쓰지 않았다.
    assert.deepEqual(healthPaths, []);
  } finally {
    squatter.closeAllConnections();
    await new Promise((resolve) => squatter.close(resolve));
    rmSync(verifyMarker, { force: true });
    rmSync(verifyAgentsDir, { recursive: true, force: true });
  }
});
