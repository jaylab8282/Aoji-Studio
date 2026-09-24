/**
 * 화면 문구 상수의 정적 검사 (ADR-33, conventions.md §2·§3 MUST).
 * 와이어프레임·ui-spec의 `[...]`·`<...>`는 문서 표기이므로 화면에 나가는 문자열에 남기지 않는다.
 * 검사 범위는 문자열 리터럴 + JSX 텍스트 노드이고, 대상 표기는 conventions.md §3 금지 목록
 * (`[N]`·`[이름]`·`[한 줄 설명]`·`[워크플로우 1]`·`lorem`·`TBD`·`example.com`)까지 덮는다
 * — 한글이 없는 `[N]`·`<N>`도 잡는다(T-FIX-02 리뷰 Minor 2).
 */
import { describe, expect, it } from "vitest";
import { WORKFLOW_ADD_DESCRIPTION, WORKFLOW_DESCRIPTION_PLACEHOLDER, importSubmitLabel } from "./text";

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
  return { literals, jsxTexts };
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

  it("[ADR-33] 05-L 설명줄은 (c) 정적 텍스트, 설명 placeholder는 (b) 입력 예시", () => {
    // (c): 괄호 기호만 벗기고 낱말은 그대로 둔다.
    expect(WORKFLOW_ADD_DESCRIPTION).toBe(
      "구성 파일 .jaystudio/teams/이름.json(팀장·팀원 목록)이 만들어집니다.",
    );
    // (b): 입력 placeholder는 괄호를 벗긴 설명 문구 그대로 유지한다(회귀 확인).
    expect(WORKFLOW_DESCRIPTION_PLACEHOLDER).toBe("한 줄 설명");
  });
});
