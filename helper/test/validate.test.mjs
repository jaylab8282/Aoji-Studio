// 열기 도우미 입력 검증 단위 테스트 (FR-013-AC1·AC2·AC7·AC11, FR-013-E3)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEAD_NAME_PATTERN,
  assertSafeProjectDir,
  buildCommand,
  isValidLeadName,
  parseOpenRequest,
} from '../lib/validate.mjs';

const PROJECT_DIR = '/Users/jaybee/Desktop/JayStudio';

test("[FR-013-AC7] 팀장 name은 '^[a-z0-9-]{1,64}$'만 허용한다", () => {
  assert.equal(LEAD_NAME_PATTERN.source, '^[a-z0-9-]{1,64}$');
  for (const valid of ['develop-tech-lead', 'a', '0', 'a-1', 'a'.repeat(64)]) {
    assert.equal(isValidLeadName(valid), true, valid);
  }
  for (const invalid of [
    'Bad Name',
    'DevLead',
    'dev_lead',
    'dev.lead',
    '../etc/passwd',
    'dev;claude',
    'dev$(id)',
    '팀장',
    '',
    'a'.repeat(65),
    null,
    undefined,
    123,
  ]) {
    assert.equal(isValidLeadName(invalid), false, String(invalid));
  }
});

test("[FR-013-AC1] buildCommand default → 'cd \"<dir>\" && claude'", () => {
  assert.equal(buildCommand(PROJECT_DIR, 'default'), `cd "${PROJECT_DIR}" && claude`);
});

test("[FR-013-AC2] buildCommand lead → 'cd \"<dir>\" && claude --agent <팀장 name>'", () => {
  assert.equal(
    buildCommand(PROJECT_DIR, 'lead', 'develop-tech-lead'),
    `cd "${PROJECT_DIR}" && claude --agent develop-tech-lead`,
  );
  assert.throws(() => buildCommand(PROJECT_DIR, 'lead', 'Bad Name'), /규칙을 위반/);
  assert.throws(() => buildCommand(PROJECT_DIR, 'lead', null), /규칙을 위반/);
  assert.throws(() => buildCommand(PROJECT_DIR, 'other'), /알 수 없는 target/);
});

test("[FR-013-AC11] projectDir 금지 문자는 명령을 만들기 전에 막는다", () => {
  assert.equal(assertSafeProjectDir(PROJECT_DIR), PROJECT_DIR);
  for (const bad of [
    '/Users/a"b',
    '/Users/a`b',
    '/Users/a$b',
    '/Users/a\\b',
    '/Users/a\nb',
    '/Users/a\rb',
  ]) {
    assert.throws(() => assertSafeProjectDir(bad), /허용되지 않는 문자/, bad);
    assert.throws(() => buildCommand(bad, 'default'), /허용되지 않는 문자/, bad);
  }
  assert.throws(() => assertSafeProjectDir('relative/path'), /절대 경로/);
  assert.throws(() => assertSafeProjectDir(''), /값이 필요/);
  assert.throws(() => assertSafeProjectDir(undefined), /값이 필요/);
});

test("[FR-013-E3] parseOpenRequest: 값 규칙 위반은 INVALID_NAME, 형식 오류는 INVALID_BODY", () => {
  assert.deepEqual(parseOpenRequest('{"target":"default"}'), {
    ok: true,
    target: 'default',
    leadName: null,
  });
  assert.deepEqual(parseOpenRequest('{"target":"lead","leadName":"dev-lead"}'), {
    ok: true,
    target: 'lead',
    leadName: 'dev-lead',
  });

  const invalidName = parseOpenRequest('{"target":"lead","leadName":"Bad Name"}');
  assert.equal(invalidName.ok, false);
  assert.equal(invalidName.status, 400);
  assert.equal(invalidName.code, 'INVALID_NAME');
  assert.equal(typeof invalidName.message, 'string');

  for (const raw of [
    '',
    'not json',
    'null',
    '[]',
    '"default"',
    '{}',
    '{"target":"lead"}',
    '{"target":"lead","leadName":123}',
    '{"target":"other"}',
  ]) {
    const result = parseOpenRequest(raw);
    assert.equal(result.ok, false, raw);
    assert.equal(result.code, 'INVALID_BODY', raw);
    assert.equal(result.status, 400, raw);
  }
});
