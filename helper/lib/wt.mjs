// Windows 도우미 순수 함수 (ADR-78 결정 1~3 / FR-013-AC12, FR-013-AC13)
// Windows Terminal 인자 배열과 토큰 경로를 만든다. 외부 의존 없음(conventions.md §3 Helper MUST).

import { LEAD_NAME_PATTERN } from './validate.mjs';

/** WSL 배포판 이름 (ADR-77 결정 1, ADR-78 결정 1). */
export const DISTRO_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
/**
 * WSL 안의 AojiStudio 경로. 공백·`;`·따옴표가 없어야 Windows Terminal 명령줄 해석과 섞이지 않는다.
 * Windows Terminal은 인자 안의 `;`를 명령 구분자로 읽는다(ADR-78 결정 2).
 */
export const WSL_PROJECT_DIR_PATTERN = /^\/[A-Za-z0-9._/-]+$/;

/** @param {unknown} distro @returns {string} */
export function assertValidDistro(distro) {
  if (typeof distro !== 'string' || !DISTRO_PATTERN.test(distro)) {
    throw new Error('--wsl-distro 값이 올바르지 않습니다 (영숫자·점·밑줄·하이픈 1~64자)');
  }
  return distro;
}

/** @param {unknown} projectDir @returns {string} */
export function assertWslProjectDir(projectDir) {
  if (
    typeof projectDir !== 'string' ||
    !WSL_PROJECT_DIR_PATTERN.test(projectDir) ||
    projectDir.includes('..')
  ) {
    throw new Error(
      '--project-dir 값이 올바르지 않습니다 (WSL 절대 경로, 영숫자·점·밑줄·슬래시·하이픈만, ".." 금지)',
    );
  }
  return projectDir;
}

/**
 * WSL 안 claude 실행 꼬리 (ADR-95 결정 1·3). 로그인 셸(`bash -lic`)이 `~/.local/bin` PATH를 읽는다.
 * 고정 상수이며 배포판·경로·이름이 들어가지 않는다.
 */
export const WSL_CLAUDE_LAUNCH = Object.freeze(['--', 'bash', '-lic', "'exec", 'claude', '"$@"\'', 'claude']);

/**
 * Windows Terminal 새 탭 인자 배열 (FR-013-AC12).
 * 같은 WSL 명령: `wsl -d <배포판> --cd <경로> -- bash -lic 'exec claude "$@"' claude [--agent <name>]`.
 * 인자 경계(ADR-95 결정 3): `wsl.exe` 뒤 원소에는 공백·탭·`;`가 없고, 따옴표 조각은 wsl.exe가 공백으로
 * 이어 붙인 명령줄을 WSL 쪽 셸이 다시 나눈다. 이름은 `--agent` 뒤 별도 원소라 스크립트에 섞이지 않는다.
 * @param {{distro: string, projectDir: string, leadName?: string|null}} options
 * @returns {string[]}
 */
export function buildWtArgs({ distro, projectDir, leadName = null }) {
  assertValidDistro(distro);
  assertWslProjectDir(projectDir);
  if (leadName !== null && leadName !== undefined && !LEAD_NAME_PATTERN.test(leadName)) {
    throw new Error('leadName 값이 규칙을 위반했습니다');
  }
  return [
    '-w',
    '0',
    'new-tab',
    '--title',
    'Aoji Studio',
    'wsl.exe',
    '-d',
    distro,
    '--cd',
    projectDir,
    ...WSL_CLAUDE_LAUNCH,
    ...(leadName ? ['--agent', leadName] : []),
  ];
}

/**
 * Windows 도우미 토큰 파일 기본 경로 (FR-013-AC13, ADR-78 결정 3).
 * `\\wsl.localhost\<배포판>\<WSL 경로를 \로>\.aojistudio\helper-token`
 * @param {string} distro
 * @param {string} projectDir
 * @returns {string}
 */
export function windowsTokenPath(distro, projectDir) {
  assertValidDistro(distro);
  assertWslProjectDir(projectDir);
  const base = projectDir.replace(/\/+$/, '').replaceAll('/', '\\');
  return `\\\\wsl.localhost\\${distro}${base}\\.aojistudio\\helper-token`;
}
