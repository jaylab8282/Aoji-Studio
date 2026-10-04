// 열기 도우미 Origin 허용 목록·CORS 헤더 단위 테스트 (FR-013-AC7, FR-013-E2)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ALLOWED_ORIGINS,
  corsHeaders,
  isAllowedOrigin,
  parseAllowedOrigins,
  preflightHeaders,
} from '../lib/cors.mjs';
import { LEGACY_HELPER_TOKEN_HEADER } from '../lib/legacy.mjs';

test("[FR-013-AC7] 허용 Origin 기본값은 'http://127.0.0.1:4180' 하나다", () => {
  assert.deepEqual([...DEFAULT_ALLOWED_ORIGINS], ['http://127.0.0.1:4180']);
  assert.deepEqual(parseAllowedOrigins(DEFAULT_ALLOWED_ORIGINS.join(',')), [
    'http://127.0.0.1:4180',
  ]);
});

test("[FR-013-AC7] --allowed-origins는 쉼표로 여러 Origin을 받고 형식을 검사한다", () => {
  assert.deepEqual(parseAllowedOrigins('http://127.0.0.1:4180,http://127.0.0.1:5173'), [
    'http://127.0.0.1:4180',
    'http://127.0.0.1:5173',
  ]);
  assert.deepEqual(parseAllowedOrigins(' http://127.0.0.1:4190 '), ['http://127.0.0.1:4190']);
  for (const bad of ['', '   ', '*', 'http://127.0.0.1:4180/', 'file://x', '127.0.0.1:4180']) {
    assert.throws(() => parseAllowedOrigins(bad), /--allowed-origins/, bad);
  }
});

test("[FR-013-E2] 목록에 없는 Origin·Origin 없음은 허용하지 않는다", () => {
  const allowed = ['http://127.0.0.1:4180'];
  assert.equal(isAllowedOrigin('http://127.0.0.1:4180', allowed), true);
  for (const bad of [
    'http://127.0.0.1:5173',
    'http://localhost:4180',
    'https://127.0.0.1:4180',
    'null',
    '',
    undefined,
  ]) {
    assert.equal(isAllowedOrigin(bad, allowed), false, String(bad));
  }
});

test("[FR-013-AC7] CORS 응답 헤더는 요청 Origin만 되돌려 준다", () => {
  assert.deepEqual(corsHeaders('http://127.0.0.1:4180'), {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:4180',
    Vary: 'Origin',
  });
  assert.deepEqual(preflightHeaders('http://127.0.0.1:4180'), {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:4180',
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': `Content-Type, ${LEGACY_HELPER_TOKEN_HEADER}, X-AojiStudio-Helper-Token`,
  });
});
