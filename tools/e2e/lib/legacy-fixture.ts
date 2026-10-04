// 호환 배치(E2E-R2-02~R2-07) 하네스 (architecture.md §8.4.1·§8.4.3, tasks.md T-R2-10). v1.0.x 호환 · v1.1.0에서 제거.
// - legacy fixture(`project-legacy-only`·`project-legacy-both`)는 임시 폴더로 복사한 뒤 토큰 파일을
//   하네스가 써 넣는다(난수 hex 64자, 모드 600). 토큰 파일은 `.gitignore` 대상이라 fixture 원본에 없다.
// - 기동 전에 옛 데이터 폴더 아래 모든 파일의 sha256을 기록해 두고, spec이 이동·불변을 단언한다.
// - 컨테이너 로그·compose 재기동·옛 인자 도우미(shim) 실행을 spec이 쓰는 공용 함수로 모았다.
// `.claude`·`.aojistudio`·옛 데이터 폴더 이름은 fixture 임시 폴더 안의 경로를 만들 때만 쓴다(isolation.spec).
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { expect } from "@playwright/test";

import {
  COMPOSE_FILE,
  COMPOSE_SERVICE,
  E2E_DIR,
  HELPER_LOG_PATH,
  PROJECT_ROOT,
  composeEnv,
  readE2eState,
  writeE2eState,
  type LegacyFixtureInfo,
} from "./e2e-state";
import { delay, httpGet, isProcessAlive, killProcessTree, waitForHttpOk } from "./harness-utils";

/** fixture 임시 폴더 안의 옛 데이터 폴더 이름. */
export const FIXTURE_LEGACY_DIR = ".jaystudio";
/** fixture 임시 폴더 안의 새 데이터 폴더 이름. */
export const FIXTURE_DATA_DIR = ".aojistudio";
/** 옛 인자로 실행하는 도우미 shim 스크립트(T-R2-05). */
export const LEGACY_HELPER_SHIM = join(PROJECT_ROOT, "helper", "jaystudio-helper.mjs");

const COMPOSE_READY_TIMEOUT_MS = 120_000;

/** 새 난수 토큰(hex 64자). 테스트 실행마다 다르다. */
export function randomToken(): string {
  return randomBytes(32).toString("hex");
}

function writeSecretFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

/** 폴더 아래 모든 일반 파일의 sha256(상대 경로 → hex). 폴더가 없으면 빈 객체. */
export function sha256Tree(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(root)) {
    return result;
  }
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        result[relative(root, full)] = createHash("sha256").update(readFileSync(full)).digest("hex");
      }
    }
  };
  walk(root);
  return result;
}

/**
 * globalSetup이 호출한다. 복사된 legacy fixture 폴더에 토큰 파일을 써 넣고 옛 폴더 sha256을 기록한다.
 * - only: 옛 폴더에 collect-token(A)·helper-token(B). 새 폴더 없음.
 * - both: 새 폴더 collect-token(A), 옛 폴더 collect-token(C, A와 다름).
 */
export function prepareLegacyFixture(
  fixtureDir: string,
  fixtureName: string,
): { info: LegacyFixtureInfo; collectTokenFile: string; helperTokenFile: string } {
  const legacyDir = join(fixtureDir, FIXTURE_LEGACY_DIR);
  const dataDir = join(fixtureDir, FIXTURE_DATA_DIR);
  const collectToken = randomToken();

  if (fixtureName === "project-legacy-only") {
    const helperToken = randomToken();
    const collectTokenFile = join(legacyDir, "collect-token");
    const helperTokenFile = join(legacyDir, "helper-token");
    writeSecretFile(collectTokenFile, collectToken);
    writeSecretFile(helperTokenFile, helperToken);
    return {
      info: {
        kind: "only",
        collectToken,
        oldCollectToken: null,
        helperToken,
        legacyDirSha256: sha256Tree(legacyDir),
      },
      collectTokenFile,
      helperTokenFile,
    };
  }
  if (fixtureName === "project-legacy-both") {
    const oldCollectToken = randomToken();
    const collectTokenFile = join(dataDir, "collect-token");
    writeSecretFile(collectTokenFile, collectToken);
    writeSecretFile(join(legacyDir, "collect-token"), oldCollectToken);
    return {
      info: {
        kind: "both",
        collectToken,
        oldCollectToken,
        helperToken: null,
        legacyDirSha256: sha256Tree(legacyDir),
      },
      collectTokenFile,
      helperTokenFile: join(dataDir, "helper-token"),
    };
  }
  throw new Error(`알 수 없는 호환 fixture: ${fixtureName}`);
}

/** 이 배치가 준비한 호환 fixture 정보. 호환 fixture 배치가 아니면 던진다. */
export function legacyInfo(): LegacyFixtureInfo {
  const info = readE2eState().legacy;
  if (info === undefined) {
    throw new Error("호환 fixture 배치가 아닙니다(E2E_FIXTURE=project-legacy-only|project-legacy-both).");
  }
  return info;
}

/** fixture 임시 폴더 안 경로. */
export function fixtureFile(...segments: string[]): string {
  return join(readE2eState().fixtureDir, ...segments);
}

// ── 컨테이너 ───────────────────────────────────────────────────────────────────────────

function compose(args: string[], extraEnv: Record<string, string> = {}): string {
  const state = readE2eState();
  return execFileSync("docker", ["compose", "-f", COMPOSE_FILE, ...args], {
    cwd: E2E_DIR,
    env: { ...composeEnv(state.fixtureDir), ...extraEnv },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** 컨테이너 로그 전체(색·접두 없음). */
export function containerLogs(): string {
  return compose(["logs", "--no-color", "--no-log-prefix"]);
}

/** `[legacy]` 경고 줄만. */
export function legacyLines(logs: string = containerLogs()): string[] {
  return logs.split("\n").filter((line) => line.includes("[legacy]"));
}

/** `[legacy] <종류>` 줄만. */
export function legacyLinesOfKind(kind: string, logs: string = containerLogs()): string[] {
  return legacyLines(logs).filter((line) => line.includes(`[legacy] ${kind} ·`));
}

/** 컨테이너 안 `/workspace` 마운트가 읽기 전용인지(`docker inspect`의 RW). */
export function workspaceMountIsReadWrite(): boolean {
  const state = readE2eState();
  const containerId = compose(["ps", "-q", COMPOSE_SERVICE]).trim();
  if (containerId === "") {
    throw new Error(`컨테이너를 찾지 못했습니다(fixture ${state.fixtureDir})`);
  }
  const mounts = JSON.parse(
    execFileSync("docker", ["inspect", "--format", "{{json .Mounts}}", containerId], { encoding: "utf8" }),
  ) as { Destination: string; RW: boolean }[];
  const workspace = mounts.find((mount) => mount.Destination === "/workspace");
  if (workspace === undefined) {
    throw new Error("/workspace 마운트가 없습니다");
  }
  return workspace.RW;
}

/** 같은 fixture 폴더를 다른 마운트 모드로 다시 띄운다(`up -d`가 설정 변경을 보고 컨테이너를 다시 만든다). */
export async function recreateWithMountMode(mode: "ro" | "rw"): Promise<void> {
  const state = readE2eState();
  compose(["up", "-d"], { E2E_MOUNT_MODE: mode });
  await waitForHttpOk(`${state.baseUrl}/`, { timeoutMs: COMPOSE_READY_TIMEOUT_MS, label: `재기동(${mode})` });
}

/** `docker compose restart` 뒤 서버가 다시 응답할 때까지 기다린다. */
export async function restartContainer(): Promise<void> {
  const state = readE2eState();
  compose(["restart"]);
  await waitForHttpOk(`${state.baseUrl}/`, { timeoutMs: COMPOSE_READY_TIMEOUT_MS, label: "재시작" });
}

// ── 수집·재생 ──────────────────────────────────────────────────────────────────────────

/** 재생 도구(`tools/replay/replay.mjs`)로 JSONL 줄을 새 헤더로 보낸다. 토큰은 지정한 파일에서 읽는다. */
export function replayWithTokenFile(options: {
  tokenFile: string;
  lines: Record<string, unknown>[];
  scratchDir: string;
}): string {
  const state = readE2eState();
  mkdirSync(options.scratchDir, { recursive: true });
  const scenario = join(options.scratchDir, "scenario.jsonl");
  writeFileSync(scenario, `${options.lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
  return execFileSync(
    "node",
    [
      join(PROJECT_ROOT, "tools", "replay", "replay.mjs"),
      "--url",
      `${state.baseUrl}/hooks/events`,
      "--token-file",
      options.tokenFile,
      "--delay-ms",
      "0",
      scenario,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

// ── 옛 인자 도우미(E2E-R2-07) ───────────────────────────────────────────────────────────

export type ShimHelper = { pid: number; port: number; stop: () => Promise<void> };

/**
 * shim(`jaystudio-helper.mjs`)을 **옛 plist가 넘기던 인자**(`--token-file <fixture>/옛 폴더/helper-token`)로
 * dry-run 실행한다. 로그는 `HELPER_LOG_PATH`(E2E-09와 같은 형식의 `DRY-RUN …` 줄). pid는 상태 파일에 적어
 * globalTeardown이 못 끝낸 경우에도 정리하게 한다.
 */
export async function startShimHelper(options: { port: number; allowedOrigin: string }): Promise<ShimHelper> {
  const state = readE2eState();
  const fd = openSync(HELPER_LOG_PATH, "w");
  let pid: number;
  try {
    const child = spawn(
      process.execPath,
      [
        LEGACY_HELPER_SHIM,
        "--dry-run",
        "--port",
        String(options.port),
        "--project-dir",
        state.fixtureDir,
        "--allowed-origins",
        options.allowedOrigin,
        "--token-file",
        join(state.fixtureDir, FIXTURE_LEGACY_DIR, "helper-token"),
      ],
      { cwd: E2E_DIR, detached: true, stdio: ["ignore", fd, fd] },
    );
    child.unref();
    if (child.pid === undefined) {
      throw new Error("shim 도우미를 띄우지 못했습니다");
    }
    pid = child.pid;
  } finally {
    closeSync(fd);
  }
  writeE2eState({ helperPid: pid });

  const stop = async (): Promise<void> => {
    await killProcessTree(pid);
    writeE2eState({ helperPid: null });
  };

  const deadline = Date.now() + 20_000;
  const healthUrl = `http://127.0.0.1:${options.port}/health`;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      throw new Error(`shim 도우미가 기동 직후 종료됐습니다:\n${readFileSync(HELPER_LOG_PATH, "utf8")}`);
    }
    try {
      const response = await httpGet(healthUrl, { Origin: options.allowedOrigin });
      if (response.status === 200) {
        return { pid, port: options.port, stop };
      }
    } catch {
      // 아직 듣지 않는다 — 계속 기다린다.
    }
    await delay(250);
  }
  await stop();
  throw new Error(`shim 도우미 준비 대기 초과: ${healthUrl}\n${readFileSync(HELPER_LOG_PATH, "utf8")}`);
}

/** 파일이 모드 600인지(`stat`의 하위 9비트). */
export function fileMode(path: string): number {
  return statSync(path).mode & 0o777;
}

// ── 공용 단언 (E2E-R2-04·R2-04b가 같은 "이동 완료"를 본다) ─────────────────────────────────

/** hook 입력(architecture §7) 본문. `agent_type`은 fixture 정의 파일 이름이다. */
export function hookPayload(options: {
  sessionId: string;
  agentType: string;
  eventName: string;
  toolName?: string;
}): Record<string, unknown> {
  return {
    session_id: options.sessionId,
    cwd: "/workspace",
    hook_event_name: options.eventName,
    agent_type: options.agentType,
    permission_mode: "default",
    ...(options.toolName === undefined
      ? {}
      : { tool_name: options.toolName, tool_input: { file_path: "a.txt" } }),
  };
}

/** 로그 전체에 토큰 값(하네스가 써 넣은 hex)이 한 번도 나오지 않는다(NFR-08). */
export function expectNoTokenInLogs(logs: string, tokens: (string | null)[]): void {
  for (const token of tokens) {
    if (token !== null) {
      expect(logs.includes(token), "컨테이너 로그에 토큰 값이 있습니다(NFR-08)").toBe(false);
    }
  }
}

/**
 * `project-legacy-only`가 옛 폴더에서 새 폴더로 옮겨진 상태를 단언한다(NFR-09·FR-001-AC1·ADR-55).
 * 호스트 파일: 새 폴더에 구성·휴지통·토큰, 옛 폴더 없음, 옛 폴더에 있던 모든 파일의 sha256 동일, 토큰 모드 600.
 */
export function expectMigratedOnHost(): void {
  const info = legacyInfo();
  expect(existsSync(fixtureFile(FIXTURE_LEGACY_DIR)), "옛 데이터 폴더가 남아 있습니다").toBe(false);
  expect(existsSync(fixtureFile(FIXTURE_DATA_DIR, "teams", "legacy-team.json"))).toBe(true);
  expect(existsSync(fixtureFile(FIXTURE_DATA_DIR, "trash", "legacy-old.20260901-120000.md"))).toBe(true);

  const after = sha256Tree(fixtureFile(FIXTURE_DATA_DIR));
  for (const [relativePath, hash] of Object.entries(info.legacyDirSha256)) {
    expect(after[relativePath], `${relativePath}가 옮겨지지 않았거나 내용이 바뀌었습니다`).toBe(hash);
  }
  // collect-token 바이트 동일: 새 토큰을 만들지 않고 써 둔 값 그대로다(기동 순서 보장).
  const collectTokenFile = fixtureFile(FIXTURE_DATA_DIR, "collect-token");
  expect(readFileSync(collectTokenFile, "utf8")).toBe(info.collectToken);
  expect(fileMode(collectTokenFile)).toBe(0o600);
  expect(fileMode(fixtureFile(FIXTURE_DATA_DIR, "helper-token"))).toBe(0o600);
}

/** 이동 완료 뒤 새 폴더의 토큰 파일 경로(재생 도구 `--token-file`). */
export function migratedCollectTokenFile(): string {
  return fixtureFile(FIXTURE_DATA_DIR, "collect-token");
}
