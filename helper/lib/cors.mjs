// 열기 도우미 CORS·Origin 허용 목록 (FR-013-AC7, api-spec `/health`·`/open`)
// 외부 의존 없음(conventions.md §3 Helper MUST).

/** 허용 Origin 기본값 (FR-013-AC7). 개발 중에는 실행 인자로 5173을 추가한다. */
export const DEFAULT_ALLOWED_ORIGINS = Object.freeze(['http://127.0.0.1:4180']);

import { LEGACY_HELPER_TOKEN_HEADER } from './legacy.mjs';

/** 도우미 토큰 헤더 (conventions.md §5). 옛 이름은 `legacy.mjs`의 상수로 함께 받는다(ADR-57). */
export const HELPER_TOKEN_HEADER = 'X-AojiStudio-Helper-Token';

/**
 * `--allowed-origins` 인자 값(쉼표 구분)을 Origin 목록으로 만든다.
 * 형식이 아니거나 와일드카드면 던진다(기동 실패, NFR-05).
 * @param {string} value
 * @returns {string[]}
 */
export function parseAllowedOrigins(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('--allowed-origins 값이 필요합니다');
  }
  const origins = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  if (origins.length === 0) {
    throw new Error('--allowed-origins 값이 필요합니다');
  }
  for (const origin of origins) {
    assertOriginFormat(origin);
  }
  return origins;
}

function assertOriginFormat(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`--allowed-origins 값이 Origin 형식이 아닙니다: ${origin}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`--allowed-origins 값이 Origin 형식이 아닙니다: ${origin}`);
  }
  if (parsed.origin !== origin) {
    throw new Error(`--allowed-origins 값이 Origin 형식이 아닙니다: ${origin}`);
  }
}

/**
 * 요청 Origin이 허용 목록에 있는지 본다. Origin 헤더가 없으면 거부한다
 * (브라우저 밖 클라이언트 차단, architecture.md §5 Origin 규칙).
 * @param {string|undefined} origin
 * @param {readonly string[]} allowedOrigins
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, allowedOrigins) {
  if (typeof origin !== 'string' || origin === '') {
    return false;
  }
  return allowedOrigins.includes(origin);
}

/**
 * 허용된 Origin에 대한 CORS 응답 헤더.
 * @param {string} origin
 * @returns {Record<string, string>}
 */
export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  };
}

/**
 * `OPTIONS /open` preflight 응답 헤더 (api-spec `/open` options 204).
 * @param {string} origin
 * @returns {Record<string, string>}
 */
export function preflightHeaders(origin) {
  return {
    ...corsHeaders(origin),
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': `Content-Type, ${LEGACY_HELPER_TOKEN_HEADER}, ${HELPER_TOKEN_HEADER}`,
  };
}
