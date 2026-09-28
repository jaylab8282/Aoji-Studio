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

/**
 * 구현 파일만(테스트 파일과 이 파일 자신은 단언 문자열을 담으므로 제외).
 * hover·focus 규칙(ADR-46 A)의 범위를 고정하는 검사에 쓴다.
 */
const IMPLEMENTATION_SOURCES: ReadonlyArray<readonly [string, string]> = SOURCES.filter(
  ([path]) => path !== THIS_FILE && !/\.test\.tsx?$/.test(path),
);

/**
 * hover·`:focus-visible` 클래스를 가질 수 있는 파일 전수(conventions.md §7 MUST, ADR-46 A):
 * 공용 컴포넌트 6개 + 화면 전용 클릭 영역 4곳(01 대표 카드, 02 책상 칸, 03 오피스 칸, 05-R 목록 행).
 */
const HOVER_FOCUS_FILES: ReadonlyArray<string> = [
  "src/components/common/Sidebar.tsx",
  "src/components/ui/Button.tsx",
  "src/components/ui/SearchInput.tsx",
  "src/components/ui/Select.tsx",
  "src/components/ui/TextArea.tsx",
  "src/components/ui/TextInput.tsx",
  "src/dialogs/import-agents/ImportAgentTable.tsx",
  "src/screens/home/FeaturedWorkflows.tsx",
  "src/screens/workflow-detail/Office.tsx",
  "src/screens/workflows/Floor.tsx",
];

/**
 * 화면 전용 클릭 영역 4곳의 hover·focus **값**을 고정한다(ui-spec.md §공통 표 ①·②, ADR-46 A).
 * 부류 ①(표면이 `bg/selected`를 선택 표시로 쓰지 않는 곳)은 `bg-selected`,
 * 부류 ②(선택 표시가 `bg/selected`인 05-R 목록 행)는 한 단계 아래인 `bg-soft`다 — 값이 뒤집히면
 * hover와 선택이 구분되지 않는다(A-22 핵심 제약). 파일 존재만 보는 위 단언으로는 값 교체를 못 잡는다.
 */
interface ScreenHoverValue {
  path: string;
  /** 그 화면이 쓸 수 있는 유일한 hover 배경 값. */
  expected: string;
  /**
   * 요소 자신이 키보드 포커스를 받는가(`:focus-visible` 동등 표현 대상인가).
   * 05-R 목록 행은 `<tr>`이라 자신이 포커스를 받지 않는다(행 안의 체크박스·드롭다운이 받는다).
   */
  focusable: boolean;
}

const SCREEN_HOVER_VALUES: ReadonlyArray<ScreenHoverValue> = [
  // 01 대표 워크플로우 카드(카드 전체 클릭 영역, `<a>`) — 표면 `bg/card`
  { path: "src/screens/home/FeaturedWorkflows.tsx", expected: "bg-selected", focusable: true },
  // 02 층 안 책상 칸(`<button>`) — 표면 `bg/inset`
  { path: "src/screens/workflows/Floor.tsx", expected: "bg-selected", focusable: true },
  // 03 오피스 비선택 칸(`<button>`) — 표면 `bg/card-alt`
  { path: "src/screens/workflow-detail/Office.tsx", expected: "bg-selected", focusable: true },
  // 05-R 목록 비선택 행(`<tr>`) — 선택 행이 `bg-selected`이므로 hover는 한 단계 아래 `bg-soft`
  { path: "src/dialogs/import-agents/ImportAgentTable.tsx", expected: "bg-soft", focusable: false },
];

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

  it("[ADR-46 A] frontend/src에 outline-none·focus:outline-none이 0건이다(브라우저 기본 포커스 표시를 지우지 않는다)", () => {
    const forbidden = `outline-${"none"}`;
    const offenders = IMPLEMENTATION_SOURCES.filter(([, text]) => text.includes(forbidden)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("[ADR-46 A] hover·focus에 Tailwind 임의값(hover:bg-[…])이 0건이다", () => {
    const arbitrary = /(?:hover|focus|focus-visible|active):[a-z-]+-\[/;
    const offenders = IMPLEMENTATION_SOURCES.filter(([, text]) => arbitrary.test(text)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("[ADR-46 A] hover:·focus-visible: 클래스는 공용 컴포넌트 6개와 화면 전용 클릭 영역 4곳에만 있다", () => {
    const files = IMPLEMENTATION_SOURCES.filter(([, text]) => /hover:|focus-visible:/.test(text)).map(
      ([path]) => path,
    );
    expect([...files].sort()).toEqual([...HOVER_FOCUS_FILES].sort());
  });

  it("[ADR-46 A] 화면 전용 클릭 영역 4곳의 hover 값이 고정돼 있다(01 카드·02 칸·03 칸 = bg-selected, 05-R 행 = bg-soft)", () => {
    for (const { path, expected, focusable } of SCREEN_HOVER_VALUES) {
      const text = sourceOf(path);
      const hoverClasses = [...text.matchAll(/hover:([a-z0-9-]+)/g)].map((match) => match[1]);
      // 그 화면이 쓰는 hover 배경 값은 규정된 하나뿐이다(다른 배경 토큰을 섞지 않는다).
      const backgrounds = hoverClasses.filter((cls) => cls !== undefined && cls.startsWith("bg-"));
      expect(backgrounds, `${path} hover 배경`).toEqual([expected]);
      if (focusable) {
        // 포커스를 받는 클릭 영역에는 `:focus-visible`에도 같은 표현이 있다(conventions.md §7 MUST).
        expect(text, `${path} focus-visible`).toContain(`focus-visible:${expected}`);
      }
    }
  });

  it("[conventions §6] frontend/src에 '0.0.0.0' 문자열이 없다", () => {
    // 이 테스트 파일 자신이 걸리지 않도록 검사 문자열을 조립해서 만든다.
    const forbidden = ["0", "0", "0", "0"].join(".");
    const offenders = SOURCES.filter(([, text]) => text.includes(forbidden)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
