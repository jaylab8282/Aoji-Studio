import { describe, expect, it } from "vitest";
// Tailwind 플러그인이 `?raw`로 가져온 CSS도 변환해 빈 문자열이 되므로 파일 원문을 Node fs로 직접 읽는다(vitest 실행 위치 = frontend).
// (@types/node 없이 쓰려고 모듈 이름을 변수로 둔다.)
const FS_MODULE = "node:fs";
const fs = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: "utf8"): string };
const themeCss: string = fs.readFileSync("src/styles/theme.css", "utf8");

/** `@theme` 블록의 `--name: value;` 선언을 읽는다. */
function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = m[1];
    const value = m[2];
    if (name === undefined || value === undefined) {
      continue;
    }
    out[name] = value.trim().replace(/\s+/g, " ");
  }
  return out;
}

function themeVars(): Record<string, string> {
  const start = themeCss.indexOf("@theme");
  const open = themeCss.indexOf("{", start);
  const close = themeCss.indexOf("\n}", open);
  return declarations(themeCss.slice(open + 1, close));
}

/** 미디어 쿼리 블록 안 `:root` 선언. */
function mediaVars(query: string): Record<string, string> {
  const start = themeCss.indexOf(`\n@media ${query} {`);
  if (start < 0) {
    throw new Error(`@media ${query} 블록이 없습니다`);
  }
  const rootOpen = themeCss.indexOf("{", themeCss.indexOf(":root", start));
  const rootClose = themeCss.indexOf("}", rootOpen);
  return declarations(themeCss.slice(rootOpen + 1, rootClose));
}

// ui-spec §공통 "디자인 토큰 → 코드 매핑" 표 (한 행 = 한 항목). 값은 docs/ui/_tokens.css와 같다.
const COLORS: ReadonlyArray<readonly [string, string]> = [
  ["--color-page", "#08090d"],
  ["--color-chrome", "#0e0f14"],
  ["--color-card", "#13151b"],
  ["--color-inset", "#0c0d11"],
  ["--color-soft", "#1a1d25"],
  ["--color-selected", "#20232d"],
  ["--color-grid-line", "#111319"],
  ["--color-border", "#252833"],
  ["--color-border-strong", "#323644"],
  ["--color-border-dashed", "#444a5a"],
  ["--color-focus", "#5ca8ff"],
  ["--color-text", "#f4f5f8"],
  ["--color-text-secondary", "#c5c9d3"],
  ["--color-text-mono", "#d6d9e0"],
  ["--color-text-muted", "#a3a8b6"],
  ["--color-text-faint", "#767c8c"],
  ["--color-link", "#5ca8ff"],
  ["--color-on-action", "#ffffff"],
  ["--color-on-live", "#04161a"],
  ["--color-brand-blue", "#0b78fc"],
  ["--color-brand-cyan", "#14e7fc"],
  ["--color-action", "#0967fc"],
  ["--color-action-hover", "#0a5fe8"],
  ["--color-action-soft", "rgba(11, 120, 252, 0.16)"],
  ["--color-action-border", "#1d4f8f"],
  ["--color-live", "#14e7fc"],
  ["--color-live-soft", "rgba(20, 231, 252, 0.12)"],
  ["--color-live-border", "#1b5a66"],
  ["--color-glow", "rgba(20, 231, 252, 0.55)"],
  ["--shadow-glow", "0 0 6px var(--color-glow)"],
  ["--color-waiting", "#ffa24d"],
  ["--color-waiting-soft", "rgba(255, 162, 77, 0.14)"],
  ["--color-waiting-border", "#5a3f24"],
  ["--color-danger", "#ff7a7a"],
  ["--color-danger-soft", "rgba(255, 122, 122, 0.12)"],
  ["--color-danger-border", "#5c3236"],
  ["--color-idle", "#5e6474"],
];

const FONTS: ReadonlyArray<readonly [string, string]> = [
  ["--font-sans", '"Sora", "Gothic A1", "Noto Sans CJK KR", sans-serif'],
  ["--font-mono", '"JetBrains Mono", "Gothic A1", "Noto Sans Mono CJK KR", monospace'],
];

const TEXT: ReadonlyArray<readonly [string, string]> = [
  ["--text-title", "26px"],
  ["--text-title--line-height", "1.25"],
  ["--tracking-title", "-0.01em"],
  ["--text-section", "15px"],
  ["--text-body", "13px"],
  ["--text-body--line-height", "1.5"],
  ["--text-aux", "12px"],
  ["--text-min", "11px"],
  ["--text-figure", "30px"],
];

const RADII: ReadonlyArray<readonly [string, string]> = [
  ["--radius-control", "6px"],
  ["--radius-card", "6px"],
  ["--radius-chip", "4px"],
  ["--radius-dot", "2px"],
];

const SIZES: ReadonlyArray<readonly [string, string]> = [
  ["--spacing-sidebar", "232px"],
  ["--spacing-rail", "64px"],
  ["--spacing-header", "56px"],
  ["--spacing-panel", "360px"],
  ["--spacing-gutter", "32px"],
  ["--spacing-control", "34px"],
  ["--spacing-control-primary", "36px"],
  ["--spacing-logo", "28px"],
  ["--ease-standard", "cubic-bezier(0.2, 0, 0, 1)"],
  ["--ease-exit", "cubic-bezier(0.4, 0, 1, 1)"],
];

// ui-spec §공통 "레이아웃 치수" 표
const LAYOUT: ReadonlyArray<readonly [string, string]> = [
  ["--spacing-rail-item-w", "44px"],
  ["--spacing-rail-item-h", "40px"],
  ["--spacing-banner", "48px"],
  ["--spacing-chip", "24px"],
  ["--spacing-badge", "18px"],
  ["--spacing-dot", "8px"],
  ["--spacing-kpi-value", "39px"],
  ["--spacing-sbar", "20px"],
  ["--radius-segment", "1px"],
  ["--spacing-events-min", "220px"],
  ["--spacing-table-min", "640px"],
  ["--spacing-col-time", "96px"],
  ["--spacing-col-workflow", "120px"],
  ["--spacing-col-agent", "210px"],
  ["--spacing-col-event", "170px"],
  ["--spacing-lobby", "52px"],
  ["--spacing-search-min", "200px"],
  ["--spacing-search-max", "320px"],
  ["--spacing-floor-select", "220px"],
  ["--spacing-canvas-tail", "160px"],
  ["--spacing-desk", "100px"],
  ["--spacing-char-desk", "66px"],
  ["--spacing-desk-status", "96px"],
  ["--spacing-minimap-w", "200px"],
  ["--spacing-minimap-h", "124px"],
  ["--spacing-invalid-max", "190px"],
  ["--spacing-invalid-file", "280px"],
  ["--container-notice", "620px"],
  ["--spacing-office-min", "184px"],
  ["--spacing-office-cell", "180px"],
  ["--spacing-char-office", "88px"],
  ["--spacing-bubble", "22px"],
  ["--spacing-bubble-legend", "20px"],
  ["--spacing-kv-label", "88px"],
  ["--spacing-ev-time", "64px"],
  ["--container-dialog-sm", "480px"],
  ["--container-dialog-md", "560px"],
  ["--container-dialog-lg", "880px"],
  ["--container-dialog-lg-portrait", "920px"],
  ["--spacing-form-max", "1180px"],
  ["--spacing-prompt-min", "90px"],
  ["--spacing-tool-option", "28px"],
  ["--spacing-import-target", "260px"],
  ["--spacing-col-check", "44px"],
  ["--spacing-col-name", "200px"],
  ["--spacing-col-role", "150px"],
  ["--spacing-role-select", "30px"],
  ["--spacing-kv7-label", "132px"],
  ["--spacing-reason-min", "200px"],
  // (v1.2.0) 데이터 화면 08·09·10
  ["--spacing-tab", "40px"],
  ["--spacing-meter", "8px"],
  ["--spacing-meter-min", "60px"],
  ["--spacing-meter-limit", "10px"],
  ["--spacing-col-skill-use", "280px"],
  ["--spacing-col-skill-agents", "150px"],
  ["--spacing-col-skill-acts", "200px"],
  ["--spacing-pct", "48px"],
  ["--spacing-connector", "380px"],
  ["--spacing-col-mcp-agents", "150px"],
  ["--spacing-limits", "480px"],
  ["--spacing-chart-min", "320px"],
  ["--spacing-chart-min-short", "248px"],
  ["--spacing-chart-portrait", "400px"],
  ["--spacing-chart-axis", "44px"],
  ["--spacing-chart-xlabel", "20px"],
  ["--spacing-chart-bar-min", "6px"],
  ["--spacing-progress", "160px"],
  ["--spacing-limit-label", "72px"],
  ["--container-dialog-price", "680px"],
  ["--spacing-prev-label", "72px"],
  ["--spacing-file-chip", "20px"],
  ["--spacing-skill-body-min", "160px"],
  ["--tracking-tagline", "-0.03em"],
  ["--tracking-desk", "-0.02em"],
];

describe("theme.css [NFR-11]", () => {
  const vars = themeVars();

  it.each(COLORS)("[NFR-11] 색 %s = %s", (name, value) => {
    expect(vars[name]).toBe(value);
  });

  it.each(FONTS)("[NFR-11] 글꼴 %s", (name, value) => {
    expect(vars[name]).toBe(value);
  });

  it.each(TEXT)("[NFR-11] 글자 크기 %s = %s", (name, value) => {
    expect(vars[name]).toBe(value);
  });

  it.each(RADII)("[NFR-11] 모서리 %s = %s", (name, value) => {
    expect(vars[name]).toBe(value);
  });

  it.each(SIZES)("[NFR-11] 크기 %s = %s", (name, value) => {
    expect(vars[name]).toBe(value);
  });

  it.each(LAYOUT)("[NFR-11] 레이아웃 치수 %s = %s", (name, value) => {
    expect(vars[name]).toBe(value);
  });

  it("[NFR-11] 폭 1599 이하: gutter 24 · panel 320", () => {
    const o = mediaVars("(max-width: 1599px)");
    expect(o["--spacing-gutter"]).toBe("24px");
    expect(o["--spacing-panel"]).toBe("320px");
  });

  it("[NFR-11] 폭 1599 이하: 10 오른쪽 한도 열 420", () => {
    expect(mediaVars("(max-width: 1599px)")["--spacing-limits"]).toBe("420px");
  });

  it("[NFR-11] 폭 1399 이하·세로형: 08 행 열 사용 200 · 에이전트 130 · 동작 190", () => {
    const o = mediaVars("(max-width: 1399px), (orientation: portrait)");
    expect(o["--spacing-col-skill-use"]).toBe("200px");
    expect(o["--spacing-col-skill-agents"]).toBe("130px");
    expect(o["--spacing-col-skill-acts"]).toBe("190px");
  });

  it("[NFR-11] 폭 1599 이하 가로형: 미니맵 168×104", () => {
    const o = mediaVars("(max-width: 1599px) and (orientation: landscape)");
    expect(o["--spacing-minimap-w"]).toBe("168px");
    expect(o["--spacing-minimap-h"]).toBe("104px");
  });

  it("[NFR-11] 세로형: gutter 24 · 미니맵 160×200", () => {
    const o = mediaVars("(orientation: portrait)");
    expect(o["--spacing-gutter"]).toBe("24px");
    expect(o["--spacing-minimap-w"]).toBe("160px");
    expect(o["--spacing-minimap-h"]).toBe("200px");
  });

  it("[NFR-11] 배치 변형 portrait·rail·narrow의 미디어 조건", () => {
    expect(themeCss).toContain("@custom-variant portrait (@media (orientation: portrait));");
    expect(themeCss).toContain("@custom-variant rail (@media (orientation: portrait), (max-width: 1199px));");
    expect(themeCss).toContain("@custom-variant narrow (@media (max-width: 1599px));");
  });

  it("[NFR-11] (v1.2.0) 배치 변형 narrow-1400·short의 미디어 조건", () => {
    expect(themeCss).toContain("@custom-variant narrow-1400 (@media (max-width: 1399px));");
    expect(themeCss).toContain("@custom-variant short (@media (max-height: 900px) and (orientation: landscape));");
  });

  it("[NFR-11] 색 값은 _tokens.css의 외부 글꼴 import를 쓰지 않는다", () => {
    expect(themeCss).not.toContain("googleapis");
    expect(themeCss).not.toMatch(/https?:\/\//);
  });
});
