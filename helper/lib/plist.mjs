// launchd LaunchAgent plist 생성 (architecture.md §3.1 helper, external systems launchd)
// 순수 함수 + install.sh가 쓰는 얇은 CLI. 외부 의존 없음(conventions.md §3 Helper MUST).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** LaunchAgent Label. install.sh·uninstall.sh와 같은 값을 쓴다. */
export const HELPER_LABEL = 'com.aojistudio.helper';

const TEMPLATE_URL = new URL('../launchd/com.aojistudio.helper.plist.template', import.meta.url);

/**
 * plist에 들어갈 문자열을 XML로 이스케이프한다.
 * @param {string} value
 * @returns {string}
 */
export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * launchd ProgramArguments 배열을 만든다.
 * `--dry-run`은 넣지 않는다(conventions.md §3 Helper MUST, NFR-05 디버그 기본 꺼짐).
 * @param {{nodePath: string, scriptPath: string, projectDir: string,
 *          allowedOrigins: string, port: number|string, tokenFile: string}} options
 * @returns {string[]}
 */
export function buildProgramArguments(options) {
  const { nodePath, scriptPath, projectDir, allowedOrigins, port, tokenFile } = options;
  for (const [key, value] of Object.entries({ nodePath, scriptPath, projectDir, allowedOrigins, tokenFile })) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`plist 인자 ${key} 값이 필요합니다`);
    }
  }
  const portValue = String(port);
  if (!/^\d+$/.test(portValue) || Number(portValue) < 1 || Number(portValue) > 65535) {
    throw new Error('plist 인자 port 값이 포트 번호가 아닙니다');
  }
  return [
    nodePath,
    scriptPath,
    '--project-dir',
    projectDir,
    '--allowed-origins',
    allowedOrigins,
    '--port',
    portValue,
    '--token-file',
    tokenFile,
  ];
}

/**
 * plist 문자열을 만든다.
 * @param {{label?: string, nodePath: string, scriptPath: string, projectDir: string,
 *          allowedOrigins: string, port: number|string, tokenFile: string,
 *          logFile: string, workingDirectory?: string}} options
 * @returns {string}
 */
export function renderPlist(options) {
  const label = options.label ?? HELPER_LABEL;
  const logFile = options.logFile;
  if (typeof logFile !== 'string' || logFile.trim() === '') {
    throw new Error('plist 인자 logFile 값이 필요합니다');
  }
  const programArguments = buildProgramArguments(options);
  if (programArguments.includes('--dry-run')) {
    throw new Error('plist ProgramArguments에 --dry-run을 넣을 수 없습니다');
  }
  const argumentLines = programArguments
    .map((argument) => `\t\t<string>${escapeXml(argument)}</string>`)
    .join('\n');
  // 치환값에 `$`가 들어와도 `$&` 같은 치환 패턴으로 해석되지 않도록 함수 형태로 넘긴다.
  const rendered = readFileSync(TEMPLATE_URL, 'utf8')
    .replace('{{LABEL}}', () => escapeXml(label))
    .replace('{{PROGRAM_ARGUMENTS}}', () => argumentLines)
    .replace('{{WORKING_DIRECTORY}}', () => escapeXml(options.workingDirectory ?? options.projectDir))
    .replaceAll('{{LOG_FILE}}', () => escapeXml(logFile));
  if (rendered.includes('{{')) {
    throw new Error('plist 템플릿에 채우지 못한 자리가 있습니다');
  }
  return rendered;
}

const CLI_KEYS = Object.freeze({
  '--label': 'label',
  '--node': 'nodePath',
  '--script': 'scriptPath',
  '--project-dir': 'projectDir',
  '--allowed-origins': 'allowedOrigins',
  '--port': 'port',
  '--token-file': 'tokenFile',
  '--log-file': 'logFile',
});

/**
 * install.sh가 쓰는 CLI 인자 파싱.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parsePlistArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = CLI_KEYS[argv[index]];
    if (key === undefined) {
      throw new Error(`알 수 없는 인자입니다: ${argv[index]}`);
    }
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`${argv[index]} 값이 필요합니다`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(renderPlist(parsePlistArgs(process.argv.slice(2))));
  } catch (error) {
    process.stderr.write(`plist 생성 실패: ${error.message}\n`);
    process.exitCode = 1;
  }
}
