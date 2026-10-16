// v1.2.0 fixture 검증 (T-R4-01). tools/fixtures/*는 읽기만 한다.
// expected.json의 기대값은 이 테스트가 fixture 파일에서 따로 계산한 값과 같아야 한다(생성 스크립트와 별개 구현).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDefinitionFile } from "../lib/fixtureFormat.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "..", "..", "fixtures");
const SCENARIOS = path.join(__dirname, "..", "scenarios");
const fx = (...p) => path.join(FIXTURES, ...p);
const readJson = (...p) => JSON.parse(readFileSync(fx(...p), "utf8"));
const readText = (...p) => readFileSync(fx(...p), "utf8");

const MARK = {
  email: "AOJI-MARKER-EMAIL-55d0",
  convo: "AOJI-MARKER-CONVO-7f3a",
  env: "AOJI-MARKER-ENV-91c2",
  status: "AOJI-MARKER-STATUS-3b1e",
  prompt: "AOJI-MARKER-PROMPT-c4d8",
};
const MASK = "••••••••";

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// [FR-025-AC1] 토큰 합 = JSONL에서 따로 계산한 값(같은 메시지 중복 줄은 한 번)
// ---------------------------------------------------------------------------

// ADR-82 단가(USD / 1M 토큰) × 100 = 센트 단위 정수: [입력, 출력, 캐시 생성, 캐시 읽기]
const PRICE_CENTS = {
  "claude-opus-4-8": [500, 2500, 625, 50],
  "claude-sonnet-4-5": [300, 1500, 375, 30],
  "claude-haiku-4-5": [100, 500, 125, 10],
};
function resolvePriceModel(model) {
  if (PRICE_CENTS[model]) return model;
  const stripped = model.replace(/-\d{8}$/, "");
  return PRICE_CENTS[stripped] ? stripped : null;
}

function readTranscripts() {
  const base = fx("claude-home-basic", ".claude", "projects");
  const files = walk(base).filter((f) => f.endsWith(".jsonl")).sort();
  const best = new Map(); // 같은 키 → output_tokens 최대 줄(같으면 4값 합이 큰 줄) — ADR-81 결정 3
  let duplicateLines = 0;
  let rawUsageLines = 0;
  let brokenFiles = 0;
  for (const file of files) {
    const isSub = file.includes(`${path.sep}subagents${path.sep}`);
    const metaPath = file.replace(/\.jsonl$/, ".meta.json");
    const metaType = isSub && existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")).agentType : null;
    let broken = false;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        broken = true;
        continue;
      }
      if (o.type !== "assistant" || !o.message?.usage) continue;
      rawUsageLines++;
      const u = o.message.usage;
      const t = [u.input_tokens, u.output_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens];
      if (o.message.model === "<synthetic>" || t.every((x) => x === 0)) continue;
      if (typeof o.message.id !== "string" || typeof o.requestId !== "string") continue;
      const key = `${o.message.id}:${o.requestId}`;
      const row = { sessionId: o.sessionId, model: o.message.model, ts: o.timestamp, t, isSub, metaType, sidechain: o.isSidechain };
      const prev = best.get(key);
      if (prev) {
        duplicateLines++;
        const sum = (x) => x.reduce((a, b) => a + b, 0);
        if (t[1] > prev.t[1] || (t[1] === prev.t[1] && sum(t) > sum(prev.t))) best.set(key, row);
      } else best.set(key, row);
    }
    if (broken) brokenFiles++;
  }
  return { rows: [...best.values()], rawUsageLines, brokenFiles, fileCount: files.length, duplicateLines };
}

const sumTokens = (rows) => rows.reduce((a, r) => a.map((x, i) => x + r.t[i]), [0, 0, 0, 0]);

test("[FR-025-AC1] expected.json 토큰 합이 JSONL에서 따로 계산한 값(중복 줄 한 번)과 같다", () => {
  const exp = readJson("claude-home-basic", "expected.json");
  const { rows, rawUsageLines, brokenFiles, fileCount, duplicateLines } = readTranscripts();

  const total = sumTokens(rows);
  assert.deepEqual([exp.totals.input, exp.totals.output, exp.totals.cacheCreation, exp.totals.cacheRead], total);
  assert.equal(exp.totals.total, total.reduce((a, b) => a + b, 0));

  // 중복 줄을 모두 더하면 값이 달라진다 = fixture에 실제로 중복이 있고 한 번만 센다
  assert.ok(rawUsageLines > rows.length, "중복·건너뛰는 줄이 있다");
  assert.equal(exp.skippedLines.duplicate, 4);
  assert.equal(duplicateLines, 4);
  assert.equal(exp.skippedFiles, brokenFiles);
  assert.equal(exp.fileCount, fileCount);

  // 모델별 합 = 기간 합계(AC4 구조)
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => exp.byModel.reduce((s, m) => s + [m.input, m.output, m.cacheCreation, m.cacheRead][i], 0)),
    total,
  );
  for (const m of exp.byModel) {
    assert.deepEqual([m.input, m.output, m.cacheCreation, m.cacheRead], sumTokens(rows.filter((r) => r.model === m.model)), m.model);
  }

  // 세션별·날짜별·에이전트별 합도 합계와 같다
  assert.equal(exp.bySession.reduce((s, x) => s + x.total, 0), exp.totals.total);
  for (const tz of ["UTC", "Asia/Seoul"]) {
    assert.equal(exp.byDate[tz].reduce((s, x) => s + x.total, 0), exp.totals.total, tz);
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    for (const d of exp.byDate[tz]) {
      const sub = rows.filter((r) => fmt.format(new Date(r.ts)) === d.date);
      assert.equal(d.total, sumTokens(sub).reduce((a, b) => a + b, 0), `${tz} ${d.date}`);
    }
  }
  // 시간대 경계 메시지: UTC 10-14 15:10 = 서울 10-15 00:10
  assert.notDeepEqual(exp.byDate.UTC.map((d) => d.date), exp.byDate["Asia/Seoul"].map((d) => d.date));
  assert.equal(exp.byAgentAfterReplay.reduce((s, x) => s + x.total, 0), exp.totals.total);
  assert.equal(exp.byAgentBeforeReplay.reduce((s, x) => s + x.total, 0), exp.totals.total);
});

test("[FR-025-AC1] 값이 다른 중복 쌍(뒤 줄이 큰 쌍·앞 줄이 큰 쌍)은 output_tokens 최대 줄의 4값으로 센다", () => {
  const file = fx("claude-home-basic", ".claude", "projects", "-home-fixture-work-aoji-fixture-app", "a1b2c3d4-0000-4000-8000-000000000001", "subagents", "agent-a0a1b2c3d4e5f601.jsonl");
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const usageOf = (id) => lines.filter((o) => o.message?.id === id).map((o) => o.message.usage);
  const four = (u) => [u.input_tokens, u.output_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens];
  const later = usageOf("msg_s1_p");
  const earlier = usageOf("msg_s1_q");
  assert.equal(later.length, 2);
  assert.equal(earlier.length, 2);
  assert.ok(later[1].output_tokens > later[0].output_tokens, "뒤 줄이 큰 쌍");
  assert.ok(earlier[0].output_tokens > earlier[1].output_tokens, "앞 줄이 큰 쌍");
  for (const [a, b] of [later, earlier]) for (const k of ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]) assert.notEqual(a[k], b[k], `${k}도 다르다`);
  const { rows } = readTranscripts();
  // 선택된 줄: 쌍 1은 뒤 줄, 쌍 2는 앞 줄. 합계가 이 선택을 포함해야 한다.
  const exp = readJson("claude-home-basic", "expected.json");
  const withBoth = sumTokens(rows).reduce((a, b) => a + b, 0);
  assert.equal(exp.totals.total, withBoth);
  const chosen = [four(later[1]), four(earlier[0])];
  const wrong = [four(later[0]), four(earlier[1])]; // 먼저 읽은 줄 규칙이면 이 값이 들어간다
  const delta = (x) => x.reduce((s, t) => s + t.reduce((a, b) => a + b, 0), 0);
  assert.ok(delta(chosen) !== delta(wrong));
  // 모델별 4값 합이 expected.json byModel과 정확히 같다(선택 규칙이 합계에 반영됐는지 모델 단위로 확인)
  const sumBy = (model) =>
    rows.filter((r) => r.model === model).reduce((acc, r) => acc.map((v, i) => v + r.t[i]), [0, 0, 0, 0]);
  for (const m of exp.byModel) {
    assert.deepEqual(sumBy(m.model), [m.input, m.output, m.cacheCreation, m.cacheRead], m.model);
  }
  assert.deepEqual(sumBy("claude-sonnet-4-5-20250929"), [1860, 980, 1910, 10600]);
});

test("[FR-025-AC1][FR-026-AC1] expected.json 금액이 ADR-82 단가로 따로 계산한 값과 같고 단가 없는 모델은 합계에서 빠진다", () => {
  const exp = readJson("claude-home-basic", "expected.json");
  const { rows } = readTranscripts();
  let total = 0n;
  let excluded = new Set();
  for (const r of rows) {
    const pm = resolvePriceModel(r.model);
    if (pm === null) {
      excluded.add(r.model);
      continue;
    }
    total += r.t.reduce((s, x, i) => s + BigInt(x) * BigInt(PRICE_CENTS[pm][i]), 0n);
  }
  // total은 1e-8 USD 단위 정수
  assert.equal(Number(exp.totals.usd), Number(total) / 1e8);
  assert.equal(exp.totals.usdRounded, (Number(total) / 1e8).toFixed(2));
  assert.equal(excluded.size, exp.excludedModelCount);
  assert.equal(excluded.size, 1);
  const perModel = exp.byModel.filter((m) => m.usd !== null).reduce((s, m) => s + Number(m.usd), 0);
  assert.ok(Math.abs(perModel - Number(exp.totals.usd)) < 1e-9);
  // 날짜 접미가 붙은 모델 id가 접미 없는 단가로 대응된다
  assert.equal(exp.byModel.find((m) => m.model === "claude-sonnet-4-5-20250929").priceModel, "claude-sonnet-4-5");
  assert.equal(exp.byModel.find((m) => m.model === "claude-future-9").usd, null);
});

test("[FR-025-AC2] 에이전트 판정 근거가 fixture에 있다 (agentSetting 줄·서브에이전트 메타·메타 없음·메인 사이드체인)", () => {
  const base = fx("claude-home-basic", ".claude", "projects", "-home-fixture-work-aoji-fixture-app");
  const s1 = "a1b2c3d4-0000-4000-8000-000000000001";
  const main = readFileSync(path.join(base, `${s1}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const setting = main.find((o) => typeof o.agentSetting === "string");
  assert.equal(setting.agentSetting, "proj-lead");
  assert.equal(setting.sessionId, s1);
  const subDir = path.join(base, s1, "subagents");
  assert.equal(JSON.parse(readFileSync(path.join(subDir, "agent-a0a1b2c3d4e5f601.meta.json"), "utf8")).agentType, "proj-dev");
  assert.equal(existsSync(path.join(subDir, "agent-b0b1b2c3d4e5f602.meta.json")), false);
  const { rows } = readTranscripts();
  assert.ok(rows.some((r) => r.sidechain === true && !r.isSub), "메인 기록의 isSidechain:true 줄");
  const exp = readJson("claude-home-basic", "expected.json");
  const names = (list) => list.map((a) => a.agent).sort();
  assert.deepEqual(names(exp.byAgentAfterReplay), ["proj-dev", "proj-lead", "기본 세션", "미확인"].sort());
  assert.deepEqual(names(exp.byAgentBeforeReplay), ["proj-dev", "proj-lead", "미확인"].sort());
});

// ---------------------------------------------------------------------------
// [FR-019-AC1] usage.jsonl은 hook 입력 형식이고 기대 횟수와 같다
// ---------------------------------------------------------------------------

const HOOK_EVENTS = new Set([
  "SessionStart", "SessionEnd", "UserPromptSubmit", "Stop", "PreToolUse", "PostToolUse", "PostToolUseFailure",
  "PermissionRequest", "PermissionDenied", "Notification", "SubagentStart", "SubagentStop",
]);

function readUsageEvents() {
  const text = readFileSync(path.join(SCENARIOS, "usage.jsonl"), "utf8");
  assert.ok(text.endsWith("\n") && !text.includes("\n\n"), "빈 줄 없이 줄마다 JSON 하나");
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function readProjectUsageAgents() {
  const dir = fx("project-usage", ".claude", "agents");
  return readdirSync(dir).sort().map((f) => {
    const text = readFileSync(path.join(dir, f), "utf8");
    const fm = text.split("\n---\n")[0];
    const skills = [];
    let inSkills = false;
    for (const line of fm.split("\n")) {
      if (line === "skills:") inSkills = true;
      else if (inSkills && line.startsWith("  - ")) skills.push(line.slice(4).trim());
      else inSkills = false;
    }
    return { name: f.replace(/\.md$/, ""), skills, hasTools: /^tools:/m.test(fm), tools: (/^tools:\s*(.*)$/m.exec(fm)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean) };
  });
}

test("[FR-019-AC1] usage.jsonl이 hook 입력 형식이다 (필수 키·이벤트 이름·tool_input.skill·prompt)", () => {
  const events = readUsageEvents();
  assert.ok(events.length >= 30);
  for (const e of events) {
    assert.equal(typeof e.session_id, "string");
    assert.equal(typeof e.cwd, "string");
    assert.ok(HOOK_EVENTS.has(e.hook_event_name), e.hook_event_name);
    if (e.agent_type !== undefined) assert.equal(typeof e.agent_type, "string");
    if (e.hook_event_name === "PreToolUse" || e.hook_event_name === "PostToolUse") {
      assert.equal(typeof e.tool_name, "string");
      assert.equal(typeof e.tool_input, "object");
      if (e.tool_name === "Skill") assert.equal(typeof e.tool_input.skill, "string");
    }
    if (e.hook_event_name === "UserPromptSubmit") assert.equal(typeof e.prompt, "string");
  }
  const kinds = new Set(events.map((e) => e.hook_event_name));
  for (const k of ["SessionStart", "SubagentStart", "PreToolUse", "PostToolUse", "UserPromptSubmit"]) assert.ok(kinds.has(k), k);
});

test("[FR-019-AC1] usage.jsonl의 호출·직접 호출·미리 넣음 횟수가 expected.json과 같다", () => {
  const events = readUsageEvents();
  const exp = readJson("project-usage", "expected.json");
  const skillNames = readdirSync(fx("project-usage", ".claude", "skills"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const agents = readProjectUsageAgents();

  const callsOf = (n) => events.filter((e) => e.hook_event_name === "PreToolUse" && e.tool_name === "Skill" && e.tool_input.skill === n);
  const slashOf = (n) => events.filter((e) => e.hook_event_name === "UserPromptSubmit" && (e.prompt === `/${n}` || e.prompt.startsWith(`/${n} `)));
  const preloadOf = (n) => {
    const defined = agents.filter((a) => a.skills.includes(n)).map((a) => a.name);
    return events.filter((e) => ["SessionStart", "SubagentStart"].includes(e.hook_event_name) && defined.includes(e.agent_type));
  };

  const byName = Object.fromEntries(exp.skills.rows.map((r) => [r.name, r]));
  assert.deepEqual(exp.skills.rows.map((r) => r.name), skillNames, "행은 이름 오름차순, 형식 오류 폴더 포함");
  let sum = 0;
  for (const n of skillNames) {
    const r = byName[n];
    assert.equal(r.call, callsOf(n).length, `${n} 호출`);
    assert.equal(r.slash, slashOf(n).length, `${n} 직접 호출`);
    assert.equal(r.preload, preloadOf(n).length, `${n} 미리 넣음`);
    assert.equal(r.total, r.call + r.slash + r.preload);
    sum += r.total;
  }
  assert.equal(exp.skills.totalUses, sum);
  for (const n of skillNames) assert.ok(Math.abs(byName[n].percent - (byName[n].total * 100) / sum) < 1e-9, `${n} %`);
  const displaySum = skillNames.reduce((s, n) => s + Number(byName[n].percentDisplay), 0);
  assert.ok(Math.abs(displaySum - 100) <= 0.1 + 1e-9, `표시 합 ${displaySum}`);

  // 고정 기준값(손으로 센 값)
  assert.deepEqual([byName["design-review"].call, byName["design-review"].slash, byName["design-review"].preload], [4, 1, 5]);
  assert.deepEqual([byName["release-notes"].call, byName["release-notes"].slash, byName["release-notes"].preload], [1, 1, 3]);
  assert.deepEqual([byName["imported-lint"].call, byName["imported-lint"].slash, byName["imported-lint"].preload], [1, 0, 1]);
  assert.deepEqual([byName["manual-only"].call, byName["manual-only"].slash, byName["manual-only"].preload], [0, 1, 0]);
  assert.equal(byName["bad-yaml"].slash, 1, "형식 오류 폴더 이름도 직접 호출로 센다");
  // 지금 없는 스킬·이름이 이어진 슬래시·PostToolUse는 어느 행에도 들어가지 않는다
  assert.equal(events.filter((e) => e.tool_input?.skill === "ghost-skill").length, 2);
  assert.ok(!(skillNames.includes("ghost-skill")));
  assert.equal(events.filter((e) => e.hook_event_name === "PostToolUse" && e.tool_name === "Skill").length, 1);
  // 실제 사용 에이전트: 정의상인데 사용 0 / 정의에 없는 에이전트가 쓴 경우 / 기본 세션
  assert.deepEqual(byName["manual-only"].definedUnused, ["proj-ops"]);
  assert.ok(byName["design-review"].actualAgents.some((a) => a.agent === "proj-qa"));
  assert.ok(byName["design-review"].actualAgents.some((a) => a.agent === "기본 세션" && a.count === 2));
  assert.equal(byName["design-review"].usedAgentCount, 3);
  assert.equal(byName["manual-only"].usedAgentCount, 1);
});

test("[FR-019-AC1][FR-024-AC2] MCP 호출 횟수와 정의상 사용 에이전트가 expected.json과 같다", () => {
  const events = readUsageEvents();
  const exp = readJson("project-usage", "expected.json");
  const agents = readProjectUsageAgents();
  const rows = Object.fromEntries(exp.mcp.rows.map((r) => [r.name, r]));
  assert.deepEqual(exp.mcp.rows.map((r) => r.name), Object.keys(rows).sort(), "표시 이름 오름차순");
  const calls = (srv) => events.filter((e) => e.hook_event_name === "PreToolUse" && e.tool_name?.startsWith(`mcp__${srv}__`));
  for (const r of exp.mcp.rows) {
    const n = calls(r.callName).length;
    assert.equal(r.actualAgents.reduce((s, a) => s + a.count, 0), n, r.name);
  }
  assert.equal(calls("github").length, 4);
  assert.equal(calls("docs-server").length, 2);
  assert.equal(calls("claude_ai_drive").length, 1);
  assert.equal(events.filter((e) => e.hook_event_name === "PostToolUse" && e.tool_name?.startsWith("mcp__")).length, 1, "PostToolUse MCP는 세지 않음");
  // 정의상: tools의 mcp__<서버> 접두(뒤가 끝 또는 __), mcpServers의 이름 참조·정의
  const defined = (srv) => agents.filter((a) => {
    const text = readText("project-usage", ".claude", "agents", `${a.name}.md`);
    const viaTools = a.tools.some((t) => t === `mcp__${srv}` || t.startsWith(`mcp__${srv}__`));
    const viaServers = new RegExp(`^  - ${srv}:?\\s*$`, "m").test(text) && /^mcpServers:/m.test(text);
    return viaTools || viaServers;
  }).map((a) => a.name).sort();
  for (const r of exp.mcp.rows) assert.deepEqual(r.definedAgents, defined(r.callName), r.name);
  assert.deepEqual(exp.mcp.inheritAllAgents, agents.filter((a) => !a.hasTools).map((a) => a.name));
  assert.equal(rows["github"].usedAgentCount, 3);
  assert.equal(rows["claude_ai_drive"].inheritAllCount, null);
});

// ---------------------------------------------------------------------------
// [NFR-14] 표지 문자열·자격증명 표지·옛 이름 낱말 없음
// ---------------------------------------------------------------------------

test("[NFR-14] 표지 문자열이 약속된 위치에 있다", () => {
  const home = readJson("claude-home-basic", ".claude.json");
  assert.equal(home.oauthAccount.emailAddress, MARK.email);
  assert.ok(JSON.stringify(home.mcpServers).includes(MARK.env), ".claude.json MCP env·headers");
  const settings = readJson("claude-home-basic", ".claude", "settings.json");
  assert.ok(Object.values(settings.env).includes(MARK.env), "settings.json env");
  const transcripts = walk(fx("claude-home-basic", ".claude", "projects")).filter((f) => f.endsWith(".jsonl"));
  assert.ok(transcripts.length >= 4);
  assert.ok(transcripts.filter((f) => readFileSync(f, "utf8").includes(MARK.convo)).length >= 3, "대화 본문 표지");
  const mcp = readJson("project-usage", ".mcp.json").mcpServers;
  assert.ok(Object.values(mcp.github.headers).some((v) => v.includes(MARK.env)), "headers");
  assert.ok(new URL(mcp.github.url).search.includes(MARK.env), "URL 쿼리");
  assert.equal(mcp["local-tool"].env.LOCAL_TOOL_KEY, MARK.env, "env");
  for (const f of ["full.json", "no-limits.json", "bad-type.json"]) {
    const o = readJson("statusline", f);
    assert.equal(o.extra_marker_field, MARK.status, f);
  }
  assert.ok(readFileSync(path.join(SCENARIOS, "usage.jsonl"), "utf8").includes(MARK.prompt));
  const prompts = readUsageEvents().filter((e) => e.prompt?.includes(MARK.prompt));
  assert.ok(prompts.length >= 2, "슬래시 프롬프트 안과 일반 프롬프트");
});

test("[NFR-14] .credentials.json이 있고(연결되면 안 되는 표지), 4개 연결 경로 밖이다", () => {
  const cred = fx("claude-home-basic", ".claude", ".credentials.json");
  assert.ok(existsSync(cred));
  assert.match(readFileSync(cred, "utf8"), /AOJI-MARKER-CRED-[0-9a-f]{4}/);
  // 연결 대상 4개
  for (const p of [".claude.json", ".claude/settings.json"]) assert.ok(statSync(fx("claude-home-basic", p)).isFile(), p);
  for (const p of [".claude/plugins", ".claude/projects"]) assert.ok(statSync(fx("claude-home-basic", p)).isDirectory(), p);
});

test("[NFR-14] expected.json·FORMAT.md에는 표지 문자열이 없다 (기대값 파일이 표지를 퍼뜨리지 않는다)", () => {
  const files = [
    fx("claude-home-basic", "expected.json"), fx("project-usage", "expected.json"), fx("project-skills", "expected.json"),
    fx("statusline", "expected.json"), fx("FORMAT.md"),
  ];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of Object.values(MARK)) assert.ok(!text.includes(m), `${path.basename(f)}에 ${m}`);
    assert.ok(!/AOJI-MARKER-CRED/.test(text), `${path.basename(f)}에 자격증명 표지`);
  }
});

test("[NFR-14] 새 fixture·시나리오·FORMAT.md 어디에도 옛 호환 낱말이 없다", () => {
  const word = new RegExp("leg" + "acy", "i");
  const roots = ["claude-home-basic", "claude-home-empty", "project-skills", "project-usage", "statusline", "scripts"].map((d) => fx(d));
  const targets = [...roots.flatMap((r) => walk(r)), fx("FORMAT.md"), path.join(SCENARIOS, "usage.jsonl")];
  for (const f of targets) {
    assert.ok(!word.test(f), `이름: ${f}`);
    assert.ok(!word.test(readFileSync(f).toString("latin1")), `내용: ${f}`);
  }
});

// ---------------------------------------------------------------------------
// 전역 설정 fixture 구조 (ADR-79·85 읽기 대상 키)
// ---------------------------------------------------------------------------

test("claude-home-basic: 읽는 키(mcpServers·projects.<hostPath>.*·cachedUsageUtilization·enabledPlugins·installed_plugins)가 있다", () => {
  const home = readJson("claude-home-basic", ".claude.json");
  assert.equal(Object.keys(home.mcpServers).length, 2);
  const keys = Object.keys(home.projects);
  assert.deepEqual(keys, ["__AOJI_FIXTURE_HOST_PATH__"], "E2E 하네스가 임시 프로젝트 경로로 바꾼다");
  const proj = home.projects[keys[0]];
  for (const k of ["mcpServers", "enabledMcpjsonServers", "disabledMcpjsonServers", "disabledMcpServers"]) assert.ok(k in proj, k);
  // 이 PC에서 확인한 실제 구조: cachedUsageUtilization.{fetchedAtMs, utilization.{five_hour,seven_day}.{utilization,resets_at}}
  const c = home.cachedUsageUtilization;
  assert.equal(typeof c.fetchedAtMs, "number");
  for (const w of ["five_hour", "seven_day"]) {
    assert.equal(typeof c.utilization[w].utilization, "number");
    assert.match(c.utilization[w].resets_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$/);
  }
  const settings = readJson("claude-home-basic", ".claude", "settings.json");
  assert.equal(Object.keys(settings.enabledPlugins).length, 3);
  const installed = readJson("claude-home-basic", ".claude", "plugins", "installed_plugins.json");
  assert.equal(installed.version, 2);
  const entry = installed.plugins["demo-tools@aoji-fixture-market"][0];
  assert.ok(entry.installPath.startsWith("__AOJI_FIXTURE_CLAUDE_HOME__/.claude/plugins/"));
  const mcpFile = fx("claude-home-basic", entry.installPath.replace("__AOJI_FIXTURE_CLAUDE_HOME__/", ""), ".mcp.json");
  assert.ok(Object.keys(JSON.parse(readFileSync(mcpFile, "utf8")).mcpServers).includes("demo-helper"));
});

test("[FR-023-AC1] 평평한 모양 플러그인 .mcp.json의 서버 2개가 expected.json MCP 행에 있고, 다른 프로젝트 전용 설치는 걸러진다", () => {
  const HOME_P = "__AOJI_FIXTURE_CLAUDE_HOME__/";
  const installed = readJson("claude-home-basic", ".claude", "plugins", "installed_plugins.json");
  const flatEntries = installed.plugins["flat-tools@aoji-fixture-market"];
  assert.equal(flatEntries.length, 1);
  const flat = JSON.parse(readFileSync(fx("claude-home-basic", flatEntries[0].installPath.replace(HOME_P, ""), ".mcp.json"), "utf8"));
  assert.equal("mcpServers" in flat, false, "최상위 키 = 서버 이름");
  assert.deepEqual(Object.keys(flat).sort(), ["flat-http", "flat-stdio"]);
  assert.deepEqual(Object.keys(flat["flat-stdio"]).sort(), ["args", "command"]);
  assert.deepEqual(Object.keys(flat["flat-http"]).sort(), ["headers", "type", "url"]);
  assert.ok(Object.values(flat["flat-http"].headers).some((v) => v.includes(MARK.env)), "headers 표지");
  const exp = readJson("project-usage", "expected.json");
  const names = exp.mcp.rows.map((r) => r.name);
  for (const n of Object.keys(flat)) {
    const row = exp.mcp.rows.find((r) => r.name === n);
    assert.ok(row, n);
    assert.deepEqual(row.locations, [{ kind: "plugin", detail: "flat-tools", active: true }]);
    assert.equal(row.callName, `plugin_flat-tools_${n}`);
  }
  assert.deepEqual(names, [...names].sort(), "표시 이름 오름차순");
  assert.deepEqual(exp.mcp.masked["flat-http"], { headers: { Authorization: MASK } });
  // 다른 프로젝트 전용 설치 원소: projectPath가 fixture 호스트 경로가 아니다
  const demo = installed.plugins["demo-tools@aoji-fixture-market"];
  const other = demo.filter((e) => e.projectPath !== undefined && e.projectPath !== "__AOJI_FIXTURE_HOST_PATH__");
  assert.equal(other.length, 1);
  const otherMcp = JSON.parse(readFileSync(fx("claude-home-basic", other[0].installPath.replace(HOME_P, ""), ".mcp.json"), "utf8"));
  const otherName = Object.keys(otherMcp.mcpServers)[0];
  assert.deepEqual(exp.mcp.notListed, [otherName]);
  assert.ok(!names.includes(otherName));
  assert.ok(!exp.mcp.rows.some((r) => r.name === otherName));
});

test("claude-home-empty: 4개 항목은 있고 MCP·플러그인·대화 기록이 없다", () => {
  assert.deepEqual(readJson("claude-home-empty", ".claude.json"), {});
  assert.deepEqual(readJson("claude-home-empty", ".claude", "settings.json"), {});
  assert.deepEqual(readJson("claude-home-empty", ".claude", "plugins", "installed_plugins.json").plugins, {});
  assert.ok(statSync(fx("claude-home-empty", ".claude", "projects")).isDirectory());
  assert.equal(walk(fx("claude-home-empty", ".claude", "projects")).filter((f) => /\.jsonl?$/.test(f)).length, 0);
  assert.equal(existsSync(fx("claude-home-empty", ".claude", ".credentials.json")), false);
});

// ---------------------------------------------------------------------------
// project-skills · project-usage
// ---------------------------------------------------------------------------

test("project-skills: 스킬 8폴더(형식 오류 포함)와 에이전트 6명·워크플로우 2개가 expected.json과 같고 MCP 정의가 없다", () => {
  const exp = readJson("project-skills", "expected.json");
  const dir = fx("project-skills", ".claude", "skills");
  const names = readdirSync(dir).sort();
  assert.equal(names.length, exp.skillCount);
  assert.deepEqual(names, exp.skills.map((s) => s.name));
  for (const s of exp.skills) {
    const parsed = parseDefinitionFile(readFileSync(path.join(dir, s.name, "SKILL.md")));
    if (s.error) {
      const reason = parsed.ok ? (parsed.name !== s.name ? "name이 폴더 이름과 다름" : null) : parsed.reason;
      assert.equal(reason, s.error, s.name);
    } else {
      assert.ok(parsed.ok && parsed.name === s.name, s.name);
      const text = readFileSync(path.join(dir, s.name, "SKILL.md"), "utf8");
      assert.equal(/^disable-model-invocation: true$/m.test(text), s.userOnly, `${s.name} userOnly`);
      assert.equal(existsSync(path.join(dir, s.name, "SOURCE.md")), s.imported, `${s.name} imported`);
    }
  }
  const agents = readdirSync(fx("project-skills", ".claude", "agents"));
  assert.equal(agents.length, exp.agentCount);
  const withSkills = agents.filter((f) => /^skills:$/m.test(readText("project-skills", ".claude", "agents", f))).map((f) => f.replace(/\.md$/, "")).sort();
  assert.deepEqual(withSkills, exp.agentsWithSkills);
  assert.deepEqual(readdirSync(fx("project-skills", ".aojistudio", "teams")).map((f) => f.replace(/\.json$/, "")).sort(), exp.workflows);
  assert.equal(existsSync(fx("project-skills", ".mcp.json")), false);
  for (const f of agents) {
    const t = readText("project-skills", ".claude", "agents", f);
    assert.ok(!/^mcpServers:/m.test(t) && !/mcp__/.test(t), `${f} MCP 정의 없음`);
  }
});

test("project-usage: project-skills와 같은 스킬·에이전트·워크플로우 + .mcp.json + MCP 정의 에이전트", () => {
  for (const rel of walk(fx("project-skills", ".claude")).map((p) => path.relative(fx("project-skills"), p))) {
    assert.ok(existsSync(fx("project-usage", rel)), rel);
    assert.ok(readFileSync(fx("project-skills", rel)).equals(readFileSync(fx("project-usage", rel))), `${rel} 바이트 같음`);
  }
  for (const f of readdirSync(fx("project-skills", ".aojistudio", "teams"))) {
    assert.equal(readText("project-usage", ".aojistudio", "teams", f), readText("project-skills", ".aojistudio", "teams", f));
  }
  const mcp = readJson("project-usage", ".mcp.json").mcpServers;
  assert.deepEqual(Object.keys(mcp).sort(), ["github", "local-tool"]);
  const agentsText = readdirSync(fx("project-usage", ".claude", "agents")).map((f) => readText("project-usage", ".claude", "agents", f)).join("\n");
  assert.ok(/^mcpServers:/m.test(agentsText) && /tools: .*mcp__/.test(agentsText));
  const settings = readJson("project-usage", ".claude", "settings.json");
  assert.deepEqual(Object.keys(settings.hooks).sort(), [...HOOK_EVENTS].sort());
  assert.deepEqual(settings.enabledMcpjsonServers, ["github"]);
  assert.deepEqual(settings.disabledMcpjsonServers, ["local-tool"]);
});

// ---------------------------------------------------------------------------
// 상태줄 입력 (ADR-83 검증 규칙)
// ---------------------------------------------------------------------------

function validateStatusline(o) {
  const errors = [];
  if (o.subscription_type !== undefined && !(typeof o.subscription_type === "string" && /^[A-Za-z0-9 _.-]{1,40}$/.test(o.subscription_type))) errors.push("subscription_type");
  for (const w of ["five_hour", "seven_day"]) {
    const x = o.rate_limits?.[w];
    if (x === undefined) continue;
    const pct = x.used_percentage;
    if (pct !== undefined && !(typeof pct === "number" && Number.isFinite(pct) && pct >= 0 && pct <= 1000)) errors.push(`${w}.used_percentage`);
    const r = x.resets_at;
    if (r !== undefined && !(typeof r === "number" || (typeof r === "string" && !Number.isNaN(Date.parse(r))))) errors.push(`${w}.resets_at`);
  }
  return errors;
}

test("statusline 입력 fixture: 전체·한도 없음은 ADR-83 규칙을 통과하고 형식 오류 입력은 거부된다", () => {
  const exp = readJson("statusline", "expected.json");
  const full = readJson("statusline", "full.json");
  assert.deepEqual(validateStatusline(full), []);
  assert.equal(full.subscription_type, exp["full.json"].subscription_type);
  assert.equal(full.rate_limits.five_hour.used_percentage, exp["full.json"].fiveHour.used_percentage);
  assert.equal(full.rate_limits.seven_day.resets_at, exp["full.json"].sevenDay.resets_at);
  const noLimits = readJson("statusline", "no-limits.json");
  assert.deepEqual(validateStatusline(noLimits), []);
  assert.equal("rate_limits" in noLimits, false);
  assert.equal(noLimits.subscription_type, exp["no-limits.json"].subscription_type);
  const bad = readJson("statusline", "bad-type.json");
  assert.ok(validateStatusline(bad).length >= 3);
  assert.equal(exp["bad-type.json"].accepted, false);
});

test("FORMAT.md: 값 없이 키 경로·형태 표와 ADR 가정 대조가 있다", () => {
  const text = readText("FORMAT.md");
  for (const h of ["~/.claude.json", "settings.json", "installed_plugins.json", "대화 기록", "서브에이전트", "상태줄", "ADR-79", "ADR-81", "ADR-83", "ADR-85"]) assert.ok(text.includes(h), h);
  assert.ok(text.includes("이 PC에 없음"));
  assert.ok(!/@[A-Za-z0-9-]+\.[a-z]{2,}/.test(text), "이메일 형태 값 없음");
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(text), "UUID 값 없음");
  assert.ok(!/\/home\/jaybee|\/Users\//.test(text), "개인 경로 없음");
});
