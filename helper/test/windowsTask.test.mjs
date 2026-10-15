// Windows 작업 스케줄러 XML 단위 테스트 (FR-013-AC12, ADR-78 결정 4)
// 등록·실행은 하지 않는다. 문자열 생성과 CLI 출력만 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildTaskXml, parseTaskArgs } from '../lib/windowsTask.mjs';

const OPTIONS = Object.freeze({
  nodePath: 'C:\\Program Files\\nodejs\\node.exe',
  helperPath: 'C:\\Users\\Jay Bee\\AppData\\Local\\AojiStudio\\helper\\aojistudio-helper.mjs',
  distro: 'Ubuntu-24.04',
  projectDir: '/home/jaybee/AojiStudio',
  allowedOrigins: 'http://127.0.0.1:4180',
  port: 4181,
  userId: 'DESKTOP-ABC\\jay',
});
const TASK_SCRIPT = fileURLToPath(new URL('../lib/windowsTask.mjs', import.meta.url));

test('[FR-013-AC12] 작업 XML: 로그온 트리거·InteractiveToken·LeastPrivilege·IgnoreNew', () => {
  const xml = buildTaskXml(OPTIONS);
  assert.match(xml, /<LogonTrigger>/);
  assert.match(xml, /<UserId>DESKTOP-ABC\\jay<\/UserId>/);
  assert.match(xml, /<LogonType>InteractiveToken<\/LogonType>/);
  assert.match(xml, /<RunLevel>LeastPrivilege<\/RunLevel>/);
  assert.match(xml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
  assert.match(xml, /<URI>\\AojiStudio\\aojistudio-helper<\/URI>/);
});

test('[FR-013-AC12] 작업 XML 동작: powershell.exe -File start-helper.ps1 -Distro -ProjectDir -AllowedOrigins -Port 4181', () => {
  const xml = buildTaskXml(OPTIONS);
  assert.match(xml, /<Command>powershell\.exe<\/Command>/);
  const args = xml.match(/<Arguments>([^<]*)<\/Arguments>/)[1].replaceAll('&quot;', '"');
  assert.equal(
    args,
    '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass ' +
      '-File "C:\\Users\\Jay Bee\\AppData\\Local\\AojiStudio\\helper\\windows\\start-helper.ps1" ' +
      '-Distro Ubuntu-24.04 -ProjectDir /home/jaybee/AojiStudio -AllowedOrigins http://127.0.0.1:4180 ' +
      '-Port 4181 -NodePath "C:\\Program Files\\nodejs\\node.exe"',
  );
});

test('[FR-013-AC12] --dry-run은 작업 정의 어디에도 0회', () => {
  assert.equal(buildTaskXml(OPTIONS).includes('dry-run'), false);
  assert.equal(buildTaskXml(OPTIONS).toLowerCase().includes('dryrun'), false);
});

test('[FR-013-AC12] 작업 XML 입력 검증: 잘못된 값은 던진다', () => {
  const bad = [
    { distro: 'Ubuntu;x' },
    { projectDir: '/home/a b' },
    { projectDir: '/home/../etc' },
    { port: 0 },
    { port: '70000' },
    { allowedOrigins: '*' },
    { nodePath: 'node.exe' },
    { helperPath: 'relative\\x.mjs' },
    { nodePath: 'C:\\a"b\\node.exe' },
    { userId: 'a"b' },
  ];
  for (const override of bad) {
    assert.throws(() => buildTaskXml({ ...OPTIONS, ...override }), Error, JSON.stringify(override));
  }
});

test('[FR-013-AC12] 사용자 ID의 XML 특수 문자는 이스케이프된다', () => {
  const xml = buildTaskXml({ ...OPTIONS, userId: 'PC\\a&b' });
  assert.match(xml, /<UserId>PC\\a&amp;b<\/UserId>/);
});

test('[FR-013-AC12] --print-xml CLI는 같은 XML을 stdout에 쓴다', () => {
  const result = spawnSync(
    process.execPath,
    [
      TASK_SCRIPT, '--print-xml',
      '--node', OPTIONS.nodePath, '--helper', OPTIONS.helperPath, '--distro', OPTIONS.distro,
      '--project-dir', OPTIONS.projectDir, '--allowed-origins', OPTIONS.allowedOrigins,
      '--port', '4181', '--user-id', OPTIONS.userId,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, buildTaskXml(OPTIONS));

  const failed = spawnSync(process.execPath, [TASK_SCRIPT, '--print-xml', '--distro', 'x;y'], { encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, '');
  assert.throws(() => parseTaskArgs(['--distro', 'x']), /--print-xml/);
});
