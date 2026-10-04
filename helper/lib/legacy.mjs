// v1.0.x 호환 — 옛 이름 상수와 옛 토큰 경로 재지정 순수 함수 (ADR-57, conventions.md §3 Helper)
// 옛 이름 문자열은 이 파일의 상수로만 쓴다. v1.1.0에서 이 파일과 shim을 지운다.
// 외부 의존 없음(conventions.md §3 Helper MUST).

import { join, resolve } from 'node:path';

/** 옛 데이터 폴더 이름 (v1.0.0). */
export const LEGACY_DATA_DIR_NAME = '.jaystudio';
/** 새 데이터 폴더 이름. */
export const DATA_DIR_NAME = '.aojistudio';
export const HELPER_TOKEN_FILE_NAME = 'helper-token';
/** 옛 도우미 토큰 헤더 — v1.0.x 브라우저가 보내는 정식 이름이라 경고하지 않는다(ADR-57 4). */
export const LEGACY_HELPER_TOKEN_HEADER = 'X-JayStudio-Helper-Token';
export const LEGACY_HELPER_SCRIPT_NAME = 'jaystudio-helper.mjs';
export const LEGACY_HELPER_LABEL = 'com.jaystudio.helper';
export const LEGACY_ENV_LAUNCH_AGENTS_DIR = 'JAYSTUDIO_LAUNCH_AGENTS_DIR';
export const LEGACY_ENV_HEALTH_TIMEOUT_SECONDS = 'JAYSTUDIO_HEALTH_TIMEOUT_SECONDS';

const REMOVAL_NOTICE = 'v1.1.0에서 제거됩니다';

/**
 * ADR-53 형식의 경고 한 줄(접두 제외). 값(토큰·절대 경로·환경 변수 값)은 받지 않는다 —
 * 호출자는 이름·상대 경로만 넘긴다(NFR-08).
 * @param {string} kind
 * @param {string} accepted 받아들인 것
 * @param {string} action 조치
 * @returns {string}
 */
export function legacyWarning(kind, accepted, action) {
  return `[legacy] ${kind} · ${accepted} · ${action} · ${REMOVAL_NOTICE}`;
}

/** shim `jaystudio-helper.mjs`가 실행됐을 때의 경고 (kind `helper-script`). */
export function helperScriptWarning() {
  return legacyWarning(
    'helper-script',
    `${LEGACY_HELPER_SCRIPT_NAME} 실행`,
    'install.sh를 다시 실행해 aojistudio-helper.mjs로 바꾸세요',
  );
}

/**
 * 옛 토큰 경로 경고 (kind `helper-token-path`). 경로는 프로젝트 기준 상대 경로만 쓴다.
 * @param {boolean} redirected 새 경로로 재지정했는지(false면 옛 경로 그대로)
 * @returns {string}
 */
export function helperTokenPathWarning(redirected) {
  const legacyPath = `${LEGACY_DATA_DIR_NAME}/${HELPER_TOKEN_FILE_NAME}`;
  const newPath = `${DATA_DIR_NAME}/${HELPER_TOKEN_FILE_NAME}`;
  return redirected
    ? legacyWarning(
        'helper-token-path',
        `--token-file ${legacyPath}를 ${newPath}로 재지정`,
        `--token-file 인자(또는 plist)를 ${newPath}로 바꾸세요`,
      )
    : legacyWarning(
        'helper-token-path',
        `--token-file ${legacyPath} 그대로 사용(${DATA_DIR_NAME}/ 없음)`,
        `Aoji Studio 서버(v1.0.1)를 기동해 ${LEGACY_DATA_DIR_NAME}/를 옮긴 뒤 도우미를 다시 시작하세요`,
      );
}

/** `.aojistudio/` 선생성 금지로 기동을 거부할 때의 메시지(절대 경로 없음). */
export const REFUSE_MESSAGE = `Aoji Studio 서버(v1.0.1)를 먼저 기동해 ${LEGACY_DATA_DIR_NAME}/를 옮긴 뒤 도우미를 다시 시작하세요`;

/**
 * 토큰 파일 경로를 확정한다 (ADR-57 2·3). 파일 시스템은 `isDirectory`로만 본다(순수 판정).
 * - 정확히 `<projectDir>/.jaystudio/helper-token`이면: `.aojistudio/`가 디렉터리 → 새 경로로 재지정,
 *   아니면 옛 경로 그대로. 둘 다 `helper-token-path` 경고 대상이다.
 * - 쓰려는 파일이 `<projectDir>/.aojistudio/helper-token`인데 `.aojistudio/`가 없고 `.jaystudio/`가 있으면
 *   거부한다 — 도우미가 `.aojistudio/`를 먼저 만들면 서버가 "둘 다 있음"으로 판정해 이동이 영원히 일어나지 않는다.
 * @param {{projectDir: string, tokenFile: string, isDirectory: (path: string) => boolean}} input
 * @returns {{tokenFile: string, notice: 'redirected'|'kept'|null, refuse: boolean}}
 */
export function resolveTokenFile({ projectDir, tokenFile, isDirectory }) {
  const legacyDir = join(projectDir, LEGACY_DATA_DIR_NAME);
  const newDir = join(projectDir, DATA_DIR_NAME);
  const legacyFile = join(legacyDir, HELPER_TOKEN_FILE_NAME);
  const newFile = join(newDir, HELPER_TOKEN_FILE_NAME);
  const requested = resolve(tokenFile);

  if (requested === legacyFile) {
    if (isDirectory(newDir)) {
      return { tokenFile: newFile, notice: 'redirected', refuse: false };
    }
    return { tokenFile, notice: 'kept', refuse: false };
  }
  if (requested === newFile && !isDirectory(newDir) && isDirectory(legacyDir)) {
    return { tokenFile, notice: null, refuse: true };
  }
  return { tokenFile, notice: null, refuse: false };
}
