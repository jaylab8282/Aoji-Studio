// v1.0.x 호환 fixture 2종 형식 검사 (ADR-55, architecture.md §8.4.1). 읽기만 한다.
// LEGACY: 이 파일은 옛 데이터 폴더 이름을 다루는 호환 테스트다. 옛 이름이 든 줄에는 LEGACY 표시를 둔다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanFixtureProject } from "../lib/fixtureFormat.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "..", "..", "fixtures");
const LEGACY_DATA_DIR = ".jaystudio"; // LEGACY v1.0.x 옛 데이터 폴더
const NEW_DATA_DIR = ".aojistudio";

const fixture = (name) => path.join(FIXTURES_DIR, name);

function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

test("[ADR-55] project-legacy-only = 옛 데이터 폴더만(.aojistudio 없음), 토큰 파일 없음", () => {
  const root = fixture("project-legacy-only");
  assert.equal(existsSync(path.join(root, LEGACY_DATA_DIR)), true); // LEGACY
  assert.equal(existsSync(path.join(root, NEW_DATA_DIR)), false);
  assert.deepEqual(filesUnder(path.join(root, LEGACY_DATA_DIR)).sort(), [ // LEGACY
    "legacy-old.20260901-120000.md",
    "legacy-team.json",
  ]);
  assert.equal(filesUnder(root).some((n) => n.endsWith("-token")), false, "토큰 파일은 커밋하지 않는다");
});

test("[ADR-55] project-legacy-only 구성 파일이 옛 폴더 teams에서 형식 통과: legacy-team(lead legacy-lead, members [legacy-member])", () => {
  const result = scanFixtureProject(fixture("project-legacy-only"), LEGACY_DATA_DIR); // LEGACY
  assert.equal(result.agentFormatErrors.length, 0);
  assert.deepEqual(result.agents.map((a) => a.name).sort(), ["legacy-lead", "legacy-member"]);
  assert.equal(result.workflowFormatErrors.length, 0);
  assert.equal(result.brokenRefFormatErrors.length, 0);
  assert.equal(result.workflows.length, 1);
  assert.equal(result.workflows[0].name, "legacy-team");
  assert.equal(result.workflows[0].lead, "legacy-lead");
  assert.deepEqual(result.workflows[0].members, ["legacy-member"]);
  // 새 폴더 기준으로 읽으면 구성 파일이 없다(.aojistudio 없음).
  assert.equal(scanFixtureProject(fixture("project-legacy-only")).workflows.length, 0);
});

test("[ADR-55] project-legacy-both = 두 데이터 폴더 모두(서로 다른 워크플로우), 토큰 파일 없음", () => {
  const root = fixture("project-legacy-both");
  assert.equal(existsSync(path.join(root, LEGACY_DATA_DIR)), true); // LEGACY
  assert.equal(existsSync(path.join(root, NEW_DATA_DIR)), true);
  assert.equal(filesUnder(root).some((n) => n.endsWith("-token")), false, "토큰 파일은 커밋하지 않는다");

  const oldSide = scanFixtureProject(root, LEGACY_DATA_DIR); // LEGACY
  const newSide = scanFixtureProject(root, NEW_DATA_DIR);
  assert.equal(oldSide.agentFormatErrors.length, 0);
  assert.equal(oldSide.agents.length, 2, "정의 파일 2개");
  assert.deepEqual(oldSide.workflows.map((w) => w.name), ["old-team"]);
  assert.deepEqual(newSide.workflows.map((w) => w.name), ["new-team"]);
  assert.equal(oldSide.workflowFormatErrors.length + newSide.workflowFormatErrors.length, 0);
  assert.equal(oldSide.brokenRefFormatErrors.length + newSide.brokenRefFormatErrors.length, 0);
});
