// 격리 확인 (tasks.md T-024 Done when "격리", CLAUDE.md 절대 제약, ADR-18).
// ① 하네스 소스가 실제 에이전트 폴더 경로를 참조하지 않는지 문자열로 검사한다.
// ② 실제로 띄운 컨테이너가 임시 fixture 사본만 마운트했는지 런타임으로 확인한다.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { COMPOSE_SERVICE, E2E_DIR, PROJECT_ROOT, composeEnv, readE2eState } from "../lib/e2e-state";

/**
 * 하네스를 이루는 파일 전부.
 *
 * **제외하는 것은 테스트 spec(`*.spec.ts`)뿐이다** — spec은 금지 패턴을 단언 데이터로 들고 있기
 * 때문이고(이 파일의 `FORBIDDEN_PATH_PATTERNS`가 그 예다), 그 사유가 없는 파일은 spec이 아니어도
 * 모두 검사 대상이다(T-024 리뷰 Minor 1):
 * - `tests/ui-helpers.ts`는 fixture 경로를 계산하고 파일을 쓰므로 오히려 핵심 검사 대상이다.
 * - `scripts/*.sh`도 경로를 만들어 docker에 넘긴다(`run-e2e.sh`는 실행 진입점, `check-port.sh`는 compose 파일 경로).
 *
 * 목록에서 빠진 파일이 그대로 사각이 되므로, 아래 "HARNESS_FILES가 하네스 소스 전부를 덮는다"
 * 테스트가 실제 파일 트리와 이 목록을 대조한다(새 하네스 파일을 만들면 그 테스트가 먼저 깨진다).
 */
const HARNESS_FILES = [
  "globalSetup.ts",
  "globalTeardown.ts",
  "playwright.config.ts",
  "compose.e2e.yaml",
  join("lib", "e2e-state.ts"),
  join("lib", "harness-utils.ts"),
  join("lib", "other-origin-server.mjs"),
  join("lib", "replay.ts"),
  join("scripts", "check-compose-build.sh"),
  join("scripts", "check-compose-config.sh"),
  join("scripts", "check-old-env.sh"),
  join("scripts", "check-old-names.sh"),
  join("scripts", "check-port.sh"),
  join("scripts", "run-e2e.sh"),
  join("tests", "container-helpers.ts"),
  join("tests", "desk-metrics.ts"),
  join("tests", "screen-helpers.ts"),
  join("tests", "showcase-helpers.ts"),
  join("tests", "ui-helpers.ts"),
];

/** 하네스 소스 목록 대조에서 건너뛰는 폴더(의존성·산출물이라 하네스 코드가 아니다). */
const NON_SOURCE_DIRS = new Set(["node_modules", "screenshots", "test-results"]);
/** 하네스 소스로 보는 확장자(설정·데이터 파일 `*.json`은 코드가 아니라 제외). */
const SOURCE_EXTENSIONS = [".ts", ".mjs", ".yaml", ".yml", ".sh"];

/** 하네스 코드에 나타나면 안 되는 경로 표기(주석은 제외하고 검사한다). */
const FORBIDDEN_PATH_PATTERNS = [
  /\/Users\//,
  /Desktop\/AojiStudio/,
  /AojiStudio\/\.claude/,
  /AojiStudio\/\.aojistudio/,
  /homedir\(/,
  /process\.env\.HOME/,
  /(^|[^\w])~\//,
];

/**
 * `.claude`·`.aojistudio`를 코드에서 언급할 때 같은 줄에 있어야 하는 근거.
 * fixture 경로이거나, 전역 연결의 대역(`claude-home-off`)·임시 사본(`E2E_CLAUDE_HOME`)·컨테이너 쪽 경로(`/claude-home/`)다.
 * 실제 홈 경로는 이 근거가 될 수 없다(위 금지 패턴이 `~/`·`homedir(`·`/Users/`를 막는다).
 */
const FIXTURE_CONTEXT = /fixture|claude-home-off|E2E_CLAUDE_HOME|\/claude-home\/|stand[-_]in/i;
/** `state.claudeHomeDir` 같은 속성 접근(`.claude` 바로 뒤에 영문자가 붙는 식별자)은 경로가 아니다. */
const PROPERTY_ACCESS = /\.claude[A-Za-z]/g;

/**
 * 경로 표기를 한 형태로 맞춘다.
 * Docker Desktop은 bind 소스를 VM 내부 경로(`/host_mnt/...`)로 보고할 때가 있고,
 * macOS 임시 폴더는 `/var/...`와 `/private/var/...` 두 표기가 같은 폴더를 가리킨다.
 */
function canonicalPath(path: string): string {
  const withoutVmPrefix = path.startsWith("/host_mnt/") ? path.slice("/host_mnt".length) : path;
  return withoutVmPrefix.startsWith("/private/")
    ? withoutVmPrefix.slice("/private".length)
    : withoutVmPrefix;
}

/**
 * bind 소스가 fixture 폴더인지. Docker Desktop(WSL2)은 호스트 경로를 보고하지 않고
 * `/run/desktop/mnt/host/wsl/docker-desktop-bind-mounts/<배포판>/<호스트 경로의 sha256>`을 보고한다.
 * (D-110 실행 환경: WSL2 + Docker Desktop. 해시는 bind 소스 호스트 경로의 sha256이다.)
 * 이 경우 마지막 마디가 fixture 경로(원본·canonical 표기 둘 중 하나)의 sha256과 같은지로 판정한다.
 */
function bindSourceIsFixture(source: string, fixtureDir: string, rawFixtureDir: string): boolean {
  const bindMountsDir = /\/docker-desktop-bind-mounts\/[^/]+\/([0-9a-f]{64})$/.exec(source);
  if (bindMountsDir !== null) {
    const hashOf = (path: string) => createHash("sha256").update(path).digest("hex");
    return [fixtureDir, rawFixtureDir].some((path) => hashOf(path) === bindMountsDir[1]);
  }
  return canonicalPath(source) === fixtureDir;
}

function readHarnessCode(relativePath: string): string {
  const source = readFileSync(join(E2E_DIR, relativePath), "utf8");
  return stripComments(source, usesHashComments(relativePath));
}

/** `#`로 주석을 쓰는 파일(compose yaml·셸 스크립트)인지. 그 밖(ts·mjs)은 줄 주석·블록 주석이다. */
function usesHashComments(relativePath: string): boolean {
  return [".yaml", ".yml", ".sh"].some((extension) => relativePath.endsWith(extension));
}

/** 주석을 지운다. URL의 `://`는 주석으로 보지 않고, 셸의 `${#array[@]}`는 `#`이 공백 뒤가 아니라 남는다. */
function stripComments(source: string, hashComments: boolean): string {
  const withoutBlocks = hashComments ? source : source.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlocks
    .split("\n")
    .map((line) =>
      hashComments ? line.replace(/(^|\s)#.*$/, "$1") : line.replace(/(^|[^:])\/\/.*$/, "$1"),
    )
    .join("\n");
}

/** `E2E_DIR` 아래 하네스 소스 파일의 상대 경로 목록(spec·의존성·산출물 제외). */
function collectHarnessSources(directory: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix === "" ? entry.name : join(prefix, entry.name);
    if (entry.isDirectory()) {
      if (!NON_SOURCE_DIRS.has(entry.name)) {
        found.push(...collectHarnessSources(join(directory, entry.name), relativePath));
      }
      continue;
    }
    if (!entry.isFile() || entry.name.endsWith(".spec.ts")) {
      continue;
    }
    if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      found.push(relativePath);
    }
  }
  return found.sort();
}

test("[FR-003-AC1][격리] HARNESS_FILES가 하네스 소스 전부를 덮는다(테스트 spec만 제외)", () => {
  // 목록 누락 자체가 사각이므로(T-024 리뷰 Minor 1) 실제 파일 트리와 대조한다.
  // 새 하네스 파일을 추가하면 이 단언이 먼저 깨져 위 목록에 넣도록 강제한다.
  expect(collectHarnessSources(E2E_DIR)).toEqual([...HARNESS_FILES].sort());
});

for (const relativePath of HARNESS_FILES) {
  test(`[FR-003-AC1][격리] ${relativePath}에 실제 AojiStudio 경로·홈 경로 문자열이 없다`, () => {
    const code = readHarnessCode(relativePath);
    for (const pattern of FORBIDDEN_PATH_PATTERNS) {
      expect(code, `${relativePath}이 금지 경로 패턴 ${pattern}을 담고 있습니다`).not.toMatch(
        pattern,
      );
    }
  });

  test(`[FR-003-AC1][격리] ${relativePath}의 .claude·.aojistudio 참조는 fixture 경로와 함께만 나온다`, () => {
    const suspicious = readHarnessCode(relativePath)
      .split("\n")
      .map((line) => line.replace(PROPERTY_ACCESS, ""))
      .filter((line) => /\.claude|\.aojistudio/.test(line))
      .filter((line) => !FIXTURE_CONTEXT.test(line));
    expect(suspicious).toEqual([]);
  });
}

for (const composeFile of ["compose.e2e.yaml"]) {
  test(`[FR-003-AC1][격리] ${composeFile}의 호스트 마운트는 \${E2E_FIXTURE_DIR} 하나뿐이고 docker.sock이 없다`, () => {
    const code = readHarnessCode(composeFile);

    expect(code).toContain("${E2E_FIXTURE_DIR");
    expect(code).not.toContain("docker.sock");
    expect(code).not.toContain("privileged");

    // 전역 Claude 설정 연결(long syntax): 4개 모두 읽기 전용·create_host_path false이고 원본은 대역 또는 E2E_CLAUDE_HOME 아래뿐이다.
    const claudeSources = code
      .split("\n")
      .map((line) => /^\s*source:\s*(\S+)$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string);
    expect(claudeSources).toHaveLength(4);
    for (const source of claudeSources) {
      expect(source.startsWith("${E2E_CLAUDE_HOME:-../claude-home-off}/"), `허용되지 않은 bind 원본: ${source}`).toBe(true);
    }
    expect(code.match(/read_only: true/g)).toHaveLength(4);
    expect(code.match(/create_host_path: false/g)).toHaveLength(4);
    expect(code).not.toContain(".credentials");

    const hostPaths = code
      .split("\n")
      .map((line) => /^\s*-\s*(\S+):(\/\S*)$/.exec(line.trim()))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string);
    expect(hostPaths.length).toBeGreaterThan(0);
    for (const hostPath of hostPaths) {
      // 절대 경로·상대 경로·홈 경로를 직접 적지 않는다. `${E2E_FIXTURE_DIR...}` 또는 이름 있는 볼륨만 쓴다.
      const allowed = hostPath.startsWith("${E2E_FIXTURE_DIR") || /^[A-Za-z0-9][\w.-]*$/.test(hostPath);
      expect(allowed, `허용되지 않은 호스트 마운트: ${hostPath}`).toBe(true);
    }
  });
}

test("[FR-003-AC1][격리] 기동된 컨테이너의 bind 마운트는 임시 fixture 사본뿐이다(docker inspect)", () => {
  const state = readE2eState();
  const studioRoot = canonicalPath(resolve(PROJECT_ROOT, ".."));
  const fixtureDir = canonicalPath(realpathSync(state.fixtureDir));

  // 임시 폴더 안이어야 하고, 저장소(AojiStudio) 안이면 안 된다.
  if (state.fixtureOwned) {
    expect(fixtureDir.startsWith(canonicalPath(realpathSync(tmpdir())))).toBe(true);
  }
  expect(fixtureDir.startsWith(studioRoot)).toBe(false);

  const containerId = execFileSync(
    "docker",
    ["compose", "-f", state.composeFile, "ps", "-q", COMPOSE_SERVICE],
    { cwd: E2E_DIR, env: composeEnv(state.fixtureDir), encoding: "utf8" },
  ).trim();
  expect(containerId).not.toBe("");

  const mounts = JSON.parse(
    execFileSync("docker", ["inspect", "--format", "{{json .Mounts}}", containerId], {
      encoding: "utf8",
    }),
  ) as { Type: string; Source: string; Destination: string; RW: boolean }[];

  const binds = mounts.filter((mount) => mount.Type === "bind");
  const claudeBinds = binds.filter((bind) => bind.Destination.startsWith("/claude-home/"));
  const workspaceBinds = binds.filter((bind) => !bind.Destination.startsWith("/claude-home/"));
  expect(workspaceBinds.map((bind) => bind.Destination)).toEqual(["/workspace"]);
  expect(
    bindSourceIsFixture((workspaceBinds[0] as { Source: string }).Source, fixtureDir, state.fixtureDir),
    `bind 소스가 fixture 사본이 아닙니다: ${(workspaceBinds[0] as { Source: string }).Source}`,
  ).toBe(true);

  // 전역 연결 4개: 대역(저장소 tools/claude-home-off) 또는 임시 claude-home 사본이고, 모두 읽기 전용이다(ADR-79).
  const claudeHomeRoot =
    state.claudeHomeDir === null || state.claudeHomeDir === undefined
      ? join(PROJECT_ROOT, "tools", "claude-home-off")
      : canonicalPath(realpathSync(state.claudeHomeDir));
  if (state.claudeHomeDir !== null && state.claudeHomeDir !== undefined) {
    expect(claudeHomeRoot.startsWith(studioRoot), "claude-home 사본이 저장소 안입니다").toBe(false);
  }
  expect(claudeBinds.map((bind) => bind.Destination).sort()).toEqual([
    "/claude-home/.claude.json",
    "/claude-home/.claude/plugins",
    "/claude-home/.claude/projects",
    "/claude-home/.claude/settings.json",
  ]);
  for (const bind of claudeBinds as { Source: string; Destination: string; RW: boolean }[]) {
    expect(bind.RW, `${bind.Destination}가 읽기 전용이 아닙니다`).toBe(false);
    const relative = bind.Destination.slice("/claude-home/".length);
    expect(
      bindSourceIsFixture(bind.Source, join(claudeHomeRoot, relative), join(claudeHomeRoot, relative)),
      `${bind.Destination}의 bind 소스가 대역·임시 사본이 아닙니다: ${bind.Source}`,
    ).toBe(true);
  }

  const allowedInsideStudio = (mount: { Source: string; Destination: string }) =>
    mount.Destination.startsWith("/claude-home/") &&
    (state.claudeHomeDir === null || state.claudeHomeDir === undefined);
  for (const mount of mounts) {
    if (!allowedInsideStudio(mount)) {
      expect(canonicalPath(mount.Source).startsWith(studioRoot)).toBe(false);
    }
    expect(mount.Source).not.toContain("docker.sock");
    expect(mount.Destination).not.toContain(".credentials");
  }
});

test("[FR-003-AC1][FR-014-AC4][격리] GET /api/settings의 hostPath가 임시 fixture 폴더다", async ({
  request,
}) => {
  const state = readE2eState();

  const response = await request.get(`${state.baseUrl}/api/settings`, {
    headers: { Origin: state.baseUrl },
  });
  expect(response.status()).toBe(200);

  const settings = (await response.json()) as { hostPath: string };
  expect(canonicalPath(settings.hostPath)).toBe(canonicalPath(realpathSync(state.fixtureDir)));
  expect(canonicalPath(settings.hostPath).startsWith(canonicalPath(resolve(PROJECT_ROOT, "..")))).toBe(
    false,
  );
});
