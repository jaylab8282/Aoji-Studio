import { describe, expect, it } from "vitest";

/**
 * 소스 코드 자체를 검사하는 정적 단언(ADR-41 / conventions.md §3 Frontend MUST, §6 MUST).
 * Node fs 대신 Vite의 `import.meta.glob(..., '?raw')`로 `src` 전체를 문자열로 읽는다.
 */
const RAW_SOURCES = import.meta.glob<string>("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** glob 키(`../lib/origin.ts`)를 프로젝트 기준 경로(`src/lib/origin.ts`)로 바꾼다. */
const SOURCES: ReadonlyArray<readonly [string, string]> = Object.entries(RAW_SOURCES)
  .map(([key, text]) => [key.replace(/^\.\.\//, "src/"), text] as const)
  .sort((a, b) => a[0].localeCompare(b[0]));

function sourceOf(path: string): string {
  const found = SOURCES.find(([name]) => name === path);
  if (!found) {
    throw new Error(`정적 단언 대상 파일을 찾지 못했습니다: ${path}`);
  }
  return found[1];
}

const THIS_FILE = "src/test/staticRules.test.ts";

/** 출처(호스트명·포트·스킴)를 바꾸는 이동 코드. `location`·`loc` 두 이름 모두 본다. */
const ORIGIN_NAVIGATION_PATTERNS: ReadonlyArray<RegExp> = [
  /\bloc(?:ation)?\.replace\s*\(/,
  /\bloc(?:ation)?\.assign\s*\(/,
  /\bloc(?:ation)?\.href\s*=[^=]/,
  /\bwindow\.location\s*=[^=]/,
];

function hasOriginNavigation(text: string): boolean {
  return ORIGIN_NAVIGATION_PATTERNS.some((pattern) => pattern.test(text));
}

/** `{`…`}` 짝을 세어 `openIndex`의 여는 중괄호에 대응하는 닫는 중괄호 위치를 찾는다. */
function blockEndIndex(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  throw new Error("닫는 중괄호를 찾지 못했습니다");
}

describe("정적 단언", () => {
  it("[ADR-41] main.tsx가 createRoot·render보다 먼저 redirectToCanonical을 호출하고, true면 렌더하지 않는다", () => {
    const main = sourceOf("src/app/main.tsx");

    const guard = /if\s*\(\s*!\s*redirectToCanonical\s*\(\s*window\.location\s*\)\s*\)\s*\{/.exec(main);
    expect(guard, "main.tsx에 `if (!redirectToCanonical(window.location)) {` 가드가 없다").not.toBeNull();
    const guardStart = guard!.index;
    const braceIndex = guardStart + guard![0].length - 1;
    const guardEnd = blockEndIndex(main, braceIndex);

    const createRootIndex = main.indexOf("createRoot(");
    const renderIndex = main.indexOf(".render(");
    const startStreamIndex = main.indexOf("startStream()");

    // 호출 순서: redirectToCanonical → createRoot → render → 첫 API 호출(SSE)
    expect(createRootIndex).toBeGreaterThan(guardStart);
    expect(renderIndex).toBeGreaterThan(createRootIndex);
    expect(startStreamIndex).toBeGreaterThan(guardStart);

    // true(=이동)면 렌더하지 않는다: 렌더·SSE 시작이 모두 가드 블록 안에 있다.
    expect(createRootIndex).toBeLessThan(guardEnd);
    expect(renderIndex).toBeLessThan(guardEnd);
    expect(startStreamIndex).toBeLessThan(guardEnd);

    // 가드 블록 밖에 남은 렌더·SSE 호출이 없다(호출이 각각 한 번뿐인지 확인).
    expect(main.split("createRoot(").length - 1).toBe(1);
    expect(main.split("startStream()").length - 1).toBe(1);
  });

  it("[ADR-41] frontend/src에서 location.replace·location.href 대입으로 출처를 바꾸는 코드는 main.tsx 한 곳뿐이고, publicOrigin으로 리다이렉트하는 코드가 없다", () => {
    // 이동 코드는 lib/origin.ts(구현) 한 파일에만 있다. 테스트 파일은 가짜 location을 쓰므로 제외한다.
    const navigators = SOURCES.filter(
      ([path, text]) =>
        path !== THIS_FILE && !/\.test\.tsx?$/.test(path) && hasOriginNavigation(text),
    ).map(([path]) => path);
    expect(navigators).toEqual(["src/lib/origin.ts"]);

    // 그 이동을 일으키는 호출부는 main.tsx 한 곳뿐이다.
    const callers = SOURCES.filter(
      ([path, text]) =>
        path !== THIS_FILE &&
        path !== "src/lib/origin.ts" &&
        !/\.test\.tsx?$/.test(path) &&
        text.includes("redirectToCanonical("),
    ).map(([path]) => path);
    expect(callers).toEqual(["src/app/main.tsx"]);

    // publicOrigin으로 리다이렉트하는 코드가 없다: 이동 코드가 있는 파일과 그 호출부는
    // publicOrigin을 읽지 않는다(conventions.md §3 Frontend MUST).
    expect(sourceOf("src/lib/origin.ts")).not.toMatch(/publicOrigin/);
    expect(sourceOf("src/app/main.tsx")).not.toMatch(/publicOrigin/);
    const publicOriginNavigators = SOURCES.filter(
      ([path, text]) => path !== THIS_FILE && text.includes("publicOrigin") && hasOriginNavigation(text),
    ).map(([path]) => path);
    expect(publicOriginNavigators).toEqual([]);
  });

  it("[conventions §6] frontend/src에 '0.0.0.0' 문자열이 없다", () => {
    // 이 테스트 파일 자신이 걸리지 않도록 검사 문자열을 조립해서 만든다.
    const forbidden = ["0", "0", "0", "0"].join(".");
    const offenders = SOURCES.filter(([, text]) => text.includes(forbidden)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
