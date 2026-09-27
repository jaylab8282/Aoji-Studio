// 이벤트 재생 래퍼 (architecture.md §8.1 "hook 입력" 행, ADR-45).
//
// 실제 재생 도구(`tools/replay/replay.mjs`)를 자식 프로세스로 그대로 실행한다 — 도구를 고치지 않는 것이
// ADR-45의 전제이고, 전송 경로도 §8.1이 지정한 실제 수집 경로 하나로 유지한다.
//
// 시나리오 한 줄씩 상태 전이를 확인해야 하는 spec(E2E-04)이 있으므로 줄 범위를 잘라 재생할 수 있게
// 한다. 시나리오 파일 자체는 읽기만 하고, 잘라낸 조각은 OS 임시 폴더에 만들고 바로 지운다
// (마운트된 fixture 임시 폴더와 저장소 안에는 아무것도 남기지 않는다).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PROJECT_ROOT, readE2eState } from "./e2e-state";

/** 재생 도구 실행 파일(T-023 산출물. 이 하네스는 인자만 넘기고 내용을 바꾸지 않는다). */
export const REPLAY_SCRIPT = join(PROJECT_ROOT, "tools", "replay", "replay.mjs");
/** 시나리오 폴더. */
export const SCENARIOS_DIR = join(PROJECT_ROOT, "tools", "replay", "scenarios");
/** FR-004-AC2 전이표 + 관련 케이스 시나리오(줄별 대응표는 `scenarios/README.md`). */
export const STATES_SCENARIO = join(SCENARIOS_DIR, "states.jsonl");

/** 시나리오의 빈 줄을 뺀 이벤트 줄 목록(재생 도구와 같은 규칙으로 읽는다). */
export function scenarioLines(scenarioPath: string = STATES_SCENARIO): string[] {
  return readFileSync(scenarioPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface ReplayResult {
  /** 재생 도구가 전송했다고 보고한 이벤트 수. */
  sent: number;
  /** 재생 도구 stdout(`재생 완료: N건 전송`). */
  stdout: string;
}

/**
 * 시나리오의 `from`~`to` 줄(1-base, 양끝 포함)만 실제 수집 주소로 재생한다.
 * 수집 주소·토큰은 `.e2e-state.json`에서 가져오므로 주소·포트 literal이 없다.
 */
export function replayScenarioLines(options: {
  from: number;
  to: number;
  scenarioPath?: string;
  /** 줄 사이 간격(ms). 한 줄씩 재생할 때는 의미가 없으므로 기본 0. */
  delayMs?: number;
}): ReplayResult {
  const scenarioPath = options.scenarioPath ?? STATES_SCENARIO;
  const lines = scenarioLines(scenarioPath);
  if (options.from < 1 || options.to > lines.length || options.from > options.to) {
    throw new Error(
      `재생 줄 범위가 시나리오(${lines.length}줄)를 벗어났습니다: ${options.from}~${options.to}`,
    );
  }

  const state = readE2eState();
  const slice = lines.slice(options.from - 1, options.to);
  const scratchDir = mkdtempSync(join(tmpdir(), "jaystudio-e2e-replay-"));
  const slicePath = join(scratchDir, "slice.jsonl");
  writeFileSync(slicePath, `${slice.join("\n")}\n`, "utf8");

  try {
    const stdout = execFileSync(
      "node",
      [
        REPLAY_SCRIPT,
        "--url",
        `${state.baseUrl}/hooks/events`,
        "--token-file",
        state.collectTokenFile,
        "--delay-ms",
        String(options.delayMs ?? 0),
        slicePath,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const expected = `재생 완료: ${slice.length}건 전송`;
    if (!stdout.includes(expected)) {
      throw new Error(`재생 도구 출력에 "${expected}"가 없습니다: ${stdout.trim()}`);
    }
    return { sent: slice.length, stdout };
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `재생 실패(${options.from}~${options.to}줄): ${detail.message ?? ""}\n` +
        `stdout: ${detail.stdout ?? ""}\nstderr: ${detail.stderr ?? ""}`,
    );
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}
