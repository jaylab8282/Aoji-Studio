// E2E 하네스 기동 (architecture.md §8.1, ADR-18). 목킹 없음 — 실제 컨테이너·실제 도우미(터미널만 dry-run).
// 순서: 포트 선점 검사 → fixture 임시 사본 → compose up --build → 준비 대기 → dry-run 도우미(4191) → 다른 Origin 서버(4192).
// 저장소의 실제 에이전트·구성 폴더는 읽지도 쓰지도 않는다. 마운트 대상은 항상 임시 사본이다(Automation Policy).
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BASE_URL,
  COLLECT_TOKEN_PLACEHOLDER,
  COMPOSE_FILE,
  COMPOSE_SERVICE,
  DEFAULT_FIXTURE,
  E2E_DIR,
  FIXTURES_DIR,
  HELPER_LOG_PATH,
  HELPER_SCRIPT,
  HELPER_TOKEN_PLACEHOLDER,
  HELPER_URL,
  ORIGIN_SERVER_LOG_PATH,
  ORIGIN_SERVER_SCRIPT,
  OTHER_ORIGIN_URL,
  STATE_FILE,
  composeEnv,
  readE2eStateOrNull,
  removeE2eState,
  writeE2eState,
} from "./lib/e2e-state";
import { prepareLegacyFixture } from "./lib/legacy-fixture";
import {
  delay,
  describeProcess,
  httpGet,
  isPortOpen,
  isProcessAlive,
  killProcessTree,
  listPortListeners,
  waitForHttpOk,
} from "./lib/harness-utils";

const CONTAINER_READY_TIMEOUT_MS = 240_000;
const HELPER_READY_TIMEOUT_MS = 20_000;
const ORIGIN_SERVER_READY_TIMEOUT_MS = 20_000;
const PUBLIC_PORT = 4185;
const HELPER_PORT = 4191;
const OTHER_ORIGIN_PORT = 4192;

/** 기동 전에 비어 있어야 하는 포트(compose.e2e.yaml·도우미 인자와 같은 값). */
const REQUIRED_FREE_PORTS: { port: number; label: string }[] = [
  { port: PUBLIC_PORT, label: "E2E 공개 포트(컨테이너)" },
  { port: HELPER_PORT, label: "dry-run 도우미" },
  { port: OTHER_ORIGIN_PORT, label: "다른 Origin 페이지 서버" },
];

export default async function globalSetup(): Promise<void> {
  // 낡은 스택(특히 E2E_KEEP_UP=1로 남긴 도우미·Origin 서버)이 살아 있으면 여기서 멈춘다.
  // 그대로 진행하면 새로 띄운 프로세스가 EADDRINUSE로 죽고 헬스 체크는 낡은 프로세스가 통과시킨다.
  await assertPortsFree();
  removeE2eState();

  const fixture = prepareFixture();
  log(`fixture: ${fixture.name} → ${fixture.dir}${fixture.owned ? "" : " (E2E_FIXTURE_DIR 지정)"}`);

  // 호환 fixture(`project-legacy-*`)는 하네스가 난수 토큰을 써 넣고 옛 폴더 sha256을 기록한다(T-R2-10).
  // 그 배치는 표준 도우미를 띄우지 않는다 — E2E-R2-07이 마이그레이션 뒤 shim 도우미를 직접 띄운다.
  const legacy = fixture.owned && fixture.name.startsWith("project-legacy-")
    ? prepareLegacyFixture(fixture.dir, fixture.name)
    : null;
  const tokens = legacy ?? writePlaceholderTokens(fixture.dir);
  writeE2eState({
    ...(legacy === null ? {} : { legacy: legacy.info }),
    fixtureName: fixture.name,
    fixtureDir: fixture.dir,
    fixtureOwned: fixture.owned,
    baseUrl: BASE_URL,
    helperUrl: HELPER_URL,
    otherOriginUrl: OTHER_ORIGIN_URL,
    collectToken: legacy?.info.collectToken ?? COLLECT_TOKEN_PLACEHOLDER,
    collectTokenFile: tokens.collectTokenFile,
    helperToken: legacy?.info.helperToken ?? HELPER_TOKEN_PLACEHOLDER,
    helperTokenFile: tokens.helperTokenFile,
    helperLogPath: HELPER_LOG_PATH,
    helperPid: null,
    originServerLogPath: ORIGIN_SERVER_LOG_PATH,
    originServerPid: null,
    composeFile: COMPOSE_FILE,
    composeService: COMPOSE_SERVICE,
    startedAt: new Date().toISOString(),
  });

  let helper: BackgroundProcess | null = null;
  let originServer: BackgroundProcess | null = null;
  try {
    log("docker compose up -d --build");
    compose(fixture.dir, ["up", "-d", "--build"]);
    try {
      await waitForHttpOk(`${BASE_URL}/`, {
        timeoutMs: CONTAINER_READY_TIMEOUT_MS,
        label: "컨테이너 준비",
      });
    } catch (error) {
      printComposeLogs(fixture.dir);
      throw error;
    }
    log(`컨테이너 준비 완료: ${BASE_URL}`);

    if (legacy === null) {
    helper = startBackgroundProcess(
      [
        HELPER_SCRIPT,
        "--dry-run",
        "--port",
        String(HELPER_PORT),
        "--project-dir",
        fixture.dir,
        "--allowed-origins",
        BASE_URL,
        "--token-file",
        tokens.helperTokenFile,
      ],
      HELPER_LOG_PATH,
    );
    writeE2eState({ helperPid: helper.pid });
    await waitUntilServing(helper, {
      // 도우미 /health는 Origin 규칙을 적용하므로 허용 Origin을 붙여 확인한다(FR-013-AC7).
      healthUrl: `${HELPER_URL}/health`,
      headers: { Origin: BASE_URL },
      port: HELPER_PORT,
      timeoutMs: HELPER_READY_TIMEOUT_MS,
      label: "dry-run 도우미",
    });
    log(`dry-run 도우미 준비 완료: ${HELPER_URL} (pid ${helper.pid}, 로그 ${HELPER_LOG_PATH})`);
    } else {
      log("호환 fixture 배치 — 표준 dry-run 도우미를 띄우지 않습니다(E2E-R2-07이 shim으로 직접 띄움)");
    }

    originServer = startBackgroundProcess(
      [ORIGIN_SERVER_SCRIPT, String(OTHER_ORIGIN_PORT)],
      ORIGIN_SERVER_LOG_PATH,
    );
    writeE2eState({ originServerPid: originServer.pid });
    await waitUntilServing(originServer, {
      healthUrl: `${OTHER_ORIGIN_URL}/`,
      port: OTHER_ORIGIN_PORT,
      timeoutMs: ORIGIN_SERVER_READY_TIMEOUT_MS,
      label: "다른 Origin 페이지 서버",
    });
    log(`다른 Origin 페이지 서버 준비 완료: ${OTHER_ORIGIN_URL} (pid ${originServer.pid})`);
  } catch (error) {
    await cleanupAfterFailure(fixture, [helper, originServer]);
    throw error;
  }
}

/**
 * 하네스가 쓰는 포트가 모두 비어 있는지 확인한다. 하나라도 열려 있으면 누가 쓰는지와
 * 정리 방법을 담아 즉시 실패한다(조용히 낡은 프로세스에 붙는 경로를 없앤다).
 */
async function assertPortsFree(): Promise<void> {
  const occupied: { port: number; label: string }[] = [];
  for (const entry of REQUIRED_FREE_PORTS) {
    if (await isPortOpen(entry.port)) {
      occupied.push(entry);
    }
  }
  if (occupied.length === 0) {
    return;
  }

  const lines = occupied.map((entry) => {
    const pids = listPortListeners(entry.port);
    let owner: string;
    if (pids === null) {
      owner = "소유 프로세스 확인 실패(lsof를 쓸 수 없음)";
    } else if (pids.length === 0) {
      owner = "호스트 프로세스가 아님(컨테이너 포트 공개 등)";
    } else {
      owner = pids
        .map((pid) => `pid ${pid} ${describeProcess(pid) ?? "(명령줄 확인 불가)"}`)
        .join(" / ");
    }
    return `- ${entry.port} (${entry.label}): ${owner}`;
  });

  const stale = readE2eStateOrNull();
  const staleLines =
    stale === null
      ? [`직전 실행 상태 파일 없음(${STATE_FILE})`]
      : [
          `직전 실행 상태 파일(${STATE_FILE}):`,
          `  fixture=${stale.fixtureDir ?? "(없음)"}`,
          `  도우미 pid=${stale.helperPid ?? "(없음)"} / 다른 Origin 서버 pid=${stale.originServerPid ?? "(없음)"}`,
        ];

  throw new Error(
    [
      "E2E가 쓰는 포트가 이미 열려 있어 기동을 중단했습니다.",
      "낡은 스택(예: E2E_KEEP_UP=1로 남긴 컨테이너·도우미)을 정리한 뒤 다시 실행하세요.",
      ...lines,
      ...staleLines,
      "",
      `확인: lsof -nP -iTCP:${REQUIRED_FREE_PORTS.map((entry) => entry.port).join(" -iTCP:")}`,
      `정리: E2E_FIXTURE_DIR=<위 fixture 경로> docker compose -f ${COMPOSE_FILE} down -v`,
      "      kill <위 pid>   # 남아 있는 도우미·다른 Origin 서버",
    ].join("\n"),
  );
}

type Fixture = { name: string; dir: string; owned: boolean };

/**
 * fixture 임시 사본을 만든다. `E2E_FIXTURE_DIR`가 있으면 그 폴더를 그대로 쓴다(수동 실행 호환).
 * 사본은 원본 그대로다 — `.aojistudio/`·`.claude/`가 없는 fixture에 폴더를 만들어 주지 않는다(E2E-06 검증 대상).
 */
function prepareFixture(): Fixture {
  const provided = process.env.E2E_FIXTURE_DIR;
  if (provided !== undefined && provided.trim() !== "") {
    const dir = realpathSync(provided);
    if (!statSync(dir).isDirectory()) {
      throw new Error(`E2E_FIXTURE_DIR가 폴더가 아닙니다: ${dir}`);
    }
    // 폴더를 직접 받았으므로 어떤 fixture를 복사했는지는 호출자만 안다.
    return { name: process.env.E2E_FIXTURE ?? "(E2E_FIXTURE_DIR)", dir, owned: false };
  }

  const name = process.env.E2E_FIXTURE ?? DEFAULT_FIXTURE;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(`E2E_FIXTURE 이름이 올바르지 않습니다: ${name}`);
  }
  const source = join(FIXTURES_DIR, name);
  if (!existsSync(source)) {
    throw new Error(`fixture를 찾을 수 없습니다: ${source}`);
  }
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "aojistudio-e2e-"));
  // 숨은 항목까지 그대로 복사한다(`<source>/.` 형식).
  execFileSync("cp", ["-R", `${source}/.`, dir], { stdio: "inherit" });
  return { name, dir, owned: true };
}

/**
 * 수집·도우미 토큰을 고정 placeholder 값으로 만든다(architecture.md §6.3).
 * 고정값이라 실제 `.aojistudio/`의 난수 토큰과 같아질 수 없다. 토큰 파일이 이미 있으면 덮어쓴다.
 */
function writePlaceholderTokens(fixtureDir: string): {
  collectTokenFile: string;
  helperTokenFile: string;
} {
  const aojistudioDir = join(fixtureDir, ".aojistudio");
  mkdirSync(aojistudioDir, { recursive: true });
  const collectTokenFile = join(aojistudioDir, "collect-token");
  const helperTokenFile = join(aojistudioDir, "helper-token");
  for (const [path, token] of [
    [collectTokenFile, COLLECT_TOKEN_PLACEHOLDER],
    [helperTokenFile, HELPER_TOKEN_PLACEHOLDER],
  ] as const) {
    writeFileSync(path, token, { encoding: "utf8", mode: 0o600 });
    chmodSync(path, 0o600);
  }
  return { collectTokenFile, helperTokenFile };
}

function compose(fixtureDir: string, args: string[]): void {
  execFileSync("docker", ["compose", "-f", COMPOSE_FILE, ...args], {
    cwd: E2E_DIR,
    env: composeEnv(fixtureDir),
    stdio: "inherit",
  });
}

function printComposeLogs(fixtureDir: string): void {
  try {
    const logs = execFileSync(
      "docker",
      ["compose", "-f", COMPOSE_FILE, "logs", "--tail", "200", COMPOSE_SERVICE],
      { cwd: E2E_DIR, env: composeEnv(fixtureDir), encoding: "utf8" },
    );
    log(`docker compose logs (tail 200):\n${logs}`);
  } catch (error) {
    log(`docker compose logs 실패: ${message(error)}`);
  }
}

type BackgroundProcess = {
  pid: number;
  logPath: string;
  /** 프로세스가 이미 끝났는지(EADDRINUSE 등으로 즉시 죽는 경우 포함). */
  hasExited: () => boolean;
  /** 끝난 이유(종료 코드·시그널). 아직 살아 있으면 `null`. */
  exitReason: () => string | null;
};

/**
 * 백그라운드 프로세스를 띄우고 stdout·stderr를 로그 파일로 모은다.
 * `detached`로 띄워 teardown이 pid만으로 그룹을 끝낼 수 있게 하고, 조기 종료를 감지할 수 있게 한다.
 */
function startBackgroundProcess(args: string[], logPath: string): BackgroundProcess {
  const fd = openSync(logPath, "w");
  try {
    const child = spawn(process.execPath, args, {
      cwd: E2E_DIR,
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    let exitReason: string | null = null;
    child.once("exit", (code, signal) => {
      exitReason = `종료 코드 ${code ?? "없음"}, 시그널 ${signal ?? "없음"}`;
    });
    child.unref();
    const pid = child.pid;
    if (pid === undefined) {
      throw new Error(`백그라운드 프로세스를 띄우지 못했습니다: ${args[0]}`);
    }
    return {
      pid,
      logPath,
      // exit 이벤트와 실제 프로세스 존재를 함께 본다(둘 중 하나만으로 판정하지 않는다).
      hasExited: () => exitReason !== null || !isProcessAlive(pid),
      exitReason: () => exitReason,
    };
  } finally {
    closeSync(fd);
  }
}

/**
 * 띄운 프로세스가 **자신이** 그 포트에서 응답하기 시작할 때까지 기다린다.
 * - 프로세스가 죽었으면(EADDRINUSE 등) 즉시 실패하고 로그 끝부분을 보여준다.
 * - 헬스 체크가 통과하면 그 포트를 듣고 있는 pid가 내가 띄운 pid인지 확인한다.
 *   "헬스 체크는 통과했지만 응답한 것은 낡은 프로세스" 경로를 남기지 않기 위함이다.
 */
async function waitUntilServing(
  backgroundProcess: BackgroundProcess,
  options: {
    healthUrl: string;
    port: number;
    timeoutMs: number;
    label: string;
    headers?: Record<string, string>;
  },
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  let lastReason = "시도 없음";
  while (Date.now() < deadline) {
    if (backgroundProcess.hasExited()) {
      throw new Error(
        `${options.label}가 기동 직후 종료됐습니다(${backgroundProcess.exitReason() ?? "프로세스 없음"}). ` +
          `포트 ${options.port}를 다른 프로세스가 쓰고 있을 수 있습니다(EADDRINUSE).\n` +
          tailLog(backgroundProcess.logPath),
      );
    }
    try {
      const response = await httpGet(options.healthUrl, options.headers ?? {});
      if (response.status === 200) {
        assertPortOwnedBy(options.port, backgroundProcess.pid, options.label);
        return;
      }
      lastReason = `상태 코드 ${response.status}`;
    } catch (error) {
      lastReason = message(error);
    }
    await delay(250);
  }
  throw new Error(
    `${options.label} 준비 대기 ${options.timeoutMs}ms 초과 — 주소 ${options.healthUrl}, ` +
      `마지막 실패: ${lastReason}\n${tailLog(backgroundProcess.logPath)}`,
  );
}

/** 포트를 듣고 있는 프로세스가 내가 띄운 pid인지 확인한다. */
function assertPortOwnedBy(port: number, pid: number, label: string): void {
  const listeners = listPortListeners(port);
  if (listeners === null) {
    log(
      `경고: lsof를 쓸 수 없어 포트 ${port} 소유자를 확인하지 못했습니다. ` +
        `기동 전 선점 검사와 pid ${pid} 생존 확인으로만 판정합니다.`,
    );
    return;
  }
  if (!listeners.includes(pid)) {
    throw new Error(
      `${label}의 헬스 체크는 통과했지만 포트 ${port}를 듣고 있는 프로세스가 ` +
        `내가 띄운 pid ${pid}가 아닙니다(실제: ${listeners.join(", ") || "없음"}). ` +
        "낡은 프로세스가 응답했을 수 있으니 정리한 뒤 다시 실행하세요.",
    );
  }
}

/** 로그 파일 끝부분(진단용). 토큰·요청 본문은 도우미가 애초에 로그에 남기지 않는다. */
function tailLog(logPath: string, lines = 20): string {
  if (!existsSync(logPath)) {
    return `로그 파일이 없습니다: ${logPath}`;
  }
  const tail = readFileSync(logPath, "utf8").split("\n").slice(-lines).join("\n");
  return `로그 끝부분(${logPath}):\n${tail}`;
}

/** 기동 중 실패하면 띄운 것을 되돌린다. `E2E_KEEP_UP=1`이면 조사용으로 남긴다. */
async function cleanupAfterFailure(
  fixture: Fixture,
  processes: (BackgroundProcess | null)[],
): Promise<void> {
  if (process.env.E2E_KEEP_UP === "1") {
    log("E2E_KEEP_UP=1 — 실패한 상태를 그대로 남깁니다(수동 정리 필요).");
    return;
  }
  for (const backgroundProcess of processes) {
    if (backgroundProcess !== null) {
      await killProcessTree(backgroundProcess.pid);
    }
  }
  try {
    compose(fixture.dir, ["down", "-v"]);
  } catch (error) {
    log(`docker compose down 실패: ${message(error)}`);
  }
  if (fixture.owned) {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function log(text: string): void {
  process.stdout.write(`[e2e globalSetup] ${text}\n`);
}
