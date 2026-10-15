// dump-keys.mjs 단위 테스트 — 값 문자열이 출력에 0회 나오는지 확인한다 (T-R4-01).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { dumpFiles, foldKey, statFiles, classifyValue } from "../../fixtures/scripts/dump-keys.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "scripts", "dump-keys.mjs");

const SECRET_VALUES = ["CANARY-VALUE-aaa111", "CANARY-EMAIL-bbb222@example.test", "CANARY-CONVO-ccc333 안녕", "CANARY-BROKEN-ddd444"];
const SECRET_KEYS = ["/home/canary/ccc-project-eee555", "0b8f6c1e-aaaa-bbbb-cccc-ddddeeeeffff", "claude-canary-model-fff666"];

function withTmp(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "dumpkeys-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("dump-keys: JSON — 값 문자열 0회, 동적 키는 <*>, 형태만 출력", () => {
  withTmp((dir) => {
    const f = path.join(dir, "a.json");
    writeFileSync(
      f,
      JSON.stringify({
        mcpServers: { "my-canary-server": { command: SECRET_VALUES[0], env: { TOKEN_X: SECRET_VALUES[0] }, args: [SECRET_VALUES[1]] } },
        oauthAccount: { emailAddress: SECRET_VALUES[1] },
        projects: { [SECRET_KEYS[0]]: { mcpServers: {}, n: 3, ok: true, none: null } },
        byUuid: { [SECRET_KEYS[1]]: 1, [SECRET_KEYS[2]]: 2 },
      }),
    );
    const out = dumpFiles([f]);
    for (const s of [...SECRET_VALUES, ...SECRET_KEYS, "my-canary-server", "TOKEN_X"]) assert.ok(!out.includes(s), `출력에 ${s} 없음`);
    assert.match(out, /^mcpServers\.<\*>\.command\tstring$/m);
    assert.match(out, /^mcpServers\.<\*>\.args\tarray$/m);
    assert.match(out, /^mcpServers\.<\*>\.args\[\]\tstring$/m);
    assert.match(out, /^oauthAccount\.emailAddress\tstring$/m);
    assert.match(out, /^projects\.<\*>\.n\tnumber$/m);
    assert.match(out, /^projects\.<\*>\.ok\tboolean$/m);
    assert.match(out, /^projects\.<\*>\.none\tnull$/m);
    assert.match(out, /^byUuid\.<\*>\tnumber$/m);
  });
});

test("dump-keys: JSONL — 앞 200줄만, 깨진 줄은 줄 수만 세고 내용·오류 메시지 0회", () => {
  withTmp((dir) => {
    const f = path.join(dir, "s.jsonl");
    const lines = [];
    lines.push(JSON.stringify({ type: "assistant", message: { id: SECRET_VALUES[0], content: [{ type: "text", text: SECRET_VALUES[2] }], usage: { input_tokens: 1 } } }));
    lines.push(`{"broken": "${SECRET_VALUES[3]}`);
    for (let i = 0; i < 250; i++) lines.push(JSON.stringify(i < 197 ? { k: 1 } : i === 197 ? { lateKey: SECRET_VALUES[0] } : { afterKey: 1 }));
    writeFileSync(f, lines.join("\n") + "\n");
    const out = dumpFiles([f]);
    for (const s of SECRET_VALUES) assert.ok(!out.includes(s), `출력에 ${s} 없음`);
    assert.match(out, /^# parsed=\d+ unparsed=1$/m);
    assert.match(out, /^message\.usage\.input_tokens\tnumber$/m);
    assert.match(out, /^message\.content\[\]\.type\tstring$/m);
    assert.match(out, /^lateKey\tstring$/m, "200번째 줄(인덱스 199)은 포함");
    assert.doesNotMatch(out, /afterKey/);
    // 200줄 밖의 키는 없다
    const l2 = [];
    for (let i = 0; i < 200; i++) l2.push(JSON.stringify({ k: 1 }));
    l2.push(JSON.stringify({ outsideKey: 1 }));
    writeFileSync(f, l2.join("\n") + "\n");
    assert.doesNotMatch(dumpFiles([f]), /outsideKey/);
  });
});

test("dump-keys: CLI — stdout·stderr에 값 문자열 0회, 깨진 JSON 파일도 마찬가지", () => {
  withTmp((dir) => {
    const good = path.join(dir, "g.json");
    const bad = path.join(dir, "b.json");
    writeFileSync(good, JSON.stringify({ a: SECRET_VALUES[0], [SECRET_KEYS[0]]: SECRET_VALUES[1] }));
    writeFileSync(bad, `{"a": "${SECRET_VALUES[3]}", `);
    const r = spawnSync(process.execPath, [SCRIPT, good, bad], { encoding: "utf8" });
    assert.equal(r.status, 0);
    const all = r.stdout + r.stderr;
    for (const s of [...SECRET_VALUES, ...SECRET_KEYS]) assert.ok(!all.includes(s), `출력에 ${s} 없음`);
    assert.match(r.stdout, /# parsed=1 unparsed=1/);
    assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" }).status, 2);
  });
});

test("dump-keys: foldKey — 경로·UUID·모델 id·긴 키는 접고 식별자는 유지", () => {
  assert.equal(foldKey("/home/x/y"), "<*>");
  assert.equal(foldKey("0b8f6c1e-aaaa-bbbb-cccc-ddddeeeeffff"), "<*>");
  assert.equal(foldKey("claude-sonnet-4-5"), "<*>");
  assert.equal(foldKey("a".repeat(41)), "<*>");
  assert.equal(foldKey("cache_read_input_tokens"), "cache_read_input_tokens");
  assert.equal(foldKey("isSidechain"), "isSidechain");
});

test("dump-keys --stats: 개수만 출력, 값 문자열 0회, 중복·누락·합성 줄을 센다", () => {
  withTmp((dir) => {
    const f = path.join(dir, "t.jsonl");
    const mk = (id, extra = {}, model = "m-canary") => ({
      type: "assistant", requestId: "req-" + id, sessionId: SECRET_VALUES[0], timestamp: "2026-01-01T00:00:00Z", cwd: SECRET_VALUES[1],
      entrypoint: "cli", isSidechain: false,
      message: { id: SECRET_VALUES[2] + id, model, usage: { input_tokens: 1, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
      ...extra,
    });
    const rows = [mk("1"), mk("1"), mk("2", { isSidechain: true, agentName: SECRET_VALUES[3] }), mk("3", {}, "<synthetic>"), { type: "user", message: { content: SECRET_VALUES[2] } }];
    writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + "\nnot json " + SECRET_VALUES[3] + "\n");
    const out = statFiles([f]);
    for (const s of SECRET_VALUES) assert.ok(!out.includes(s), `출력에 ${s} 없음`);
    assert.match(out, /^usageLines\t4$/m);
    assert.match(out, /^usageDuplicate\t1$/m);
    assert.match(out, /^usageSidechainTrue\t1$/m);
    assert.match(out, /^usageSynthetic\t1$/m);
    assert.match(out, /^unparsed\t1$/m);
    assert.match(out, /^allLinesWith\.agentName\t1$/m);
    const r = spawnSync(process.execPath, [SCRIPT, "--stats", "--lines", "3", f], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^lines\t3$/m);
    for (const s of SECRET_VALUES) assert.ok(!(r.stdout + r.stderr).includes(s));
  });
});

test("dump-keys --stats: 중복 줄의 usage 차이·agentName 일치는 개수로만", () => {
  withTmp((dir) => {
    const f = path.join(dir, "t.jsonl");
    const agents = path.join(dir, "agents");
    mkdirSync(agents);
    writeFileSync(path.join(agents, "known-one.md"), "x");
    const base = { type: "assistant", requestId: "r", sessionId: "s", timestamp: "t", cwd: "c", entrypoint: "cli", isSidechain: false };
    const u = (out) => ({ input_tokens: 1, output_tokens: out, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
    const rows = [
      { ...base, message: { id: "m", model: "x", usage: u(1) } },
      { ...base, message: { id: "m", model: "x", usage: u(5) } },
      { type: "agent-name", sessionId: "s", agentName: "known-one" },
      { type: "agent-setting", sessionId: "s", agentSetting: SECRET_VALUES[0] },
    ];
    writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const r = spawnSync(process.execPath, [SCRIPT, "--stats", "--names-from-dir", agents, f], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^usageDuplicateUsageDiffers\t1$/m);
    assert.match(r.stdout, /^usageDuplicateOutputGrows\t1$/m);
    assert.match(r.stdout, /^agentNameLinesEqualKnownName\t1$/m);
    assert.match(r.stdout, /^agentSettingLinesEqualKnownName\t0$/m);
    assert.ok(!(r.stdout + r.stderr).includes(SECRET_VALUES[0]) && !r.stdout.includes("known-one"));
  });
});

test("dump-keys --classify: 값의 종류만 출력, 값 문자열 0회", () => {
  withTmp((dir) => {
    const f = path.join(dir, "c.json");
    writeFileSync(f, JSON.stringify({ a: { pct: 0.37, big: 1792065600, s: "2026-10-15T09:00:00.000000+00:00", t: SECRET_VALUES[0], d: "12345" } }));
    const r = spawnSync(process.execPath, [SCRIPT, "--classify", f, "a.pct", "a.big", "a.s", "a.t", "a.d", "a.none"], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^a\.pct\tnumber:decimal:0\.\.1$/m);
    assert.match(r.stdout, /^a\.big\tnumber:integer:1e9\.\.1e11\(epoch-seconds-size\)$/m);
    assert.match(r.stdout, /^a\.s\tstring:iso8601$/m);
    assert.match(r.stdout, /^a\.t\tstring:other$/m);
    assert.match(r.stdout, /^a\.d\tstring:digits$/m);
    assert.match(r.stdout, /^a\.none\tabsent$/m);
    assert.ok(!(r.stdout + r.stderr).includes(SECRET_VALUES[0]));
    assert.equal(classifyValue(55), "number:integer:1..100");
  });
});
