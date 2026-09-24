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
 * 빈 파일·형식 위반이면 던진다(NFR-05 "인증 없이 동작하는 기본값 없음").
 * @param {string} tokenFile
 * @returns {string}
 */
export function ensureTokenFile(tokenFile) {
  const existing = readTokenFile(tokenFile);
  if (existing !== null) {
    if (!TOKEN_PATTERN.test(existing)) {
      throw new Error('도우미 토큰 파일 형식이 올바르지 않습니다 (hex 64자)');
    }
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

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('BODY_TOO_LARGE'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
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
