import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PixelChar } from "./PixelChar";
import { PIXEL_CHAR_PX, PIXEL_RECTS } from "./pixelParts";

const FS_MODULE = "node:fs";
const fs = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: "utf8"): string };
const layoutCss: string = fs.readFileSync("src/styles/layout.css", "utf8");
const themeCss: string = fs.readFileSync("src/styles/theme.css", "utf8");

/** ui-spec §공통 픽셀 캐릭터 / `02-workflows.html` `px-desk` 좌표(그리는 순서). */
const EXPECTED_RECTS = [
  ["frame", "0", "1", "12", "9"],
  ["screen", "1", "2", "10", "7"],
  ["code", "2", "4", "5", "1"],
  ["code", "2", "6", "7", "1"],
  ["frame", "5", "10", "2", "3"],
  ["hair", "12", "3", "6", "2"],
  ["face", "12", "5", "6", "4"],
  ["hair", "13", "6", "1", "1"],
  ["shirt", "11", "9", "8", "6"],
  ["desk", "0", "13", "22", "3"],
  ["leg", "12", "16", "2", "5"],
  ["leg", "16", "16", "2", "5"],
];

/** ui-spec 부위 색 표: 부위(변수) → [작업 중, 권한 대기, 대기] 토큰(`@theme` 변수 이름). */
const EXPECTED_COLORS: Record<string, [string, string, string]> = {
  "--px-frame": ["--color-border-strong", "--color-border-strong", "--color-border-strong"],
  "--px-screen": ["--color-live-border", "--color-waiting-border", "--color-soft"],
  "--px-code": ["--color-live", "--color-waiting", "--color-soft"],
  "--px-hair": ["--color-text-faint", "--color-text-faint", "--color-border-dashed"],
  "--px-face": ["--color-text-secondary", "--color-text-secondary", "--color-text-muted"],
  "--px-shirt": ["--color-live", "--color-waiting", "--color-idle"],
  "--px-desk": ["--color-border-dashed", "--color-border-dashed", "--color-border-dashed"],
  "--px-leg": ["--color-border-strong", "--color-border-strong", "--color-border-strong"],
};

function utilityBlock(name: string): string {
  const start = layoutCss.indexOf(`@utility ${name} {`);
  if (start < 0) throw new Error(`@utility ${name} 없음`);
  const next = layoutCss.indexOf("\n@utility", start + 1);
  const end = layoutCss.indexOf("\n}\n", start);
  return layoutCss.slice(start, next < 0 ? end : Math.min(next, end + 3));
}

function declared(block: string, variable: string): string | null {
  const m = new RegExp(`^\\s*${variable}:\\s*var\\((--[a-z-]+)\\);`, "m").exec(block);
  return m?.[1] ?? null;
}

describe("PixelChar", () => {
  it("[FR-006-AC10][FR-007-AC1] viewBox 22×22, rect 12개 좌표가 ui-spec 표와 같다, aria-hidden, crispEdges", () => {
    const { container } = render(<PixelChar status="idle" size="desk" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 22 22");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("shape-rendering", "crispEdges");
    const rects = Array.from(container.querySelectorAll("rect")).map((r) => [
      r.getAttribute("data-part"),
      r.getAttribute("x"),
      r.getAttribute("y"),
      r.getAttribute("width"),
      r.getAttribute("height"),
    ]);
    expect(rects).toEqual(EXPECTED_RECTS);
    expect(PIXEL_RECTS).toHaveLength(12);
  });

  it("[FR-006-AC10][FR-007-AC1] 크기 desk 66 · office 88 · sub 66(위아래 11px 여백 클래스)", () => {
    const sizes = (["desk", "office", "sub"] as const).map((size) => {
      const { container, unmount } = render(<PixelChar status="idle" size={size} />);
      const svg = container.querySelector("svg") as SVGElement;
      const out = [svg.getAttribute("width"), svg.getAttribute("height"), svg.classList.contains("pixel-char-sub")];
      unmount();
      return out;
    });
    expect(sizes).toEqual([
      ["66", "66", false],
      ["88", "88", false],
      ["66", "66", true],
    ]);
    expect(PIXEL_CHAR_PX).toEqual({ desk: 66, office: 88, sub: 66 });
    // 크기 숫자는 theme 토큰과 같다.
    expect(themeCss).toContain("--spacing-char-desk: 66px;");
    expect(themeCss).toContain("--spacing-char-office: 88px;");
    expect(utilityBlock("pixel-char-sub")).toContain("margin: calc((var(--spacing-char-office) - var(--spacing-char-desk)) / 2) 0;");
  });

  it("[FR-006-AC10][FR-007-AC1] 상태 3종 × 8부위 색 변수 = ui-spec 토큰 값", () => {
    const base = utilityBlock("pixel-char");
    const running = utilityBlock("pixel-char-running");
    const waiting = utilityBlock("pixel-char-waiting");
    for (const [variable, [live, wait, idle]] of Object.entries(EXPECTED_COLORS)) {
      expect(declared(running, variable) ?? declared(base, variable), `${variable} 작업 중`).toBe(live);
      expect(declared(waiting, variable) ?? declared(base, variable), `${variable} 권한 대기`).toBe(wait);
      expect(declared(base, variable), `${variable} 대기`).toBe(idle);
    }
    // 모든 rect 부위가 해당 변수를 fill로 쓴다.
    for (const part of ["frame", "screen", "code", "hair", "face", "shirt", "desk", "leg"]) {
      const rule = new RegExp(`rect\\[data-part="${part}"\\]\\s*\\{\\s*fill:\\s*var\\(--px-${part}\\);`);
      expect(rule.test(base), part).toBe(true);
    }
  });

  it("[FR-006-AC10] 상태가 클래스·data-state로 나오고 fill 전환은 200ms(motion/base)다", () => {
    const states = (["running", "waiting", "idle"] as const).map((status) => {
      const { container, unmount } = render(<PixelChar status={status} size="office" />);
      const svg = container.querySelector("svg") as SVGElement;
      const out = [svg.getAttribute("data-state"), svg.classList.contains("pixel-char-running"), svg.classList.contains("pixel-char-waiting")];
      unmount();
      return out;
    });
    expect(states).toEqual([
      ["running", true, false],
      ["waiting", false, true],
      ["idle", false, false],
    ]);
    expect(utilityBlock("pixel-char")).toContain("transition: fill 200ms var(--ease-standard);");
  });

  it("[FR-007-AC3] 정의 없는 서브에이전트(sub)도 같은 상태 색 규칙 — 별도 셔츠 색 변수가 없다", () => {
    const { container } = render(<PixelChar status="running" size="sub" />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.classList.contains("pixel-char-running")).toBe(true);
    expect(svg).toHaveAttribute("data-state", "running");
    expect(layoutCss).not.toMatch(/--px-sub|pixel-char-sub-shirt/);
    expect(declared(utilityBlock("pixel-char-running"), "--px-shirt")).toBe("--color-live");
  });
});
