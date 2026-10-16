// E2E-26: 전역 Claude 설정 연결 격리 (T-R4-20, 배치 13). fixture: `project-usage` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-basic`(architecture §8.2 배치 13).
// 검증 ID: NFR-06·NFR-15·FR-027-AC7 — `docker exec`로 컨테이너 안을 본다.
//   ① `.credentials.json`이 컨테이너 어디에도 없다(fixture에는 표지 `AOJI-MARKER-CRED-2e9a`가 든 파일이 있지만 연결되지 않는다, ADR-79 결정 4).
//   ② `/claude-home` 아래는 4개 경로(`.claude.json`·`.claude/settings.json`·`.claude/plugins`·`.claude/projects`)뿐이다.
//   ③ 4개 경로 모두 쓰기 시도가 실패한다(읽기 전용 bind): 파일 `>>`·`touch`, 폴더 안 새 파일, 홈·`.claude` 아래 새 항목.
//   ④ `docker inspect`의 마운트도 4개 모두 `RW=false`다.
// 목킹 없음. 컨테이너 사용자는 1000:1000이다(compose.e2e.yaml).
import { spawnSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
import { containerId, containerStatus } from "./container-helpers";

test.describe.configure({ mode: "serial" });

const HOME = "/claude-home";
const CONNECTED = [
  `${HOME}/.claude.json`,
  `${HOME}/.claude/settings.json`,
  `${HOME}/.claude/plugins`,
  `${HOME}/.claude/projects`,
] as const;
const CRED_MARKER = "AOJI-MARKER-CRED-2e9a";

function exec(command: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("docker", ["exec", containerId(), "sh", "-c", command], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

test.beforeAll(() => {
  expect(containerStatus(), "e2e 컨테이너가 running이 아닙니다(e2e-22의 pause 뒤 unpause 확인)").toBe("running");
  expect(readE2eState().claudeHomeDir, "전역 연결 fixture가 연결되지 않았습니다").not.toBeNull();
});

test("[NFR-15][FR-027-AC7][E2E-26] .credentials.json이 컨테이너 안에 없고 표지 CRED도 어디에도 없다", () => {
  expect(exec(`test ! -e ${HOME}/.claude/.credentials.json`).status, "/claude-home/.claude/.credentials.json 존재").toBe(0);
  const found = exec("find / -xdev -name '.credentials.json' 2>/dev/null; find /claude-home /workspace /data -name '.credentials.json' 2>/dev/null");
  expect(found.stdout.trim(), "컨테이너 안 .credentials.json").toBe("");
  const grep = exec(`grep -rl '${CRED_MARKER}' ${HOME} /workspace /data /app 2>/dev/null`);
  expect(grep.stdout.trim(), "표지 CRED가 든 파일").toBe("");
});

test("[NFR-06][NFR-15][E2E-26] /claude-home 아래에는 연결한 4개 경로뿐이다", () => {
  const top = exec(`ls -A ${HOME}`);
  expect(top.stdout.trim().split("\n").sort()).toEqual([".claude", ".claude.json"]);
  const inner = exec(`ls -A ${HOME}/.claude`);
  expect(inner.stdout.trim().split("\n").sort()).toEqual(["plugins", "projects", "settings.json"]);
});

test("[NFR-06][E2E-26] 4개 경로 모두 읽을 수 있지만 쓰기 시도는 실패한다", () => {
  for (const path of CONNECTED) {
    expect(exec(`test -r ${path}`).status, `${path} 읽기`).toBe(0);
  }
  const attempts: Array<[string, string]> = [
    ["파일 덧붙이기 .claude.json", `echo x >> ${HOME}/.claude.json`],
    ["파일 덧붙이기 settings.json", `echo x >> ${HOME}/.claude/settings.json`],
    ["touch .claude.json", `touch ${HOME}/.claude.json`],
    ["touch settings.json", `touch ${HOME}/.claude/settings.json`],
    ["plugins 아래 새 파일", `touch ${HOME}/.claude/plugins/e2e26-new`],
    ["projects 아래 새 파일", `touch ${HOME}/.claude/projects/e2e26-new`],
    ["projects 아래 새 폴더", `mkdir ${HOME}/.claude/projects/e2e26-dir`],
    ["plugins 삭제", `rm -rf ${HOME}/.claude/plugins/cache`],
    ["홈 아래 새 항목", `touch ${HOME}/e2e26-new`],
    ["~/.claude 아래 새 항목", `touch ${HOME}/.claude/e2e26-new`],
    ["~/.claude/.credentials.json 만들기", `touch ${HOME}/.claude/.credentials.json`],
  ];
  for (const [label, command] of attempts) {
    const result = exec(command);
    expect(result.status, `${label}: 쓰기가 성공했습니다 (${result.stderr.trim()})`).not.toBe(0);
  }
  // 시도 뒤에도 아무것도 생기지 않았다.
  const after = exec(`find ${HOME} -name 'e2e26-*' -o -name '.credentials.json'`);
  expect(after.stdout.trim()).toBe("");
});

test("[NFR-06][E2E-26] docker inspect: 4개 마운트가 모두 읽기 전용이고 /claude-home 마운트는 4개뿐이다", () => {
  const inspect = spawnSync("docker", ["inspect", "--format", "{{json .Mounts}}", containerId()], { encoding: "utf8" });
  expect(inspect.status).toBe(0);
  const mounts = (JSON.parse(inspect.stdout) as Array<{ Destination: string; RW: boolean; Type: string }>).filter((mount) =>
    mount.Destination.startsWith(HOME),
  );
  expect(mounts.map((mount) => mount.Destination).sort()).toEqual([...CONNECTED].sort());
  for (const mount of mounts) {
    expect(mount.RW, `${mount.Destination} RW`).toBe(false);
    expect(mount.Type).toBe("bind");
  }
});
