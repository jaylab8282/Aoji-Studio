#!/usr/bin/env node
// JSON·JSONL 파일의 "키 경로와 값의 형태"만 출력한다 (T-R4-01, ADR-81).
// 값·문자열 내용은 어디에도 출력하지 않는다. 동적 키(경로·UUID·세션 id·모델 id처럼 보이는 키, 지정한 컨테이너의 하위 키)는 <*>로 접는다.
// 파싱 오류 메시지는 값 조각을 담을 수 있어 출력하지 않고 줄 수만 센다.
// 사용법: node dump-keys.mjs <파일> [<파일> ...]   (여러 파일은 합집합. JSONL은 파일마다 앞 200줄)
//        node dump-keys.mjs --classify <JSON 파일> <점 경로> ...   (그 경로 값의 "종류"만: 숫자 범위 구간·문자열 패턴 이름)
//        node dump-keys.mjs --stats [--lines N] [--names-from-dir <에이전트 폴더>] <JSONL 파일> ...   (키 존재·중복의 "개수"만 출력. 값은 출력하지 않는다)
import { openSync, readSync, closeSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const JSONL_MAX_LINES = 200;
const MAX_READ_BYTES = 64 * 1024 * 1024;
const MAX_DEPTH = 6;

// 하위 키를 항상 <*>로 접는 키 (이름·경로·환경 변수 이름 등 사용자 데이터가 키가 되는 자리)
const FOLD_CHILDREN_OF = new Set([
  "projects", "mcpServers", "enabledPlugins", "env", "headers", "input", "tool_input",
  "toolUseResult", "githubRepoPaths", "plugins", "marketplaces", "extraKnownMarketplaces",
  "permissions", "hooks", "additionalDirectories",
]);

export function foldKey(key) {
  if (key.length > 40) return "<*>";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return "<*>"; // 경로·@·.·-·공백·숫자 시작 등
  if (/^[0-9a-f]{8,}$/i.test(key)) return "<*>";
  return key;
}

export function shapeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v === "object" ? "object" : typeof v; // string | number | boolean
}

/** acc: Map<경로, Set<형태>> */
export function collect(value, pathStr, depth, acc) {
  const shape = shapeOf(value);
  if (pathStr !== "") {
    if (!acc.has(pathStr)) acc.set(pathStr, new Set());
    acc.get(pathStr).add(shape);
  }
  if (depth >= MAX_DEPTH) return;
  if (shape === "array") {
    for (const el of value) collect(el, `${pathStr}[]`, depth + 1, acc);
  } else if (shape === "object") {
    const fold = FOLD_CHILDREN_OF.has(pathStr.split(".").pop()?.replace(/\[\]$/, "") ?? "");
    for (const [k, child] of Object.entries(value)) {
      const key = fold ? "<*>" : foldKey(k);
      collect(child, pathStr === "" ? key : `${pathStr}.${key}`, depth + 1, acc);
    }
  }
}

function readHead(file, maxLines) {
  const fd = openSync(file, "r");
  try {
    const size = statSync(file).size;
    const chunks = [];
    const buf = Buffer.alloc(1024 * 1024);
    let total = 0;
    let newlines = 0;
    while (total < Math.min(size, MAX_READ_BYTES) && newlines <= maxLines) {
      const n = readSync(fd, buf, 0, buf.length, total);
      if (n <= 0) break;
      for (let i = 0; i < n; i++) if (buf[i] === 10) newlines++;
      chunks.push(Buffer.from(buf.subarray(0, n)));
      total += n;
    }
    return Buffer.concat(chunks).toString("utf8").split("\n").slice(0, maxLines);
  } finally {
    closeSync(fd);
  }
}

export function dumpFiles(files) {
  const acc = new Map();
  let parsed = 0;
  let unparsed = 0;
  for (const file of files) {
    if (/\.jsonl$/i.test(file)) {
      for (const line of readHead(file, JSONL_MAX_LINES)) {
        if (line.trim() === "") continue;
        try {
          collect(JSON.parse(line), "", 0, acc);
          parsed++;
        } catch {
          unparsed++;
        }
      }
    } else {
      try {
        collect(JSON.parse(readHead(file, Number.MAX_SAFE_INTEGER).join("\n")), "", 0, acc);
        parsed++;
      } catch {
        unparsed++;
      }
    }
  }
  const rows = [...acc.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([p, shapes]) => `${p}\t${[...shapes].sort().join("|")}`);
  return [`# parsed=${parsed} unparsed=${unparsed}`, ...rows].join("\n") + "\n";
}

/** 값 하나의 "종류"만 돌려준다(범위 구간·문자열 패턴 이름). 값 자체는 돌려주지 않는다. */
export function classifyValue(v) {
  if (v === undefined) return "absent";
  if (v === null) return "null";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "number:non-finite";
    const kind = Number.isInteger(v) ? "integer" : "decimal";
    const range = v < 0 ? "negative" : v <= 1 ? "0..1" : v <= 100 ? "1..100" : v <= 1e9 ? "100..1e9" : v <= 1e11 ? "1e9..1e11(epoch-seconds-size)" : ">1e11(epoch-millis-size)";
    return `number:${kind}:${range}`;
  }
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v)) return "string:iso8601";
    if (/^\d+$/.test(v)) return "string:digits";
    return "string:other";
  }
  return typeof v;
}

/** JSON 파일에서 점으로 이은 경로의 값 종류만 출력한다(--classify). */
export function classifyPaths(file, paths) {
  let root;
  try {
    root = JSON.parse(readHead(file, Number.MAX_SAFE_INTEGER).join("\n"));
  } catch {
    return "# unparsed\n";
  }
  return paths.map((p) => `${p}\t${classifyValue(getPath(root, p))}`).join("\n") + "\n";
}

const STAT_PATHS = [
  "message.id", "message.model", "requestId", "sessionId", "timestamp", "cwd", "entrypoint", "isSidechain",
  "agentName", "agentSetting", "attributionSkill",
];

function getPath(obj, p) {
  let cur = obj;
  for (const k of p.split(".")) {
    if (cur === null || typeof cur !== "object" || !Object.hasOwn(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** 토큰 줄(message.usage가 객체인 줄)의 키 존재·중복 "개수"만 센다. 값은 비교에만 쓰고 출력하지 않는다. */
export function statFiles(files, maxLines = JSONL_MAX_LINES, knownNames = []) {
  const c = { files: files.length, lines: 0, unparsed: 0, usageLines: 0, usageTypeAssistant: 0, usageSidechainTrue: 0,
    usageSynthetic: 0, usageAllZero: 0, usageDuplicate: 0, usageNoMsgKey: 0, usageNoMsgModel: 0,
    usageDuplicateUsageDiffers: 0, usageDuplicateOutputGrows: 0,
    agentNameLines: 0, agentNameLinesWithSessionId: 0, agentNameLinesEqualKnownName: 0,
    agentSettingLines: 0, agentSettingLinesWithSessionId: 0, agentSettingLinesEqualKnownName: 0 };
  const known = new Set(knownNames);
  const firstUsage = new Map();
  const missing = Object.fromEntries(STAT_PATHS.map((p) => [p, 0]));
  const anyLine = { agentName: 0, agentSetting: 0, attributionSkill: 0 };
  const seen = new Set();
  for (const file of files) {
    for (const line of readHead(file, maxLines)) {
      if (line.trim() === "") continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        c.unparsed++;
        continue;
      }
      c.lines++;
      for (const k of Object.keys(anyLine)) if (getPath(o, k) !== undefined) anyLine[k]++;
      for (const k of ["agentName", "agentSetting"]) {
        if (typeof o[k] !== "string") continue;
        c[`${k}Lines`]++;
        if (typeof o.sessionId === "string" || typeof o.session_id === "string") c[`${k}LinesWithSessionId`]++;
        if (known.has(o[k])) c[`${k}LinesEqualKnownName`]++;
      }
      const u = getPath(o, "message.usage");
      if (u === null || typeof u !== "object" || Array.isArray(u)) continue;
      c.usageLines++;
      if (o.type === "assistant") c.usageTypeAssistant++;
      if (o.isSidechain === true) c.usageSidechainTrue++;
      if (getPath(o, "message.model") === "<synthetic>") c.usageSynthetic++;
      const t = ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"].map((k) => u[k]);
      if (t.every((n) => !(n > 0))) c.usageAllZero++;
      for (const p of STAT_PATHS) if (getPath(o, p) === undefined) missing[p]++;
      const mid = getPath(o, "message.id");
      const rid = o.requestId;
      if (typeof mid !== "string" || typeof rid !== "string") {
        c.usageNoMsgKey++;
        continue;
      }
      const key = `${mid}:${rid}`;
      if (seen.has(key)) {
        c.usageDuplicate++;
        const first = firstUsage.get(key);
        if (JSON.stringify(first) !== JSON.stringify(u)) {
          c.usageDuplicateUsageDiffers++;
          if (u.output_tokens > first.output_tokens) c.usageDuplicateOutputGrows++;
        }
      } else {
        seen.add(key);
        firstUsage.set(key, u);
      }
    }
  }
  const out = [`# stats (counts only)`];
  for (const [k, v] of Object.entries(c)) out.push(`${k}\t${v}`);
  for (const [k, v] of Object.entries(missing)) out.push(`usageLinesMissing.${k}\t${v}`);
  for (const [k, v] of Object.entries(anyLine)) out.push(`allLinesWith.${k}\t${v}`);
  return out.join("\n") + "\n";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let args = process.argv.slice(2);
  if (args[0] === "--classify") {
    // --classify <JSON 파일> <경로> [<경로> ...]
    if (args.length < 3) {
      process.stderr.write("usage: dump-keys.mjs --classify <file> <dotted.path> ...\n");
      process.exit(2);
    }
    process.stdout.write(classifyPaths(args[1], args.slice(2)));
    process.exit(0);
  }
  let stats = false;
  let lines = JSONL_MAX_LINES;
  let knownNames = [];
  if (args[0] === "--stats") {
    stats = true;
    args = args.slice(1);
    if (args[0] === "--lines") {
      lines = Number.parseInt(args[1], 10);
      args = args.slice(2);
    }
    if (args[0] === "--names-from-dir") {
      knownNames = readdirSync(args[1]).filter((n) => n.endsWith(".md")).map((n) => n.slice(0, -3));
      args = args.slice(2);
    }
  }
  const files = args;
  if (files.length === 0 || !Number.isInteger(lines) || lines < 1) {
    process.stderr.write("usage: dump-keys.mjs <file> [<file> ...]\n");
    process.exit(2);
  }
  process.stdout.write(stats ? statFiles(files, lines, knownNames) : dumpFiles(files));
}
