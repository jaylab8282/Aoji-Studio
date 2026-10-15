// Windows .ps1 정적 검사 (ADR-78, FR-013-AC11, FR-013-AC12)
// PowerShell을 실행하지 않는다. 파일 내용만 검사한다. 실제 등록·시작은 사람 확인 H-4.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const WINDOWS_DIR = fileURLToPath(new URL('../windows/', import.meta.url));
const FILES = ['install.ps1', 'uninstall.ps1', 'start-helper.ps1'];
const read = (name) => readFileSync(join(WINDOWS_DIR, name), 'utf8');
/** 주석 줄을 뺀 코드만 (주석 속 설명 문구는 검사 대상이 아니다). */
const code = (name) =>
  read(name)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

test('[FR-013-AC11] windows/ 에는 세 .ps1만 있다', () => {
  assert.deepEqual(readdirSync(WINDOWS_DIR).sort(), [...FILES].sort());
});

for (const name of FILES) {
  test(`[FR-013-AC11] ${name}: Invoke-Expression·iex·cmd /c·문자열 -Command 0회`, () => {
    const text = read(name);
    assert.doesNotMatch(text, /Invoke-Expression/i);
    assert.doesNotMatch(text, /(^|[^A-Za-z0-9-])iex([^A-Za-z0-9-]|$)/i);
    assert.doesNotMatch(text, /cmd(\.exe)?\s+\/c/i);
    assert.doesNotMatch(text, /(^|\s)-Command\b/i);
    assert.doesNotMatch(code(name), /--dry-run/, '도우미를 --dry-run으로 띄우지 않는다');
    assert.doesNotMatch(text, /\b(TODO|FIXME)\b/);
  });
}

test('[FR-013-AC12] install.ps1: Register-ScheduledTask -Xml · -DryRun · Node 순수 함수 호출', () => {
  const text = read('install.ps1');
  assert.match(text, /Register-ScheduledTask\b[^\n]*-Xml\b/);
  assert.match(text, /\[switch\]\$DryRun/);
  assert.match(text, /--print-xml/);
  assert.match(text, /windowsTask\.mjs/);
  assert.match(text, /\$env:LOCALAPPDATA/);
});

test('[FR-013-AC12] uninstall.ps1: 작업 해제·프로세스 종료·폴더 삭제·토큰 보존', () => {
  const text = read('uninstall.ps1');
  assert.match(text, /Unregister-ScheduledTask/);
  assert.match(text, /Stop-Process/);
  assert.match(text, /Remove-Item/);
  assert.match(text, /\[switch\]\$DryRun/);
  assert.doesNotMatch(code('uninstall.ps1'), /helper-token/, '토큰 파일은 지우지 않는다');
});

test('[FR-013-AC12] start-helper.ps1: Start-Process -WindowStyle Hidden, 입력 패턴 검증', () => {
  const text = read('start-helper.ps1');
  assert.match(text, /Start-Process\b[^\n]*-WindowStyle Hidden/);
  assert.match(text, /ValidatePattern\('\^\[A-Za-z0-9\._-\]\{1,64\}\$'\)/);
  assert.match(text, /ValidatePattern\('\^\/\[A-Za-z0-9\._\/-\]\+\$'\)/);
});
