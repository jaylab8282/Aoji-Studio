// install.sh · uninstall.sh 단위 테스트 (FR-013-AC7, NFR-05)
// 실제 설치를 하지 않는다: --dry-run과 인자 검증만 실행하고, PATH 앞에 가짜 launchctl을 놓아
// launchctl이 호출되지 않았음을 확인한다. LaunchAgents 폴더는 임시 폴더로 바꾼다.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
