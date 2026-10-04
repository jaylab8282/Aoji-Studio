// E2E 하네스 공용 상수·상태 파일 접근 (architecture.md §8.1).
// globalSetup이 만든 임시 fixture·토큰·도우미 로그 위치를 spec이 읽는 유일한 통로다.
// 저장소의 실제 에이전트 폴더는 참조하지 않는다. 경로는 모두 이 파일 위치에서 계산한다.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `tools/e2e` 절대 경로. */
export const E2E_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
/** 프로젝트 루트(`AojiStudio`) 절대 경로. */
export const PROJECT_ROOT = resolve(E2E_DIR, "..", "..");
/** fixture 원본 폴더(복사 원본. 테스트는 이 폴더를 수정하지 않는다). */
export const FIXTURES_DIR = join(PROJECT_ROOT, "tools", "fixtures");

/**
 * `E2E_COMPOSE=legacy-env`이면 환경 변수만 옛 이름인 호환 compose(E2E-R2-03)를 쓴다. 그 밖의 값은 오류다.
 * 값이 없으면 표준 `compose.e2e.yaml`이다.
 */
const COMPOSE_VARIANT = process.env.E2E_COMPOSE ?? "";
if (COMPOSE_VARIANT !== "" && COMPOSE_VARIANT !== "legacy-env") {
  throw new Error(`E2E_COMPOSE 값이 올바르지 않습니다: ${COMPOSE_VARIANT} (legacy-env만 허용)`);
}
export const COMPOSE_FILE = join(
  E2E_DIR,
  COMPOSE_VARIANT === "legacy-env" ? "compose.e2e-legacy-env.yaml" : "compose.e2e.yaml",
);
export const COMPOSE_SERVICE = "aojistudio-e2e";
export const CONTAINER_PORT = "4180";

export const STATE_FILE = join(E2E_DIR, ".e2e-state.json");
export const HELPER_LOG_PATH = join(E2E_DIR, ".helper-dry-run.log");
export const ORIGIN_SERVER_LOG_PATH = join(E2E_DIR, ".other-origin-server.log");

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4185";
export const HELPER_URL = "http://127.0.0.1:4191";
/** E2E-08이 쓰는 "다른 Origin" 정적 페이지. 127.0.0.1에만 바인딩한다(NFR-04). */
export const OTHER_ORIGIN_URL = "http://127.0.0.1:4192";

export const HELPER_SCRIPT = join(PROJECT_ROOT, "helper", "aojistudio-helper.mjs");
export const ORIGIN_SERVER_SCRIPT = join(E2E_DIR, "lib", "other-origin-server.mjs");

/** `E2E_FIXTURE`를 주지 않았을 때 쓰는 fixture. */
export const DEFAULT_FIXTURE = "project-basic";

// 임시 fixture 사본에 넣는 고정 placeholder 토큰(hex 64자).
// 난수가 아니라 고정값이므로 실제 운영 토큰과 절대 같아지지 않는다(격리 확인용).
export const COLLECT_TOKEN_PLACEHOLDER = "e2e0c011".repeat(8);
export const HELPER_TOKEN_PLACEHOLDER = "e2e0fee1".repeat(8);

/** 호환 fixture(`project-legacy-*`)를 준비할 때 하네스가 써 넣은 값(tasks.md T-R2-10, architecture §8.4.1). */
export type LegacyFixtureInfo = {
  kind: "only" | "both";
  /** 서버가 수집 토큰으로 쓰는 값(only: 옛 폴더 값 = 이동 뒤에도 같다 / both: 새 폴더 값). */
  collectToken: string;
  /** both일 때만: 옛 폴더의 collect-token 값(새 폴더 값과 다르다). only이면 null. */
  oldCollectToken: string | null;
  /** only일 때만: 옛 폴더의 helper-token 값. both이면 null. */
  helperToken: string | null;
  /** 기동 전 옛 데이터 폴더 아래 모든 파일의 sha256(상대 경로 → hex). */
  legacyDirSha256: Record<string, string>;
};

/** 호환 배치(옛 이름을 일부러 쓰는 배치)인지. 표준 배치의 `[legacy]` 0건 검사(E2E-R2-06)는 이 배치에 적용하지 않는다. */
export function isCompatBatch(): boolean {
  return COMPOSE_VARIANT !== "" || (process.env.E2E_FIXTURE ?? "").startsWith("project-legacy-");
}

export type E2eState = {
  /** 복사한 fixture 이름(`tools/fixtures/<name>`). */
  fixtureName: string;
  /** 컨테이너에 마운트한 임시 fixture 폴더(`mktemp -d` 상당). */
  fixtureDir: string;
  /** globalSetup이 직접 만든 폴더인지(true면 teardown에서 지운다). */
  fixtureOwned: boolean;
  baseUrl: string;
  helperUrl: string;
  otherOriginUrl: string;
  collectToken: string;
  collectTokenFile: string;
  helperToken: string;
  helperTokenFile: string;
  /** dry-run 도우미 stdout·stderr 로그(E2E-09가 `DRY-RUN ...` 줄을 읽는다). */
  helperLogPath: string;
  helperPid: number | null;
  originServerLogPath: string;
  originServerPid: number | null;
  composeFile: string;
  composeService: string;
  startedAt: string;
  /** 호환 fixture 배치에서만 있다. */
  legacy?: LegacyFixtureInfo;
};

/** 상태 파일을 덮어쓴다(부분 갱신). globalSetup·globalTeardown만 호출한다. */
export function writeE2eState(patch: Partial<E2eState>): Partial<E2eState> {
  const merged = { ...(readE2eStateOrNull() ?? {}), ...patch };
  writeFileSync(STATE_FILE, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}

/** 상태 파일을 읽는다. 없으면 `null`. */
export function readE2eStateOrNull(): Partial<E2eState> | null {
  if (!existsSync(STATE_FILE)) {
    return null;
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as Partial<E2eState>;
}

/** 상태 파일을 읽는다. globalSetup이 돌지 않았으면 던진다(테스트에서 사용). */
export function readE2eState(): E2eState {
  const state = readE2eStateOrNull();
  if (state === null || typeof state.fixtureDir !== "string") {
    throw new Error(
      `E2E 상태 파일이 없습니다(${STATE_FILE}). globalSetup을 거치지 않고 실행했습니다.`,
    );
  }
  return state as E2eState;
}

export function removeE2eState(): void {
  rmSync(STATE_FILE, { force: true });
}

/** dry-run 도우미 로그 전체(없으면 빈 문자열). */
export function readHelperLog(): string {
  const path = readE2eStateOrNull()?.helperLogPath ?? HELPER_LOG_PATH;
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf8");
}

/** 도우미 로그에서 `DRY-RUN <명령>` 줄만 뽑는다(E2E-09). */
export function helperDryRunLines(): string[] {
  return readHelperLog()
    .split("\n")
    .filter((line) => line.startsWith("DRY-RUN "));
}

/** `docker compose` 실행에 필요한 환경 변수(fixture 경로 보간). */
export function composeEnv(fixtureDir: string): Record<string, string | undefined> {
  return { ...process.env, E2E_FIXTURE_DIR: fixtureDir };
}
