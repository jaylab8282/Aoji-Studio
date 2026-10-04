// fixture 형식 검사 도구 (architecture.md §6.1·§6.2 그대로 재구현).
// 테스트 전용 재구현이다 — 운영 판정은 backend의 AgentDefinitionParser·WorkflowConfigStore가 한다.
// 여기서는 `tools/fixtures/*`가 그 판정 규칙을 만족하는지 fixtures.test.mjs에서 검증하는 데만 쓴다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const NAME_PATTERN = /^[a-z0-9-]+$/;
const DELIMITER = "---";
const SCHEMA_VERSION = 1;
/** 표준 fixture의 데이터 폴더 이름(architecture.md §8.4.1). legacy fixture는 호출 쪽이 이름을 넘긴다. */
export const DATA_DIR_NAME = ".aojistudio";

/** UTF-8 엄격 디코딩. 잘못된 바이트가 있으면 던진다(architecture.md §6.1). */
export function decodeUtf8Strict(buffer) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return decoder.decode(buffer);
}

/**
 * 정의 파일(.claude/agents/<name>.md) 하나를 파싱한다.
 * 반환: { ok: true, name, description, tools, model } | { ok: false, reason }
 * 판정 순서는 AgentDefinitionParser.parse()와 같다(UTF-8 → frontmatter 구분자 → YAML(간이) → name 존재 → name 형식).
 */
export function parseDefinitionFile(buffer) {
  let content;
  try {
    content = decodeUtf8Strict(buffer);
  } catch {
    return { ok: false, reason: "UTF-8 인코딩 오류" };
  }

  const lines = content.split("\n");
  if (lines.length === 0 || lines[0].trimEnd() !== DELIMITER) {
    return { ok: false, reason: "frontmatter 형식 오류" };
  }
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === DELIMITER) {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) {
    return { ok: false, reason: "frontmatter 형식 오류" };
  }

  const frontmatterLines = lines.slice(1, closingIndex);
  let frontmatter;
  try {
    frontmatter = parseSimpleFrontmatter(frontmatterLines);
  } catch {
    return { ok: false, reason: "frontmatter 형식 오류" };
  }

  const name = frontmatter.name;
  if (typeof name !== "string" || name.trim() === "") {
    return { ok: false, reason: "name 누락" };
  }
  if (!NAME_PATTERN.test(name)) {
    return { ok: false, reason: "name 형식 위반" };
  }

  return {
    ok: true,
    name,
    description: typeof frontmatter.description === "string" ? frontmatter.description : "",
    tools: frontmatter.tools ?? null,
    model: typeof frontmatter.model === "string" ? frontmatter.model : null,
  };
}

/**
 * frontmatter 줄들을 간이 파싱한다. 우리 fixture는 `key: value` 한 줄짜리 필드만 쓰므로
 * 전체 YAML 문법을 지원할 필요가 없다(테스트 전용 도구, ADR 대상 아님). 지원하지 않는 문법을
 * 만나면 던져서 "frontmatter 형식 오류"로 처리한다.
 */
function parseSimpleFrontmatter(lines) {
  const result = {};
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const sepIndex = line.indexOf(":");
    if (sepIndex === -1) {
      throw new Error(`YAML 실패: ${line}`);
    }
    const key = line.slice(0, sepIndex).trim();
    let value = line.slice(sepIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** 같은 name을 쓰는 파일이 둘 이상이면 그룹 전체를 "name 중복 (<상대 파일명 목록>)" 오류로 바꾼다. */
export function resolveDuplicateNames(parsedByRelativePath) {
  const byName = new Map();
  for (const [relPath, parsed] of parsedByRelativePath) {
    if (!parsed.ok) {
      continue;
    }
    if (!byName.has(parsed.name)) {
      byName.set(parsed.name, []);
    }
    byName.get(parsed.name).push(relPath);
  }

  const result = new Map();
  for (const [relPath, parsed] of parsedByRelativePath) {
    if (parsed.ok && byName.get(parsed.name).length > 1) {
      const others = byName
        .get(parsed.name)
        .filter((p) => p !== relPath)
        .sort()
        .join(", ");
      result.set(relPath, { ok: false, reason: `name 중복 (${others})` });
    } else {
      result.set(relPath, parsed);
    }
  }
  return result;
}

/**
 * 구성 파일(.aojistudio/teams/<이름>.json) 하나를 파싱한다(architecture.md §6.2, WorkflowConfigStore.readOne).
 * 반환: { ok: true, name, description, lead, members, brokenRefs, rawMemberCount }
 *     | { ok: false, reason: "구성 파일 형식 오류" }
 *     | { ok: true, ..., brokenRefFormatErrors: ["<name> · 구성 파일 참조 깨짐 (<워크플로우>)", ...] }
 */
export function parseWorkflowConfigFile(buffer, stem, validAgentNames) {
  let text;
  try {
    text = decodeUtf8Strict(buffer);
  } catch {
    return { ok: false, reason: "구성 파일 형식 오류" };
  }

  let root;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, reason: "구성 파일 형식 오류" };
  }

  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    return { ok: false, reason: "구성 파일 형식 오류" };
  }
  if (root.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: "구성 파일 형식 오류" };
  }
  if (typeof root.name !== "string" || root.name !== stem) {
    return { ok: false, reason: "구성 파일 형식 오류" };
  }

  let description = "";
  if (root.description !== undefined && root.description !== null) {
    if (typeof root.description !== "string") {
      return { ok: false, reason: "구성 파일 형식 오류" };
    }
    description = root.description;
  }

  let leadRaw = null;
  if (root.lead !== undefined && root.lead !== null) {
    if (typeof root.lead !== "string") {
      return { ok: false, reason: "구성 파일 형식 오류" };
    }
    leadRaw = root.lead;
  }

  let membersRaw = [];
  if (root.members !== undefined && root.members !== null) {
    if (!Array.isArray(root.members)) {
      return { ok: false, reason: "구성 파일 형식 오류" };
    }
    for (const item of root.members) {
      if (typeof item !== "string") {
        return { ok: false, reason: "구성 파일 형식 오류" };
      }
      membersRaw.push(item);
    }
  }

  if (leadRaw !== null && membersRaw.includes(leadRaw)) {
    return { ok: false, reason: "구성 파일 형식 오류" };
  }

  const rawMemberCount = (leadRaw !== null ? 1 : 0) + membersRaw.length;
  const brokenRefs = [];
  const brokenRefFormatErrors = [];

  let lead = null;
  if (leadRaw !== null) {
    if (validAgentNames.has(leadRaw)) {
      lead = leadRaw;
    } else {
      brokenRefs.push(leadRaw);
      brokenRefFormatErrors.push(`${leadRaw} · 구성 파일 참조 깨짐 (${stem})`);
    }
  }

  const members = new Set();
  for (const member of membersRaw) {
    if (validAgentNames.has(member)) {
      members.add(member);
    } else if (!brokenRefs.includes(member)) {
      brokenRefs.push(member);
      brokenRefFormatErrors.push(`${member} · 구성 파일 참조 깨짐 (${stem})`);
    }
  }

  return {
    ok: true,
    name: stem,
    description,
    lead,
    members: [...members].sort(),
    brokenRefs: [...brokenRefs].sort(),
    rawMemberCount,
    brokenRefFormatErrors,
  };
}

/**
 * fixture 프로젝트 폴더 하나를 스캔한다(architecture.md §6.1·§6.2 전체). E2E·backend와 달리
 * 파일시스템만 읽고 아무것도 쓰지 않는다(conventions.md §1 MUST — fixture는 읽기만).
 */
export function scanFixtureProject(projectDir, dataDirName = DATA_DIR_NAME) {
  const agentsDir = path.join(projectDir, ".claude", "agents");
  const skillsDir = path.join(projectDir, ".claude", "skills");
  const teamsDir = path.join(projectDir, dataDirName, "teams");

  const agentsDirMissing = !isDirectory(agentsDir);
  const agentFormatErrors = [];
  let parsedByRelativePath = new Map();

  if (!agentsDirMissing) {
    const files = readdirSync(agentsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
    for (const fileName of files) {
      const buffer = readFileSync(path.join(agentsDir, fileName));
      const parsed = parseDefinitionFile(buffer);
      parsedByRelativePath.set(`.claude/agents/${fileName}`, parsed);
    }
    parsedByRelativePath = resolveDuplicateNames(parsedByRelativePath);
  }

  const agents = [];
  for (const [relPath, parsed] of parsedByRelativePath) {
    if (parsed.ok) {
      agents.push({ name: parsed.name, relativeFilePath: relPath });
    } else {
      agentFormatErrors.push({ relativeFilePath: relPath, reason: parsed.reason });
    }
  }

  const skillCount = isDirectory(skillsDir)
    ? readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && isFile(path.join(skillsDir, e.name, "SKILL.md")))
        .length
    : 0;

  const validAgentNames = new Set(agents.map((a) => a.name));
  const workflows = [];
  const workflowFormatErrors = [];
  const brokenRefFormatErrors = [];

  if (isDirectory(teamsDir)) {
    const files = readdirSync(teamsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name)
      .sort();
    for (const fileName of files) {
      const stem = fileName.slice(0, -".json".length);
      const buffer = readFileSync(path.join(teamsDir, fileName));
      const parsed = parseWorkflowConfigFile(buffer, stem, validAgentNames);
      if (!parsed.ok) {
        workflowFormatErrors.push({ fileName, reason: parsed.reason });
        continue;
      }
      workflows.push(parsed);
      brokenRefFormatErrors.push(...parsed.brokenRefFormatErrors);
    }
  }

  const duplicateWorkflows = computeDuplicateWorkflows(workflows);

  return {
    agentsDirMissing,
    agents,
    agentFormatErrors,
    skillCount,
    workflows,
    workflowFormatErrors,
    brokenRefFormatErrors,
    duplicateWorkflows,
  };
}

/** FR-006-AC11: 같은 name이 lead·members로 두 워크플로우 이상에 등장하면 그 워크플로우 이름 목록(오름차순)을 돌려준다. */
function computeDuplicateWorkflows(workflows) {
  const membership = new Map();
  for (const wf of workflows) {
    const names = new Set([...(wf.lead ? [wf.lead] : []), ...wf.members]);
    for (const name of names) {
      if (!membership.has(name)) {
        membership.set(name, []);
      }
      membership.get(name).push(wf.name);
    }
  }
  const duplicates = new Map();
  for (const [name, wfNames] of membership) {
    if (wfNames.length > 1) {
      duplicates.set(name, [...wfNames].sort());
    }
  }
  return duplicates;
}

function isDirectory(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
