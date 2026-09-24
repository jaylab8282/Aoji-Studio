/**
 * 화면 문구 상수의 정적 검사 (ADR-33, conventions.md §2·§3 MUST).
 * 와이어프레임·ui-spec의 `[...]`·`<...>`는 문서 표기이므로 화면에 나가는 문자열에 남기지 않는다.
 * 검사 범위는 문자열 리터럴 + JSX 텍스트 노드이고, 대상 표기는 conventions.md §3 금지 목록
 * (`[N]`·`[이름]`·`[한 줄 설명]`·`[워크플로우 1]`·`lorem`·`TBD`·`example.com`)까지 덮는다
 * — 한글이 없는 `[N]`·`<N>`도 잡는다(T-FIX-02 리뷰 Minor 2).
 */
import { describe, expect, it } from "vitest";
import {
  WORKFLOW_ADD_DESCRIPTION,
  WORKFLOW_DESCRIPTION_PLACEHOLDER,
  floorDuplicateWarning,
  importHiddenSelectionNotice,
  importSubmitLabel,
  importTitleFor,
} from "./text";

/**
 * 검사 대상: 실제 화면으로 나가는 `frontend/src`의 소스 전부(Vite가 원본 텍스트로 읽어 온다).
 * 테스트 파일과 테스트 픽스처(`src/test/`)는 화면 문구가 아니므로 뺀다.
 */
const SOURCES = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function screenSources(): [string, string][] {
  return Object.entries(SOURCES).filter(
    ([path]) => !/\.test\.tsx?$/.test(path) && !path.startsWith("../test/"),
  );
}

interface ScanResult {
  /** 따옴표·백틱 문자열의 본문(`${...}` 보간 자리는 값이므로 뺀다). */
  literals: string[];
  /** JSX 텍스트 노드(`<p>…</p>` 사이의 글자). `{...}` 식은 값이므로 뺀다. */
  jsxTexts: string[];
  /** 주석·문자열 본문을 뺀 코드(조사 보정 분기 같은 계산을 찾을 때 쓴다). */
  code: string;
}

/**
 * 주석을 건너뛰고 문자열 본문과 JSX 텍스트 노드를 모은다.
 * 주석 안의 문서 인용(`홈 / 에이전트 워크플로우 / [이름]`)과 정규식 문자 클래스(`[가-힣...]`)는
 * 화면에 나가지 않으므로 검사 대상이 아니다.
 */
function scanSource(source: string): ScanResult {
  const literals: string[] = [];
  let code = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      index += 1;
      let body = "";
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") {
          body += source[index + 1] ?? "";
          index += 2;
          continue;
        }
        body += source[index];
        index += 1;
      }
      index += 1;
      literals.push(body.replace(/\$\{[^{}]*\}/g, ""));
      // 문자열 자리는 빈 문자열로 남겨 JSX 텍스트 추출이 문자열 안의 `<`·`>`에 걸리지 않게 한다.
      code += '""';
      continue;
    }
    code += char;
    index += 1;
  }

  const jsxTexts: string[] = [];
  for (const match of code.matchAll(/>([^<>]*)</g)) {
    const text = (match[1] ?? "").replace(/\{[^{}]*\}/g, "").trim();
    // 화면 텍스트가 아닌 코드 조각(제네릭·화살표 함수 등)을 거른다.
    if (text === "" || /[;=]/.test(text)) continue;
    jsxTexts.push(text);
  }
  return { literals, jsxTexts, code };
}

/**
 * 화면에 남으면 안 되는 자리표시.
 * - `[...]`: `[이름]`·`[N]`·`[한 줄 설명]`·`[워크플로우 1]`·`[hh:mm:ss]` 등 (한글 유무와 무관)
 * - `<...>`: `<N>`·`<name>`·`<워크플로우>` 등. 서버가 준 값에 들어 있는 괄호는 문자열 리터럴이 아니라
 *   런타임 값이므로 이 검사에 걸리지 않는다(ADR-33 예외 `leadSessionCommandTemplate`).
 */
const PLACEHOLDER_PATTERN = /\[[^\]\n]{1,40}\]|<[^<>\n]{1,40}>/;
/** conventions.md §3 금지 목록의 낱말형 placeholder. */
const FORBIDDEN_WORDS = /\blorem\b|\bTBD\b|example\.com/i;

/**
 * conventions.md §2 MUST·ADR-39: 받침을 판정해 조사를 고르는 보정 함수·분기를 어디에도 두지 않는다.
 *
 * 덮는 것(검출):
 *  1. 조사 한 글자짜리 문자열 리터럴 — 조사를 골라 이어 붙이는 코드의 흔적(`"이"` / `"가"` …).
 *  2. 한글 음절 코드 계산 — `0xAC00`·`44032`(가의 코드포인트), `charCodeAt`·`codePointAt`.
 *  3. 자모 분해 판정 — `normalize(`(NFD 분해) 및 한글 자모 블록 문자·이스케이프
 *     (`U+1100–U+11FF` 종성/초성, `U+3130–U+318F` 호환 자모, `U+A960–U+A97F`, `U+D7B0–U+D7FF`).
 *     T-FIX-03 리뷰 probe `/[ᆨ-ᇂ]$/.test(name.normalize("NFD"))`가 여기에 걸린다.
 *
 * 못 덮는 것(한계 — 리뷰 시 사람이 보아야 한다):
 *  - 받침 있는 이름을 하드코딩 목록으로 갖고 분기하는 구현(코드에 조사·자모·코드값이 안 나오는 경우).
 *  - 조사 두 벌을 통째로 문장에 담아 고르는 구현(예: `cond ? "X이 …" : "X가 …"`)처럼
 *    문자열 안에 조사가 문구와 함께 들어 있는 경우 — 문구 단위 단언(`[ADR-39] 층 경고 …`)이 대신 막는다.
 *  - 런타임에 조사 문자열을 조립하는 경우(`"이" + ""`는 1로 잡히지만, 문자 코드로 만들면 2로만 잡힌다).
 * 병기 표기(`을(를)`·`(으)로`)는 한 문자열 안에 문구와 함께 있어 1에 걸리지 않는다.
 */
const PARTICLE_ONLY = /^(이|가|을|를|은|는|와|과|로|으로)$/;
const JONGSEONG_MATH =
  /0x[Aa][Cc]00|44032|charCodeAt|codePointAt|normalize\s*\(|[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]|\\u11[0-9A-Fa-f]{2}|\\u31[3-8][0-9A-Fa-f]/;

function isOffender(text: string): boolean {
  return PLACEHOLDER_PATTERN.test(text) || FORBIDDEN_WORDS.test(text);
}

describe("화면 문구", () => {
  it("[ADR-33] frontend/src의 화면 문자열·JSX 텍스트에 자리표시 0건", () => {
    expect(screenSources().length).toBeGreaterThan(30); // 대상 파일이 비어 통과하는 일을 막는다.
    const offenders: string[] = [];
    let jsxTextCount = 0;
    for (const [file, source] of screenSources()) {
      const { literals, jsxTexts } = scanSource(source);
      jsxTextCount += jsxTexts.length;
      for (const text of [...literals, ...jsxTexts]) {
        if (isOffender(text)) offenders.push(`${file}: ${text}`);
      }
    }
    expect(offenders).toEqual([]);
    // JSX 텍스트 노드를 한 건도 못 모으면 검사기가 그 범위를 놓친 것이다(T-FIX-02 리뷰 Minor 2).
    expect(jsxTextCount).toBeGreaterThan(0);
  });

  it("[ADR-33] JSX 텍스트 노드·[N] 자리표시도 잡는다", () => {
    const sample = [
      "export function Sample() {",
      "  return (",
      "    <div>",
      "      <p>정의 파일 [이름].md</p>",
      "      <span>선택한 [N]명 가져오기</span>",
      "      <em>{count}명</em>",
      "    </div>",
      "  );",
      "}",
    ].join("\n");

    const { jsxTexts } = scanSource(sample);
    expect(jsxTexts.filter(isOffender)).toEqual(["정의 파일 [이름].md", "선택한 [N]명 가져오기"]);
    expect(jsxTexts).toContain("명"); // 값 자리(`{count}`)는 빼고 글자만 남긴다.

    // 한글이 없는 자리표시도 문자열 리터럴에서 잡는다.
    const { literals } = scanSource('const bad = "선택한 [N]명 가져오기";\nconst worse = "포트 <N>";');
    expect(literals.filter(isOffender)).toEqual(["선택한 [N]명 가져오기", "포트 <N>"]);

    // 05-R 구현은 이 검사를 통과한다: 카운트는 값으로 치환된다(ADR-33 (a)).
    expect(importSubmitLabel(2)).toBe("선택한 2명 가져오기");
    expect(isOffender(importSubmitLabel(0))).toBe(false);
  });

  it("[ADR-33] 정적 검사는 주석·정규식을 빼고 문자열만 본다(검사기 자체 확인)", () => {
    const sample = [
      "// 문서 인용: `홈 / 에이전트 워크플로우 / [이름]`",
      "const pattern = /^[가-힣A-Za-z0-9]+$/;",
      'const ok = "구성 파일 .jaystudio/teams/이름.json";',
      'const bad = "구성 파일 .jaystudio/teams/[이름].json";',
    ].join("\n");

    const { literals } = scanSource(sample);
    expect(literals.filter(isOffender)).toEqual(["구성 파일 .jaystudio/teams/[이름].json"]);
  });

  it("[ADR-39] 받침 있는 이름·없는 이름 모두 '(으)로'", () => {
    // 05-R 제목: 값 뒤 조사는 받침과 무관하게 병기 표기 한 가지다(ADR-39).
    expect(importTitleFor("개발부서")).toBe("개발부서(으)로 기존 에이전트 가져오기");
    expect(importTitleFor("개발팀")).toBe("개발팀(으)로 기존 에이전트 가져오기");
    expect(importTitleFor("dev-02")).toBe("dev-02(으)로 기존 에이전트 가져오기");
  });

  it("[ADR-39] 층 경고는 확정 문구 병기 표기", () => {
    // FR-006-AC11 확정 문구 그대로 — 이름에 따라 조사를 바꾸지 않는다.
    expect(floorDuplicateWarning("architect")).toBe(
      "architect이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요",
    );
    expect(floorDuplicateWarning("qa-01")).toBe(
      "qa-01이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요",
    );
  });

  it("[ADR-37] 가려진 선택 안내 줄은 N을 값으로 치환한다", () => {
    expect(importHiddenSelectionNotice(2)).toBe("검색으로 가려진 선택 2명");
    expect(isOffender(importHiddenSelectionNotice(2))).toBe(false);
  });

  it("[ADR-39] frontend/src에 조사 보정 함수·받침 판정 분기가 없다", () => {
    expect(screenSources().length).toBeGreaterThan(30); // 대상이 비어 통과하는 일을 막는다.
    const offenders: string[] = [];
    for (const [file, source] of screenSources()) {
      const { literals, code } = scanSource(source);
      for (const text of literals) {
        // 조사 한 글자만 든 문자열은 조사를 골라 이어 붙이는 코드의 흔적이다.
        if (PARTICLE_ONLY.test(text.trim())) offenders.push(`${file}: "${text}"`);
      }
      const math = JONGSEONG_MATH.exec(code);
      if (math !== null) offenders.push(`${file}: ${math[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("[ADR-39] 조사 보정 검사기가 실제 보정 코드를 잡는다(검사기 자체 확인)", () => {
    const particleFunction = [
      'function koreanSubjectParticle(text: string): "이" | "가" {',
      '  const last = text.trim().slice(-1).toLowerCase();',
      '  return "aeiou".includes(last) ? "가" : "이";',
      "}",
    ].join("\n");
    const { literals } = scanSource(particleFunction);
    expect(literals.filter((text) => PARTICLE_ONLY.test(text.trim()))).toEqual(["이", "가", "가", "이"]);

    // 한글 코드포인트로 받침을 계산하는 분기도 잡는다.
    const jamoMath = "const hasFinal = (name.charCodeAt(name.length - 1) - 44032) % 28 > 0;";
    expect(JONGSEONG_MATH.test(scanSource(jamoMath).code)).toBe(true);

    // NFD 자모 분해 + 분기별 완성 문장(T-FIX-03 리뷰 probe)도 잡는다 —
    // 이 경로는 조사 한 글자 리터럴이 없어 PARTICLE_ONLY로는 걸리지 않는다.
    const nfdProbe = [
      "function warn(name: string) {",
      '  const hasFinal = /[\u11A8-\u11C2]$/.test(name.normalize("NFD"));',
      '  return hasFinal ? `${name}이 여러 워크플로우에 있습니다` : `${name}가 여러 워크플로우에 있습니다`;',
      "}",
    ].join("\n");
    const probe = scanSource(nfdProbe);
    expect(probe.literals.filter((text) => PARTICLE_ONLY.test(text.trim()))).toEqual([]);
    expect(JONGSEONG_MATH.test(probe.code)).toBe(true);

    // 이스케이프로 적은 자모 범위도 같은 규칙으로 잡는다.
    expect(JONGSEONG_MATH.test(scanSource("const r = /[\\u11A8-\\u11C2]$/;").code)).toBe(true);

    // 병기 표기 구현은 걸리지 않는다.
    const bigi = 'export function title(name: string) {\n  return `${name}(으)로 기존 에이전트 가져오기`;\n}';
    const ok = scanSource(bigi);
    expect(ok.literals.filter((text) => PARTICLE_ONLY.test(text.trim()))).toEqual([]);
    expect(JONGSEONG_MATH.test(ok.code)).toBe(false);
  });

  it("[ADR-33] 05-L 설명줄은 (c) 정적 텍스트, 설명 placeholder는 (b) 입력 예시", () => {
    // (c): 괄호 기호만 벗기고 낱말은 그대로 둔다.
    expect(WORKFLOW_ADD_DESCRIPTION).toBe(
      "구성 파일 .jaystudio/teams/이름.json(팀장·팀원 목록)이 만들어집니다.",
    );
    // (b): 입력 placeholder는 괄호를 벗긴 설명 문구 그대로 유지한다(회귀 확인).
    expect(WORKFLOW_DESCRIPTION_PLACEHOLDER).toBe("한 줄 설명");
  });
});
