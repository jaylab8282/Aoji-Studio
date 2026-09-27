// E2E 하네스 공용 상수·상태 파일 접근 (architecture.md §8.1).
// globalSetup이 만든 임시 fixture·토큰·도우미 로그 위치를 spec이 읽는 유일한 통로다.
// 저장소의 실제 에이전트 폴더는 참조하지 않는다. 경로는 모두 이 파일 위치에서 계산한다.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `tools/e2e` 절대 경로. */
export const E2E_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
/** 프로젝트 루트(`Jay_Studio`) 절대 경로. */
export const PROJECT_ROOT = resolve(E2E_DIR, "..", "..");
/** fixture 원본 폴더(복사 원본. 테스트는 이 폴더를 수정하지 않는다). */
export const FIXTURES_DIR = join(PROJECT_ROOT, "tools", "fixtures");

export const COMPOSE_FILE = join(E2E_DIR, "compose.e2e.yaml");
export const COMPOSE_SERVICE = "jaystudio-e2e";
export const CONTAINER_PORT = "4180";

export const STATE_FILE = join(E2E_DIR, ".e2e-state.json");
export const HELPER_LOG_PATH = join(E2E_DIR, ".helper-dry-run.log");
export const ORIGIN_SERVER_LOG_PATH = join(E2E_DIR, ".other-origin-server.log");

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4185";
export const HELPER_URL = "http://127.0.0.1:4191";
/** E2E-08이 쓰는 "다른 Origin" 정적 페이지. 127.0.0.1에만 바인딩한다(NFR-04). */
export const OTHER_ORIGIN_URL = "http://127.0.0.1:4192";

export const HELPER_SCRIPT = join(PROJECT_ROOT, "helper", "jaystudio-helper.mjs");
export const ORIGIN_SERVER_SCRIPT = join(E2E_DIR, "lib", "other-origin-server.mjs");

/** `E2E_FIXTURE`를 주지 않았을 때 쓰는 fixture. */
export const DEFAULT_FIXTURE = "project-basic";

// 임시 fixture 사본에 넣는 고정 placeholder 토큰(hex 64자).
// 난수가 아니라 고정값이므로 실제 운영 토큰과 절대 같아지지 않는다(격리 확인용).
export const COLLECT_TOKEN_PLACEHOLDER = "e2e0c011".repeat(8);
export const HELPER_TOKEN_PLACEHOLDER = "e2e0fee1".repeat(8);

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
