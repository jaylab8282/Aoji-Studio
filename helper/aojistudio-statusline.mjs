// Claude Code 상태줄 연동 스크립트 (FR-027, ADR-83, conventions.md §3 Helper).
//
// 사용: node aojistudio-statusline.mjs --url <수집 주소> [-- <쓰던 상태줄 명령> [인자...]]
//
// 다섯 규칙
//  1. 쓰던 명령은 spawn(인자[0], 인자[1..], { shell: false })로만 실행한다.
//  2. 입력에서 subscription_type, rate_limits.five_hour|seven_day 의 used_percentage·resets_at 만 보낸다.
//  3. 전송은 분리된 자식 프로세스(detached·unref)가 하고 부모는 전송을 기다리지 않는다.
//  4. 상태 파일은 os.tmpdir() 아래(마운트 밖)에만 쓴다.
//  5. 실패를 stdout·stderr에 쓰지 않는다(상태줄 출력이 바뀌지 않게).
// 수집 토큰은 이 파일 옆 collect-token 에서 읽는다(설정 예시·인자에 토큰을 넣지 않는다).
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RESEND_MILLIS = 60_000;
const SEND_TIMEOUT_MILLIS = 2_000;
const TOKEN_HEADER = 'X-AojiStudio-Collect-Token';
const WINDOWS = ['five_hour', 'seven_day'];
const SELF = fileURLToPath(import.meta.url);

/** `--` 앞은 이 스크립트의 옵션, 뒤는 쓰던 명령. */
export function parseArgs(argv) {
  const split = argv.indexOf('--');
  const own = split === -1 ? argv : argv.slice(0, split);
  const command = split === -1 ? [] : argv.slice(split + 1);
  const options = { send: false, url: null, body: null };
  for (let i = 0; i < own.length; i += 1) {
    if (own[i] === '--send') options.send = true;
    else if (own[i] === '--url' && i + 1 < own.length) options.url = own[++i];
    else if (own[i] === '--body' && i + 1 < own.length) options.body = own[++i];
  }
  return { options, command };
}

function scalar(value) {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

/** 입력 JSON에서 전송할 세 가지만 뽑는다. 키 순서는 고정(같은 값 비교용). 읽을 수 없으면 null. */
export function buildBody(inputText) {
  let input;
  try {
    input = JSON.parse(inputText);
  } catch {
    return null;
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
  const body = {};
  const plan = scalar(input.subscription_type);
  if (plan !== undefined) body.subscription_type = plan;
  const limits = input.rate_limits;
  if (limits !== null && typeof limits === 'object' && !Array.isArray(limits)) {
    const picked = {};
    for (const name of WINDOWS) {
      const window = limits[name];
      if (window === null || typeof window !== 'object' || Array.isArray(window)) continue;
      const entry = {};
      const used = scalar(window.used_percentage);
      if (used !== undefined) entry.used_percentage = used;
      const resets = scalar(window.resets_at);
      if (resets !== undefined) entry.resets_at = resets;
      picked[name] = entry;
    }
    if (Object.keys(picked).length > 0) body.rate_limits = picked;
  }
  return body;
}

export function statePath(uid = process.getuid?.() ?? 'user') {
  return join(tmpdir(), `aojistudio-statusline-${uid}.json`);
}

/** 마지막 전송 본문과 같고 60초가 지나지 않았으면 false. */
export function shouldSend(bodyText, state, nowMillis) {
  if (!state || state.body !== bodyText || typeof state.sentAt !== 'number') return true;
  return nowMillis - state.sentAt >= RESEND_MILLIS || nowMillis < state.sentAt;
}

function readState(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function isLoopbackHttp(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** 전송 자식: 토큰을 읽어 한 번 POST하고 끝낸다. 실패는 모두 무시한다. */
async function sendOnce(url, bodyBase64) {
  try {
    if (!isLoopbackHttp(url)) return;
    const token = readFileSync(join(dirname(SELF), 'collect-token'), 'utf8').trim();
    if (token === '') return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: token },
      body: Buffer.from(bodyBase64, 'base64url').toString('utf8'),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MILLIS),
    });
  } catch {
    // 상태줄 출력에 영향이 없도록 실패는 조용히 버린다.
  }
}

function launchSender(url, bodyText) {
  try {
    const child = spawn(
      process.execPath,
      [SELF, '--send', '--url', url, '--body', Buffer.from(bodyText, 'utf8').toString('base64url')],
      { detached: true, stdio: 'ignore', shell: false, windowsHide: true },
    );
    child.on('error', () => {});
    child.unref();
  } catch {
    // 무시
  }
}

/** 쓰던 명령에 같은 입력을 넘기고 stdout을 그대로 내보낸다. 실행하지 못하면 아무것도 내보내지 않는다. */
function runUserCommand(command, input) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command[0], command.slice(1), { shell: false, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      resolve();
      return;
    }
    child.on('error', () => resolve());
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stdout.on('error', () => {});
    child.on('close', () => resolve());
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function main() {
  const { options, command } = parseArgs(process.argv.slice(2));
  if (options.send) {
    if (options.url && options.body) await sendOnce(options.url, options.body);
    return;
  }
  let input;
  try {
    input = await readStdin();
  } catch {
    input = Buffer.alloc(0);
  }
  const userCommand = command.length > 0 ? runUserCommand(command, input) : Promise.resolve();

  const body = buildBody(input.toString('utf8'));
  if (body !== null && options.url) {
    const bodyText = JSON.stringify(body);
    const path = statePath();
    const now = Date.now();
    if (shouldSend(bodyText, readState(path), now)) {
      try {
        writeFileSync(path, JSON.stringify({ body: bodyText, sentAt: now }), { mode: 0o600 });
      } catch {
        // 상태 파일을 못 써도 전송은 한다.
      }
      launchSender(options.url, bodyText);
    }
  }
  await userCommand;
}

function isEntryPoint() {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === SELF;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch(() => {});
}
