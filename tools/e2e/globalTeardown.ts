// E2E 하네스 정리 (architecture.md §8.1). 도우미·다른 Origin 서버 종료 → compose down -v → 임시 fixture 삭제.
// `E2E_KEEP_UP=1`이면 실패 원인 조사를 위해 아무것도 정리하지 않는다.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

import {
  COMPOSE_FILE,
  E2E_DIR,
  composeEnv,
  readE2eStateOrNull,
  removeE2eState,
} from "./lib/e2e-state";
import { killProcessTree, waitForPortClosed } from "./lib/harness-utils";

const HELPER_PORT = 4191;
const OTHER_ORIGIN_PORT = 4192;
const PORT_CLOSE_TIMEOUT_MS = 10_000;

export default async function globalTeardown(): Promise<void> {
  const state = readE2eStateOrNull();
  if (state === null) {
    log("상태 파일이 없습니다 — 정리할 것이 없습니다.");
    return;
  }
  if (process.env.E2E_KEEP_UP === "1") {
    log(
      `E2E_KEEP_UP=1 — 정리를 건너뜁니다. fixture=${state.fixtureDir} 도우미 pid=${state.helperPid} ` +
        `다른 Origin 서버 pid=${state.originServerPid} 로그=${state.helperLogPath}`,
    );
    log(
      `수동 정리: docker compose -f ${COMPOSE_FILE} down -v (E2E_FIXTURE_DIR=${state.fixtureDir})`,
    );
    return;
  }

  const problems: string[] = [];

  // E2E-R2-06: 표준 배치(새 이름만 쓰는 배치)의 컨테이너 로그에 `[legacy]` 줄이 0건이어야 한다.
  // down -v 전에 읽는다(컨테이너가 사라지면 로그도 사라진다).
  if (typeof state.fixtureDir === "string") {
    try {
      const logs = execFileSync(
        "docker",
        ["compose", "-f", COMPOSE_FILE, "logs", "--no-color", "--no-log-prefix"],
        { cwd: E2E_DIR, env: composeEnv(state.fixtureDir), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      );
      const legacyLines = logs.split("\n").filter((line) => line.includes("[legacy]"));
      if (logs.trim() === "") {
        problems.push("E2E-R2-06: 컨테이너 로그가 비어 있어 [legacy] 0건을 판정할 수 없습니다");
      } else if (legacyLines.length > 0) {
        problems.push(`E2E-R2-06: 표준 배치 로그에 [legacy] ${legacyLines.length}줄: ${legacyLines[0]}`);
      } else {
        log(`E2E-R2-06 통과 — 컨테이너 로그 ${logs.split("\n").length}줄에 [legacy] 0건`);
      }
    } catch (error) {
      problems.push(`E2E-R2-06: 컨테이너 로그 읽기 실패: ${message(error)}`);
    }
  }

  for (const pid of [state.helperPid, state.originServerPid]) {
    if (typeof pid === "number") {
      try {
        await killProcessTree(pid);
        log(`프로세스 종료: pid ${pid}`);
      } catch (error) {
        problems.push(`pid ${pid} 종료 실패: ${message(error)}`);
      }
    }
  }

  if (typeof state.fixtureDir === "string") {
    try {
      execFileSync("docker", ["compose", "-f", COMPOSE_FILE, "down", "-v"], {
        cwd: E2E_DIR,
        env: composeEnv(state.fixtureDir),
        stdio: "inherit",
      });
      log("docker compose down -v 완료");
    } catch (error) {
      problems.push(`docker compose down 실패: ${message(error)}`);
    }
  }

  if (state.fixtureOwned === true && typeof state.fixtureDir === "string") {
    try {
      rmSync(state.fixtureDir, { recursive: true, force: true });
      log(`임시 fixture 삭제: ${state.fixtureDir}`);
    } catch (error) {
      problems.push(`임시 fixture 삭제 실패: ${message(error)}`);
    }
  }

  for (const port of [HELPER_PORT, OTHER_ORIGIN_PORT]) {
    if (!(await waitForPortClosed(port, PORT_CLOSE_TIMEOUT_MS))) {
      problems.push(`포트 ${port}가 아직 열려 있습니다(프로세스가 남았습니다)`);
    }
  }

  removeE2eState();

  if (problems.length > 0) {
    throw new Error(`E2E 정리 실패:\n- ${problems.join("\n- ")}`);
  }
  log("정리 완료 — 남은 프로세스·포트 없음");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function log(text: string): void {
  process.stdout.write(`[e2e globalTeardown] ${text}\n`);
}
