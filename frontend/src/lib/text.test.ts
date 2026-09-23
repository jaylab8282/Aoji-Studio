/**
 * 화면 문구 상수의 정적 검사 (ADR-33, conventions.md §2·§3 MUST).
 * 와이어프레임·ui-spec의 `[...]`·`<...>`는 문서 표기이므로 화면에 나가는 문자열에 남기지 않는다.
 */
import { describe, expect, it } from "vitest";
import { WORKFLOW_ADD_DESCRIPTION, WORKFLOW_DESCRIPTION_PLACEHOLDER } from "./text";

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

/**
 * 주석을 건너뛰고 문자열·템플릿 리터럴 본문만 모은다.
 * 주석 안의 문서 인용(`홈 / 에이전트 워크플로우 / [이름]`)과 정규식 문자 클래스(`[가-힣...]`)는
 * 화면에 나가지 않으므로 검사 대상이 아니다.
 */
function stringLiterals(source: string): string[] {
  const literals: string[] = [];
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
          index += 2;
          continue;
        }
        body += source[index];
        index += 1;
      }
      index += 1;
      literals.push(body);
      continue;
    }
    index += 1;
  }
  return literals;
}

/** `[이름]`, `[N]`, `<팀장 name>`처럼 문서 표기가 그대로 남은 문자열. */
const PLACEHOLDER_PATTERN = /\[[^\]\n]*[가-힣][^\]\n]*\]/;

describe("화면 문구", () => {
  it("[ADR-33] frontend/src의 화면 문자열에 대괄호 한글 자리표시 0건", () => {
    expect(screenSources().length).toBeGreaterThan(30); // 대상 파일이 비어 통과하는 일을 막는다.
    const offenders: string[] = [];
    for (const [file, source] of screenSources()) {
      for (const literal of stringLiterals(source)) {
        if (PLACEHOLDER_PATTERN.test(literal)) {
          offenders.push(`${file}: ${literal}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("[ADR-33] 정적 검사는 주석·정규식을 빼고 문자열만 본다(검사기 자체 확인)", () => {
    const sample = [
      "// 문서 인용: `홈 / 에이전트 워크플로우 / [이름]`",
      "const pattern = /^[가-힣A-Za-z0-9]+$/;",
      'const ok = "구성 파일 .jaystudio/teams/이름.json";',
      'const bad = "구성 파일 .jaystudio/teams/[이름].json";',
    ].join("\n");

    const literals = stringLiterals(sample);
    expect(literals.filter((literal) => PLACEHOLDER_PATTERN.test(literal))).toEqual([
      "구성 파일 .jaystudio/teams/[이름].json",
    ]);
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
