#!/usr/bin/env node
// 열기 도우미 — 맥북 호스트 127.0.0.1:4181 (FR-013, architecture.md §7.2 / ADR-11)
// GET /health, OPTIONS/POST /open 만 제공한다. 외부 npm 의존 없음(conventions.md §3 Helper MUST).

import { createServer } from 'node:http';
import { spawn as nodeSpawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ERROR_MESSAGES,
  assertSafeProjectDir,
  buildCommand,
  parseOpenRequest,
} from './lib/validate.mjs';
import {
  DEFAULT_ALLOWED_ORIGINS,
  corsHeaders,
  isAllowedOrigin,
  parseAllowedOrigins,
  preflightHeaders,
} from './lib/cors.mjs';

/** 바인딩 주소는 루프백 고정 (NFR-04, conventions.md §6). */
export const HELPER_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4181;
export const HELPER_VERSION = '1';
export const OSASCRIPT_PATH = '/usr/bin/osascript';
export const TOKEN_HEADER_NAME = 'x-jaystudio-helper-token';
/** 토큰 파일 기본 위치. `--token-file`로 덮어쓴다(architecture.md §6.3). */
export const DEFAULT_TOKEN_FILE_RELATIVE = join('.jaystudio', 'helper-token');
const MAX_BODY_BYTES = 4096;
/**
 * 상한 초과 본문을 흘려보낼 때의 2차 상한(1MiB). 여기를 넘으면 소켓을 끊는다 —
 * 초대형 본문이 400을 받은 뒤에도 소켓을 오래 붙잡는 것을 막는다.
 * 이 값 이하의 초과 본문은 그대로 400 INVALID_BODY로 끝난다(api-spec `/open` 계약 불변).
 */
const MAX_DISCARDED_BODY_BYTES = 1024 * 1024;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const USAGE = [
  'usage: node jaystudio-helper.mjs --project-dir <path>',
  '                                [--port <number>] [--allowed-origins <origin[,origin]>]',
  '                                [--token-file <path>] [--dry-run]',
].join('\n');

/**
 * 실행 인자를 파싱하고 검증한다. 필수 값이 없거나 형식이 틀리면 던진다(기동 실패, NFR-05).
 * @param {string[]} argv
 * @returns {{projectDir: string, port: number, allowedOrigins: string[], tokenFile: string, dryRun: boolean}}
 */
export function parseArgs(argv) {
  const raw = { projectDir: undefined, port: undefined, allowedOrigins: undefined, tokenFile: undefined };
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--dry-run') {
      dryRun = true;
      continue;
    }
    const key = {
      '--project-dir': 'projectDir',
      '--port': 'port',
      '--allowed-origins': 'allowedOrigins',
      '--token-file': 'tokenFile',
    }[flag];
    if (key === undefined) {
      throw new Error(`알 수 없는 인자입니다: ${flag}\n${USAGE}`);
    }
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`${flag} 값이 필요합니다\n${USAGE}`);
    }
    raw[key] = value;
    index += 1;
  }

  const projectDir = assertSafeProjectDir(raw.projectDir);
  let stats;
  try {
    stats = statSync(projectDir);
  } catch {
    throw new Error('--project-dir 경로를 찾을 수 없습니다');
  }
  if (!stats.isDirectory()) {
    throw new Error('--project-dir 값이 폴더가 아닙니다');
  }

  return {
    projectDir,
    port: parsePort(raw.port),
    allowedOrigins: parseAllowedOrigins(raw.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS.join(',')),
    tokenFile: raw.tokenFile ?? join(projectDir, DEFAULT_TOKEN_FILE_RELATIVE),
    dryRun,
  };
}

function parsePort(value) {
  if (value === undefined) {
    return DEFAULT_PORT;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error('--port 값이 포트 번호가 아닙니다');
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error('--port 값이 포트 번호가 아닙니다');
  }
  return port;
}

/**
 * osascript에 넘길 인자 배열 (architecture.md §7.2).
 * 명령은 마지막 argv 항목으로 전달되고 셸을 거치지 않는다(FR-013-AC11).
 * @param {string} command
 * @returns {string[]}
 */
export function buildOsascriptArgs(command) {
  return [
    '-e',
    'on run argv',
    '-e',
    'tell application "Terminal"',
    '-e',
    'activate',
    '-e',
    'do script (item 1 of argv)',
    '-e',
    'end tell',
    '-e',
    'end run',
    command,
  ];
}

/**
 * 터미널 실행 함수를 만든다. `spawnFn`을 주입할 수 있어 단위 테스트가 실제 터미널을 열지 않는다
 * (conventions.md §3 Helper MUST).
 * @param {typeof nodeSpawn} [spawnFn]
 * @returns {(command: string) => Promise<void>}
 */
export function createOpenTerminal(spawnFn = nodeSpawn) {
  return function openTerminal(command) {
    return new Promise((resolve, reject) => {
      // shell 옵션을 쓰지 않는다(FR-013-AC11, ADR-11).
      const child = spawnFn(OSASCRIPT_PATH, buildOsascriptArgs(command), { stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', resolve);
    });
  };
}

/**
 * 도우미 토큰을 읽거나 만든다 (architecture.md §6.3).
 * 없으면 hex 64자를 mode 600으로 만들고, 있으면 재사용한다.
 * 재사용할 때 mode가 600이 아니면 600으로 고치고, 고칠 수 없으면 던진다(기동 실패).
 * 빈 파일·형식 위반이면 던진다(NFR-05 "인증 없이 동작하는 기본값 없음").
 * @param {string} tokenFile
 * @param {{stderr?: {write: (chunk: string) => unknown}}} [options]
 * @returns {string}
 */
export function ensureTokenFile(tokenFile, options = {}) {
  const stderr = options.stderr ?? process.stderr;
  const existing = readTokenFile(tokenFile);
  if (existing !== null) {
    if (!TOKEN_PATTERN.test(existing)) {
      throw new Error('도우미 토큰 파일 형식이 올바르지 않습니다 (hex 64자)');
    }
    enforceTokenFileMode(tokenFile, stderr);
    return existing;
  }
  mkdirSync(dirname(tokenFile), { recursive: true });
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  try {
    writeFileSync(tokenFile, token, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
    const raced = readTokenFile(tokenFile);
    if (raced === null || !TOKEN_PATTERN.test(raced)) {
      throw new Error('도우미 토큰 파일 형식이 올바르지 않습니다 (hex 64자)');
    }
    return raced;
  }
  // mode 인자는 umask의 영향을 받으므로 만든 뒤 600으로 고정한다.
  chmodSync(tokenFile, 0o600);
  return token;
}

/**
 * 기존 토큰 파일의 권한을 600으로 강제한다 (architecture.md §6.3 "모드 600").
 * 넓은 권한을 조용히 받아들이지 않고, 고칠 수 없으면 기동을 실패시킨다(NFR-05).
 * @param {string} tokenFile
 * @param {{write: (chunk: string) => unknown}} stderr
 */
function enforceTokenFileMode(tokenFile, stderr) {
  const mode = statSync(tokenFile).mode & 0o777;
  if (mode === 0o600) {
    return;
  }
  try {
    chmodSync(tokenFile, 0o600);
  } catch {
    // 경로·권한 상세만 알리고 토큰 값은 남기지 않는다(NFR-08).
    throw new Error('도우미 토큰 파일 권한을 600으로 고칠 수 없습니다');
  }
  if ((statSync(tokenFile).mode & 0o777) !== 0o600) {
    throw new Error('도우미 토큰 파일 권한을 600으로 고칠 수 없습니다');
  }
  // 조용히 넘기지 않고 한 줄 남긴다. 토큰 값은 쓰지 않는다(NFR-08).
  stderr.write('jaystudio-helper: 도우미 토큰 파일 권한을 600으로 고쳤습니다\n');
}

function readTokenFile(tokenFile) {
  let content;
  try {
    content = readFileSync(tokenFile, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  const token = content.trim();
  if (token === '') {
    throw new Error('도우미 토큰 파일이 비어 있습니다');
  }
  return token;
}

function timingSafeEquals(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sendJson(response, status, body, headers = {}) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(payload.length),
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(payload);
}

function sendEmpty(response, status, headers = {}) {
  response.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  response.end();
}

function sendError(response, status, code, headers = {}) {
  sendJson(response, status, { code, message: ERROR_MESSAGES[code] }, headers);
}

/**
 * 본문을 최대 MAX_BODY_BYTES까지 읽는다.
 * 상한을 넘으면 즉시 거부하지만 **소켓을 끊지 않는다** — 호출자가 400 INVALID_BODY를 돌려줄 수 있어야
 * 하고(api-spec `/open`에 연결 종료라는 응답이 없다) 남은 데이터는 버리며 흘려보낸다.
 * 다만 흘려보내는 양이 MAX_DISCARDED_BODY_BYTES를 넘으면 그때 소켓을 끊는다 — 초대형 본문이
 * 소켓을 무한정 붙잡지 못하게 한다.
 * @param {import('node:http').IncomingMessage} request
 * @returns {Promise<string>}
 */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (tooLarge) {
        // 남은 본문은 버린다(읽어서 흘려보내야 응답이 클라이언트에 도착한다).
        // 2차 상한을 넘으면 더 기다리지 않고 소켓을 끊는다.
        if (size > MAX_DISCARDED_BODY_BYTES) {
          // 여기 도달하는 것은 tooLarge가 이미 true가 된 뒤의 data뿐이다. 최초 상한 초과 시점에
          // promise는 reject로 정착했고 /open은 이미 400 INVALID_BODY를 보냈다(api-spec `/open`에
          // 정의된 응답이다). 그래서 destroy()는 응답 경로가 아니라, 버리는 본문이 소켓을 오래
          // 붙잡지 못하게 하는 자원 보호 조치다.
          request.destroy();
        }
        return;
      }
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(new Error('BODY_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    // 아래 'error'·'end' 두 핸들러의 !tooLarge 가드 — tooLarge면 promise는 이미 정착돼
    // 있다. 이 가드는 재정착(무효 호출) 방어이며, promise를 버리는 장치가 아니다.
    request.on('error', (error) => {
      if (!tooLarge) {
        reject(error);
      }
    });
    request.on('end', () => {
      if (!tooLarge) {
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
  });
}

function isJsonContentType(request) {
  const contentType = request.headers['content-type'];
  if (typeof contentType !== 'string') {
    return false;
  }
  return contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * 도우미 HTTP 서버를 만든다. 듣기 시작은 호출자가 한다.
 * @param {{projectDir: string, allowedOrigins: readonly string[], token: string,
 *          dryRun?: boolean, openTerminal?: (command: string) => Promise<void>,
 *          stdout?: {write: (chunk: string) => unknown}}} options
 * @returns {import('node:http').Server}
 */
export function createHelperServer(options) {
  const { projectDir, allowedOrigins, token } = options;
  assertSafeProjectDir(projectDir);
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new Error('도우미 토큰 형식이 올바르지 않습니다 (hex 64자)');
  }
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    throw new Error('허용 Origin 목록이 필요합니다');
  }
  const dryRun = options.dryRun === true;
  const openTerminal = options.openTerminal ?? createOpenTerminal();
  const stdout = options.stdout ?? process.stdout;

  return createServer((request, response) => {
    handle(request, response).catch(() => {
      // 예기치 못한 오류: 내부 상세를 응답에 담지 않는다(NFR-08).
      if (!response.headersSent) {
        sendEmpty(response, 500);
        return;
      }
      response.destroy();
    });
  });

  async function handle(request, response) {
    const path = new URL(request.url ?? '/', `http://${HELPER_HOST}`).pathname;
    const origin = request.headers.origin;
    const originAllowed = isAllowedOrigin(origin, allowedOrigins);

    if (path === '/health' && request.method === 'GET') {
      if (!originAllowed) {
        sendError(response, 403, 'FORBIDDEN_ORIGIN');
        return;
      }
      sendJson(response, 200, { ok: true, version: HELPER_VERSION }, corsHeaders(origin));
      return;
    }
    if (path === '/open' && request.method === 'OPTIONS') {
      if (!originAllowed) {
        sendError(response, 403, 'FORBIDDEN_ORIGIN');
        return;
      }
      sendEmpty(response, 204, preflightHeaders(origin));
      return;
    }
    if (path === '/open' && request.method === 'POST') {
      await handleOpen(request, response, origin, originAllowed);
      return;
    }
    sendEmpty(response, 404);
  }

  async function handleOpen(request, response, origin, originAllowed) {
    // Origin·토큰 검사를 통과하지 못하면 실행하지 않는다 (FR-013-AC7, FR-013-E2).
    if (!originAllowed) {
      sendError(response, 403, 'FORBIDDEN_ORIGIN');
      return;
    }
    const headers = corsHeaders(origin);
    const requestToken = request.headers[TOKEN_HEADER_NAME];
    if (typeof requestToken !== 'string' || !timingSafeEquals(requestToken, token)) {
      sendError(response, 403, 'UNAUTHORIZED_TOKEN', headers);
      return;
    }
    if (!isJsonContentType(request)) {
      sendEmpty(response, 415, headers);
      return;
    }

    let rawBody;
    try {
      rawBody = await readBody(request);
    } catch {
      sendError(response, 400, 'INVALID_BODY', headers);
      return;
    }
    const parsed = parseOpenRequest(rawBody);
    if (!parsed.ok) {
      sendJson(response, parsed.status, { code: parsed.code, message: parsed.message }, headers);
      return;
    }

    const command = buildCommand(projectDir, parsed.target, parsed.leadName);
    if (dryRun) {
      stdout.write(`DRY-RUN ${command}\n`);
      sendEmpty(response, 204, headers);
      return;
    }
    try {
      await openTerminal(command);
    } catch {
      // 실패 상세·스택은 응답과 로그에 담지 않는다(NFR-08).
      sendError(response, 500, 'OPEN_FAILED', headers);
      return;
    }
    sendEmpty(response, 204, headers);
  }
}

/**
 * 프로세스 진입점. 인자·토큰을 확정한 뒤 127.0.0.1에만 바인딩한다(NFR-04).
 * @param {string[]} argv
 * @returns {Promise<import('node:http').Server>}
 */
export function main(argv) {
  const options = parseArgs(argv);
  const token = ensureTokenFile(options.tokenFile);
  const server = createHelperServer({
    projectDir: options.projectDir,
    allowedOrigins: options.allowedOrigins,
    token,
    dryRun: options.dryRun,
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, HELPER_HOST, () => {
      // 토큰·요청 본문은 남기지 않는다(NFR-08).
      process.stdout.write(
        `jaystudio-helper listening on http://${HELPER_HOST}:${options.port}` +
          `${options.dryRun ? ' (dry-run)' : ''}\n`,
      );
      resolve(server);
    });
  });
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    // 인자 검증은 동기적으로 던진다. 스택 트레이스를 흘리지 않고 한 줄만 남긴다(NFR-08).
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`jaystudio-helper 기동 실패: ${error.message}\n`);
    process.exitCode = 1;
  }
}
