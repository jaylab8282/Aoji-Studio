// E2E-14 포트 바인딩 (architecture.md §8.2 E2E-14·§4.3·ADR-05, NFR-04).
// 실제로 띄운 e2e 컨테이너에 대해 `scripts/check-port.sh`를 실행해 호스트 노출이 127.0.0.1 뿐임을 확인한다.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { COMPOSE_SERVICE, CONTAINER_PORT, E2E_DIR, composeEnv, readE2eState } from "../lib/e2e-state";

test("[NFR-04][FR-003-AC1][E2E-14] check-port.sh → exit 0, docker compose port 결과가 127.0.0.1:4185", () => {
  const state = readE2eState();

  const stdout = execFileSync(
    join(E2E_DIR, "scripts", "check-port.sh"),
    ["compose.e2e.yaml", COMPOSE_SERVICE, CONTAINER_PORT],
    { cwd: E2E_DIR, env: composeEnv(state.fixtureDir), encoding: "utf8" },
  );

  // execFileSync는 exit 0이 아니면 던진다(exit 0 확인).
  expect(stdout).toContain("127.0.0.1:4185");
  expect(stdout).toContain("PASS: 127.0.0.1에만 바인딩됨");
  expect(stdout).not.toContain("0.0.0.0");
});

test("[NFR-04][E2E-14] docker inspect → 호스트 포트 바인딩 HostIp가 127.0.0.1 하나뿐", () => {
  const state = readE2eState();

  const containerId = execFileSync(
    "docker",
    ["compose", "-f", state.composeFile, "ps", "-q", COMPOSE_SERVICE],
    { cwd: E2E_DIR, env: composeEnv(state.fixtureDir), encoding: "utf8" },
  ).trim();
  expect(containerId).not.toBe("");

  const raw = execFileSync(
    "docker",
    ["inspect", "--format", "{{json .HostConfig.PortBindings}}", containerId],
    { encoding: "utf8" },
  );
  const bindings = JSON.parse(raw) as Record<string, { HostIp: string; HostPort: string }[]>;

  const hostIps = Object.values(bindings).flat().map((binding) => binding.HostIp);
  expect(hostIps.length).toBeGreaterThan(0);
  expect(new Set(hostIps)).toEqual(new Set(["127.0.0.1"]));
  expect(bindings[`${CONTAINER_PORT}/tcp`]).toEqual([{ HostIp: "127.0.0.1", HostPort: "4185" }]);
});
