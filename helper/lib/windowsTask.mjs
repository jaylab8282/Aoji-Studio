// Windows 작업 스케줄러 작업 정의 XML 생성 (ADR-78 결정 4 / FR-013-AC12)
// 순수 함수 + install.ps1이 쓰는 얇은 CLI(--print-xml). 외부 의존 없음(conventions.md §3 Helper MUST).

import { fileURLToPath } from 'node:url';

import { parseAllowedOrigins } from './cors.mjs';
import { assertValidDistro, assertWslProjectDir } from './wt.mjs';

/** 작업 경로·이름 (작업 스케줄러 `\AojiStudio\aojistudio-helper`). */
export const TASK_PATH = '\\AojiStudio\\';
export const TASK_NAME = 'aojistudio-helper';

const WINDOWS_PATH_PATTERN = /^[A-Za-z]:\\[^"<>|?*\r\n\0]+$/;
const USER_ID_PATTERN = /^[^"<>|?*\r\n\0/]{1,256}$/;

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function assertWindowsPath(value, name) {
  if (typeof value !== 'string' || !WINDOWS_PATH_PATTERN.test(value)) {
    throw new Error(`${name} 값이 Windows 절대 경로가 아닙니다`);
  }
  return value;
}

function parsePort(value) {
  const text = String(value);
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 65535) {
    throw new Error('port 값이 포트 번호가 아닙니다');
  }
  return text;
}

/**
 * 로그온 때 start-helper.ps1을 숨김으로 실행하는 작업 정의 XML을 만든다.
 * `--dry-run`은 어디에도 넣지 않는다(NFR-05 디버그 기본 꺼짐).
 * @param {{nodePath: string, helperPath: string, distro: string, projectDir: string,
 *          allowedOrigins: string, port: number|string, userId: string}} options
 * @returns {string}
 */
export function buildTaskXml(options) {
  const { nodePath, helperPath, distro, projectDir, allowedOrigins, port, userId } = options;
  assertWindowsPath(nodePath, 'nodePath');
  assertWindowsPath(helperPath, 'helperPath');
  assertValidDistro(distro);
  assertWslProjectDir(projectDir);
  const origins = parseAllowedOrigins(allowedOrigins);
  if (origins.some((origin) => /[\s"]/.test(origin))) {
    throw new Error('allowedOrigins 값에 공백·따옴표를 쓸 수 없습니다');
  }
  const portText = parsePort(port);
  if (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId)) {
    throw new Error('userId 값이 올바르지 않습니다');
  }
  // helperPath = <설치 폴더>\aojistudio-helper.mjs, 시작 스크립트 = <설치 폴더>\windows\start-helper.ps1
  const installDir = helperPath.slice(0, helperPath.lastIndexOf('\\'));
  const startScript = `${installDir}\\windows\\start-helper.ps1`;
  const argumentText = [
    '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass',
    `-File "${startScript}"`,
    `-Distro ${distro}`,
    `-ProjectDir ${projectDir}`,
    `-AllowedOrigins ${origins.join(',')}`,
    `-Port ${portText}`,
    `-NodePath "${nodePath}"`,
  ].join(' ');
  const user = escapeXml(userId);
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <URI>${escapeXml(TASK_PATH + TASK_NAME)}</URI>
    <Description>Aoji Studio 열기 도우미 (127.0.0.1에만 바인딩)</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${user}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${user}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <AllowHardTerminate>true</AllowHardTerminate>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Hidden>true</Hidden>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>${escapeXml(argumentText)}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

const CLI_KEYS = Object.freeze({
  '--node': 'nodePath',
  '--helper': 'helperPath',
  '--distro': 'distro',
  '--project-dir': 'projectDir',
  '--allowed-origins': 'allowedOrigins',
  '--port': 'port',
  '--user-id': 'userId',
});

/**
 * `--print-xml` CLI 인자 파싱.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parseTaskArgs(argv) {
  const options = {};
  let printXml = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--print-xml') {
      printXml = true;
      continue;
    }
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
  if (!printXml) {
    throw new Error('--print-xml이 필요합니다');
  }
  return options;
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(buildTaskXml(parseTaskArgs(process.argv.slice(2))));
  } catch (error) {
    process.stderr.write(`작업 XML 생성 실패: ${error.message}\n`);
    process.exitCode = 1;
  }
}
