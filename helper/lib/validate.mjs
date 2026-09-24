// 열기 도우미 입력 검증 (architecture.md §7.2, ADR-11 / FR-013-AC7, FR-013-AC11)
// 외부 의존 없음(conventions.md §3 Helper MUST).

/** 팀장 name 규칙 (FR-013-AC7, api-spec `^[a-z0-9-]{1,64}$`). */
export const LEAD_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;

/**
 * projectDir 금지 문자 (architecture.md §7.2).
 * 명령 문자열 `cd "<projectDir>" && claude`에 큰따옴표로 들어가므로
 * `"`, 백틱, `$`, `\`, 개행이 있으면 기동 단계에서 막는다.
 */
const PROJECT_DIR_FORBIDDEN_PATTERN = /["`$\\\n\r]/;

export const ERROR_MESSAGES = Object.freeze({
  INVALID_BODY: '요청 형식이 올바르지 않습니다',
  INVALID_NAME: '팀장 name 형식이 올바르지 않습니다 · 소문자·숫자·하이픈만 허용',
  FORBIDDEN_ORIGIN: '허용되지 않은 요청 출처입니다',
  UNAUTHORIZED_TOKEN: '도우미 토큰이 올바르지 않습니다',
  OPEN_FAILED: '터미널을 열지 못했습니다',
});

/**
 * 기동 시 projectDir 검사. 규칙 위반이면 던진다(기동 실패, NFR-05).
 * @param {unknown} projectDir
 * @returns {string} 검증된 절대 경로
 */
export function assertSafeProjectDir(projectDir) {
  if (typeof projectDir !== 'string' || projectDir.trim() === '') {
    throw new Error('--project-dir 값이 필요합니다');
  }
  if (PROJECT_DIR_FORBIDDEN_PATTERN.test(projectDir)) {
    throw new Error('--project-dir 값에 허용되지 않는 문자가 있습니다 (" ` $ \\ 개행)');
  }
  if (!projectDir.startsWith('/')) {
    throw new Error('--project-dir 값은 절대 경로여야 합니다');
  }
  return projectDir;
}

/** @param {unknown} value */
export function isValidLeadName(value) {
  return typeof value === 'string' && LEAD_NAME_PATTERN.test(value);
}

/**
 * 실행 명령 문자열을 만든다 (FR-013-AC1, FR-013-AC2).
 * 삽입값은 기동 시 검증된 projectDir과 정규식을 통과한 leadName뿐이다(FR-013-AC11).
 * @param {string} projectDir
 * @param {'default'|'lead'} target
 * @param {string|null} leadName
 * @returns {string}
 */
export function buildCommand(projectDir, target, leadName = null) {
  assertSafeProjectDir(projectDir);
  if (target === 'default') {
    return `cd "${projectDir}" && claude`;
  }
  if (target !== 'lead') {
    throw new Error('알 수 없는 target 값입니다');
  }
  if (!isValidLeadName(leadName)) {
    throw new Error('leadName 값이 규칙을 위반했습니다');
  }
  return `cd "${projectDir}" && claude --agent ${leadName}`;
}

/**
 * `POST /open` 본문 검증 (api-spec `/open`).
 * 형식·타입 오류는 INVALID_BODY, leadName 값 규칙 위반은 INVALID_NAME(FR-013-E3).
 * @param {string} rawBody
 * @returns {{ok: true, target: 'default'|'lead', leadName: string|null}
 *          |{ok: false, status: number, code: string, message: string}}
 */
export function parseOpenRequest(rawBody) {
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return invalidBody();
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return invalidBody();
  }
  const target = body.target;
  if (target === 'default') {
    return { ok: true, target: 'default', leadName: null };
  }
  if (target !== 'lead') {
    return invalidBody();
  }
  if (typeof body.leadName !== 'string') {
    return invalidBody();
  }
  if (!LEAD_NAME_PATTERN.test(body.leadName)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_NAME',
      message: ERROR_MESSAGES.INVALID_NAME,
    };
  }
  return { ok: true, target: 'lead', leadName: body.leadName };
}

function invalidBody() {
  return {
    ok: false,
    status: 400,
    code: 'INVALID_BODY',
    message: ERROR_MESSAGES.INVALID_BODY,
  };
}
