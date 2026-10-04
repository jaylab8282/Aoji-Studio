// fixture 세트 형식 검증 (T-023 Done when: "fixture", architecture.md §6 형식).
// tools/fixtures/*는 읽기만 한다 — 아무 파일도 쓰지 않는다(conventions.md §1 MUST).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DATA_DIR_NAME, scanFixtureProject } from "../lib/fixtureFormat.mjs";

const LEGACY_DATA_DIR = DATA_DIR_NAME.replace("aoji", "jay"); // LEGACY v1.0.x 데이터 폴더 이름(부재 확인용, 리터럴 없이 파생)
assert.match(LEGACY_DATA_DIR, /^\.jay.*studio$/);
assert.notEqual(LEGACY_DATA_DIR, DATA_DIR_NAME);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "..", "..", "fixtures");

function fixture(name) {
  return path.join(FIXTURES_DIR, name);
}

const HOOK_EVENTS_REGISTERED = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "Stop",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
];

function assertHookSettingsJson(projectName, expectedUrl) {
  const raw = readFileSync(path.join(fixture(projectName), ".claude", "settings.json"), "utf8");
  const parsed = JSON.parse(raw); // 파싱 가능해야 한다(정상 파일).
  const keys = Object.keys(parsed.hooks);
  assert.deepEqual(keys.sort(), [...HOOK_EVENTS_REGISTERED].sort(), `${projectName} settings.json 이벤트 12종`);
  for (const eventName of HOOK_EVENTS_REGISTERED) {
    const entry = parsed.hooks[eventName][0].hooks[0];
    assert.equal(entry.type, "http", `${projectName} ${eventName} type`);
    assert.equal(entry.url, expectedUrl, `${projectName} ${eventName} url`);
    assert.equal(entry.timeout, 3, `${projectName} ${eventName} timeout`);
    assert.equal(typeof entry.headers["X-AojiStudio-Collect-Token"], "string");
    assert.ok(entry.headers["X-AojiStudio-Collect-Token"].length > 0);
  }
}

// ---------------------------------------------------------------------------
// 데이터 폴더 이름 (ADR-55, NFR-10): 표준 fixture에는 옛 데이터 폴더가 없다
// ---------------------------------------------------------------------------

test("[fixtures][ADR-55][NFR-10] 표준 fixture에는 옛 데이터 폴더가 0개이고, 구성 파일이 있는 fixture는 .aojistudio를 쓴다", () => {
  const standard = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("project-legacy-"))
    .map((e) => e.name);
  assert.ok(standard.length >= 7, `표준 fixture ${standard.length}개`);
  for (const name of standard) {
    assert.equal(
      existsSync(path.join(fixture(name), LEGACY_DATA_DIR)), // LEGACY 데이터 폴더 부재 확인
      false,
      `${name}에 옛 데이터 폴더가 있다`,
    );
  }
  for (const name of ["project-configured", "project-format-errors", "project-large", "project-showcase"]) {
    assert.equal(existsSync(path.join(fixture(name), ".aojistudio", "teams")), true, `${name}/.aojistudio/teams`);
  }
});

// ---------------------------------------------------------------------------
// project-basic (기존 fixture, 그대로 유지 — CLAUDE.md e2e 절차·README가 복사해 쓴다)
// ---------------------------------------------------------------------------

test("[fixtures] project-basic: 정상 파일만 있고 형식 오류가 없다", () => {
  const result = scanFixtureProject(fixture("project-basic"));
  assert.equal(result.agentsDirMissing, false);
  assert.equal(result.agentFormatErrors.length, 0);
  assert.ok(result.agents.length > 0, "에이전트가 1개 이상 있어야 한다");
  assert.equal(result.workflows.length, 0, "project-basic은 워크플로우 0개다(tasks.md T-023)");
  assert.equal(result.workflowFormatErrors.length, 0);
  assert.ok(result.skillCount >= 1);
});

// ---------------------------------------------------------------------------
// project-empty
// ---------------------------------------------------------------------------

test("[fixtures] project-empty: agents·skills 폴더는 있지만 비어 있다(FR-001-E3)", () => {
  const result = scanFixtureProject(fixture("project-empty"));
  assert.equal(result.agentsDirMissing, false);
  assert.equal(result.agents.length, 0);
  assert.equal(result.agentFormatErrors.length, 0);
  assert.equal(result.skillCount, 0);
  assert.equal(result.workflows.length, 0);
});

// ---------------------------------------------------------------------------
// project-no-agents-dir
// ---------------------------------------------------------------------------

test("[fixtures] project-no-agents-dir: agents 폴더가 없다(FR-001-E1)", () => {
  const result = scanFixtureProject(fixture("project-no-agents-dir"));
  assert.equal(result.agentsDirMissing, true);
  assert.equal(result.agents.length, 0);
  assert.equal(result.agentFormatErrors.length, 0);
});

// ---------------------------------------------------------------------------
// project-format-errors (기존 5종 + 이번에 보강한 malformed JSON·중복 소속)
// ---------------------------------------------------------------------------

test("[fixtures] project-format-errors: 정의 파일 형식 오류 5종이 의도한 그대로 검출된다(FR-002-AC1)", () => {
  const result = scanFixtureProject(fixture("project-format-errors"));
  const byPath = new Map(result.agentFormatErrors.map((e) => [e.relativeFilePath, e.reason]));

  assert.equal(byPath.get(".claude/agents/bad-utf8.md"), "UTF-8 인코딩 오류");
  assert.equal(byPath.get(".claude/agents/broken-frontmatter.md"), "frontmatter 형식 오류");
  assert.equal(byPath.get(".claude/agents/missing-name.md"), "name 누락");
  assert.equal(byPath.get(".claude/agents/Invalid-Name.md"), "name 형식 위반");
  assert.match(byPath.get(".claude/agents/dup-one.md") ?? "", /^name 중복 \(/);
  assert.match(byPath.get(".claude/agents/dup-two.md") ?? "", /^name 중복 \(/);

  // 의도한 오류만 있어야 한다 — 그 밖의 파일(정상 파일)은 오류 목록에 없어야 한다.
  assert.equal(result.agentFormatErrors.length, 6, "5종 오류(dup는 2파일) = 6건이어야 한다");

  const validNames = result.agents.map((a) => a.name).sort();
  assert.deepEqual(validNames, ["dup-affiliation-agent", "valid-agent"]);
});

test("[fixtures] project-format-errors: 깨진 참조는 broken-ref.json의 no-such-agent 하나뿐이다(FR-002-AC5)", () => {
  const result = scanFixtureProject(fixture("project-format-errors"));
  assert.equal(result.brokenRefFormatErrors.length, 1);
  assert.equal(result.brokenRefFormatErrors[0], "no-such-agent · 구성 파일 참조 깨짐 (broken-ref)");

  const brokenRefWorkflow = result.workflows.find((w) => w.name === "broken-ref");
  assert.ok(brokenRefWorkflow, "broken-ref.json은 형식 오류가 아니라 깨진 참조만 있어야 파싱된다");
  assert.equal(brokenRefWorkflow.lead, "valid-agent");
  assert.deepEqual(brokenRefWorkflow.members, []);
  assert.deepEqual(brokenRefWorkflow.brokenRefs, ["no-such-agent"]);
});

test("[fixtures] project-format-errors: 구성 파일 JSON 오류 2건(schemaVersion 위반 + 실제 JSON 파싱 실패)이 있다(FR-002-AC6)", () => {
  const result = scanFixtureProject(fixture("project-format-errors"));
  const byFile = new Map(result.workflowFormatErrors.map((e) => [e.fileName, e.reason]));

  assert.equal(byFile.get("schema-error.json"), "구성 파일 형식 오류");
  assert.equal(byFile.get("malformed-json.json"), "구성 파일 형식 오류");
  assert.equal(result.workflowFormatErrors.length, 2, "의도한 구성 파일 오류만 있어야 한다");

  // malformed-json.json은 실제로 JSON.parse가 실패하는 파일이어야 한다(스키마 위반이 아니라 파싱 실패).
  const raw = readFileSync(
    path.join(fixture("project-format-errors"), ".aojistudio", "teams", "malformed-json.json"),
    "utf8",
  );
  assert.throws(() => JSON.parse(raw), "malformed-json.json은 JSON 파싱이 실제로 실패해야 한다");
});

test("[fixtures] project-format-errors: 중복 소속 dup-affiliation-agent가 두 워크플로우에 등장한다(FR-006-AC11)", () => {
  const result = scanFixtureProject(fixture("project-format-errors"));
  assert.deepEqual(
    [...result.duplicateWorkflows.entries()],
    [["dup-affiliation-agent", ["dup-affiliation-a", "dup-affiliation-b"]]],
  );
});

// ---------------------------------------------------------------------------
// project-configured (신규): 워크플로우 2, hook 설정 있음
// ---------------------------------------------------------------------------

test("[fixtures] project-configured: 정상 파일만 있고 워크플로우 2개다", () => {
  const result = scanFixtureProject(fixture("project-configured"));
  assert.equal(result.agentsDirMissing, false);
  assert.equal(result.agentFormatErrors.length, 0);
  assert.equal(result.workflowFormatErrors.length, 0);
  assert.equal(result.brokenRefFormatErrors.length, 0);
  assert.equal(result.duplicateWorkflows.size, 0);
  assert.equal(result.workflows.length, 2);

  const names = result.agents.map((a) => a.name).sort();
  assert.deepEqual(names, ["dev-lead", "dev-member", "freelancer", "ops-lead", "ops-member"]);

  const devTeam = result.workflows.find((w) => w.name === "dev-team");
  assert.equal(devTeam.lead, "dev-lead");
  assert.deepEqual(devTeam.members, ["dev-member"]);
  const opsTeam = result.workflows.find((w) => w.name === "ops-team");
  assert.equal(opsTeam.lead, "ops-lead");
  assert.deepEqual(opsTeam.members, ["ops-member"]);

  // freelancer는 어느 구성 파일에도 없다 → 워크플로우 밖 에이전트(FR-004-AC7).
  const assigned = new Set([devTeam.lead, ...devTeam.members, opsTeam.lead, ...opsTeam.members]);
  assert.equal(assigned.has("freelancer"), false);
});

test("[fixtures] project-configured: settings.json에 hook 설정이 있다(architecture.md §7.1)", () => {
  assertHookSettingsJson("project-configured", "http://127.0.0.1:4180/hooks/events");
});

// ---------------------------------------------------------------------------
// project-large (신규): 에이전트 100 · 워크플로우 30 · 인원 7 이상 층 포함
// ---------------------------------------------------------------------------

test("[fixtures] project-large: 에이전트 100 · 워크플로우 30 · 형식 오류 없음", () => {
  const result = scanFixtureProject(fixture("project-large"));
  assert.equal(result.agentsDirMissing, false);
  assert.equal(result.agents.length, 100);
  assert.equal(result.agentFormatErrors.length, 0);
  assert.equal(result.workflows.length, 30);
  assert.equal(result.workflowFormatErrors.length, 0);
  assert.equal(result.brokenRefFormatErrors.length, 0);
  assert.equal(result.duplicateWorkflows.size, 0, "project-large는 중복 소속이 없어야 한다");
});

test("[fixtures] project-large: 인원 7 이상인 층이 있다(FR-006-AC2 span 3 경계)", () => {
  const result = scanFixtureProject(fixture("project-large"));
  const populations = result.workflows.map((w) => (w.lead ? 1 : 0) + w.members.length);
  assert.ok(populations.some((p) => p >= 7), `populations=${populations}`);

  const total = populations.reduce((sum, p) => sum + p, 0);
  assert.equal(total, 100, "모든 에이전트가 정확히 한 번씩 워크플로우에 배치되어야 한다");
});

// ---------------------------------------------------------------------------
// project-showcase (신규): E2E-13 스크린샷 짝 fixture
// ---------------------------------------------------------------------------

test("[fixtures] project-showcase: 워크플로우 4개(팀장 없는 층 포함), 형식 오류 없음", () => {
  const result = scanFixtureProject(fixture("project-showcase"));
  assert.equal(result.agentsDirMissing, false);
  assert.equal(result.agentFormatErrors.length, 0);
  assert.equal(result.workflowFormatErrors.length, 0);
  assert.equal(result.brokenRefFormatErrors.length, 0);
  assert.equal(result.workflows.length, 4);

  const opsTeam = result.workflows.find((w) => w.name === "ops-team");
  assert.equal(opsTeam.lead, null, "ops-team은 팀장 없음 시나리오(02 워크플로우 D 대응)");

  const devTeam = result.workflows.find((w) => w.name === "dev-team");
  const devPopulation = (devTeam.lead ? 1 : 0) + devTeam.members.length;
  assert.ok(devPopulation >= 7, "dev-team은 span 3 시연을 위해 인원 7 이상이어야 한다");
});

test("[fixtures] project-showcase: settings.json에 hook 설정이 있다", () => {
  assertHookSettingsJson("project-showcase", "http://127.0.0.1:4180/hooks/events");
});

test("[fixtures] project-showcase: showcase.jsonl의 agent_type이 모두 fixture에 정의되어 있거나 의도한 정의 밖 값이다", () => {
  const result = scanFixtureProject(fixture("project-showcase"));
  const validNames = new Set(result.agents.map((a) => a.name));
  const raw = readFileSync(path.join(__dirname, "..", "scenarios", "showcase.jsonl"), "utf8");
  const events = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const undefinedAgentTypes = new Set(["Explore"]); // 정의 없는 서브에이전트 시연용(의도적).
  for (const event of events) {
    if (!event.agent_type) continue; // 로비 세션
    if (event.agent_id && undefinedAgentTypes.has(event.agent_type)) continue; // 의도한 미정의 서브에이전트
    assert.ok(
      validNames.has(event.agent_type),
      `showcase.jsonl의 agent_type '${event.agent_type}'이 project-showcase에 정의되어 있지 않다`,
    );
  }
});
