// 컨테이너를 얼리고 되돌리는 도우미 (E2E-13의 04-3 캡처가 쓴다 — E2E-05와 같은 방식, ADR-76 결정 3).
// spec 파일이 아니므로 Playwright가 테스트로 수집하지 않는다(testMatch `*.spec.ts`).
// 주소·포트 literal 없이 `.e2e-state.json`의 compose 파일·서비스만 쓴다.
import { execFileSync } from "node:child_process";

import { expect } from "@playwright/test";

import { E2E_DIR, composeEnv, readE2eState } from "../lib/e2e-state";

function compose(args: string[]): string {
  const state = readE2eState();
  return execFileSync("docker", ["compose", "-f", state.composeFile, ...args], {
    cwd: E2E_DIR,
    env: composeEnv(state.fixtureDir),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function containerId(): string {
  const state = readE2eState();
  const id = compose(["ps", "-q", state.composeService]).trim();
  expect(id, "e2e 컨테이너를 찾을 수 없습니다").not.toBe("");
  return id;
}

/** `running` / `paused` 등 docker가 보고하는 컨테이너 상태. */
export function containerStatus(): string {
  return execFileSync("docker", ["inspect", "--format", "{{.State.Status}}", containerId()], {
    encoding: "utf8",
  }).trim();
}

export function pauseContainer(): void {
  compose(["pause", readE2eState().composeService]);
  expect(containerStatus(), "컨테이너가 paused 상태가 되지 않았습니다").toBe("paused");
}

/** 이미 running이면 아무것도 하지 않는다(실패 경로에서 여러 번 불려도 안전하다). */
export function ensureUnpaused(): void {
  if (containerStatus() !== "paused") {
    return;
  }
  compose(["unpause", readE2eState().composeService]);
  expect(containerStatus(), "컨테이너를 running으로 되돌리지 못했습니다").toBe("running");
}
