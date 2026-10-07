import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";
import { snapshotStore } from "../../state/snapshotStore";
import { connectionStore } from "../../state/connectionStore";

// Tailwind 플러그인이 `?raw`로 가져온 CSS를 변환해 빈 문자열이 되므로 Node fs로 원문을 읽는다(theme.test.ts와 같은 방식).
const FS_MODULE = "node:fs";
const fs = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: "utf8"): string };
const layoutCss: string = fs.readFileSync("src/styles/layout.css", "utf8");
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

describe("AppShell", () => {
  afterEach(() => {
    snapshotStore.reset();
    connectionStore.reset();
  });

  it("[FR-005-AC9] snapshotStore.ready false → AppShell 본문 스켈레톤, '0' 텍스트 없음", () => {
    render(
      <MemoryRouter>
        <AppShell breadcrumb="홈">
          <div>0</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("app-shell-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("[FR-005-AC9] ownLoading → ready 전에도 화면(children)을 그리고 셸 공통 스켈레톤은 없다, main은 1개", () => {
    const { container } = render(
      <MemoryRouter>
        <AppShell breadcrumb="홈" ownLoading>
          <div>화면 자체 로딩</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByText("화면 자체 로딩")).toBeInTheDocument();
    expect(screen.queryByTestId("app-shell-skeleton")).not.toBeInTheDocument();
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("[FR-005-AC9] snapshotStore.ready true → 본문(children) 렌더, 스켈레톤 없음", () => {
    snapshotStore.replace(buildSnapshotFixture());

    render(
      <MemoryRouter>
        <AppShell breadcrumb="홈">
          <div>실제 화면 내용</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("app-shell-skeleton")).not.toBeInTheDocument();
    expect(screen.getByText("실제 화면 내용")).toBeInTheDocument();
  });

  it("[NFR-11] 앱 골격: 그리드 [사이드 탭 232 | 본문 열], rail:이면 [레일 64 | 본문 열], 높이 100vh (layout.css app-grid)", () => {
    snapshotStore.replace(buildSnapshotFixture());
    const { container } = render(
      <MemoryRouter>
        <AppShell breadcrumb="홈">
          <div>본문</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(container.firstElementChild).toHaveClass("app-grid");
    const rule = /@utility app-grid \{([\s\S]*?)\n\}/.exec(layoutCss)?.[1] ?? "";
    expect(rule).toContain("grid-template-columns: var(--spacing-sidebar) minmax(0, 1fr);");
    expect(rule).toContain("height: 100vh;");
    expect(rule).toMatch(/@media \(orientation: portrait\), \(max-width: 1199px\) \{\s*grid-template-columns: var\(--spacing-rail\) minmax\(0, 1fr\);/);
  });

  it("[NFR-11] 본문 열 순서: 상단 바 → 04-3 띠(끊김 시) → 화면, 사이드 탭은 그리드 첫 칸", () => {
    snapshotStore.replace(buildSnapshotFixture());
    connectionStore.setDisconnected(5);
    const { container } = render(
      <MemoryRouter>
        <AppShell breadcrumb="홈" topBarWf="01-1">
          <div data-testid="screen">본문</div>
        </AppShell>
      </MemoryRouter>,
    );

    const grid = container.firstElementChild!;
    expect(grid.children[0]).toHaveAttribute("data-wf", "NAV");
    const col = grid.children[1]!;
    expect([...col.children].map((el) => el.getAttribute("data-wf") ?? el.tagName)).toEqual(["01-1", "04-3-1", "MAIN"]);
    expect(col.children[2]).toContainElement(screen.getByTestId("screen"));
  });

  it("[FR-016-AC1] 연결 중·연결됨에는 04-3 띠가 없고, 끊김이면 한 번만 나온다", () => {
    snapshotStore.replace(buildSnapshotFixture());
    const { container } = render(
      <MemoryRouter>
        <AppShell breadcrumb="홈">
          <div>본문</div>
        </AppShell>
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-wf="04-3-1"]')).toBeNull();

    act(() => connectionStore.setDisconnected(5));

    expect(container.querySelectorAll('[data-wf="04-3-1"]')).toHaveLength(1);
  });

  it("[FR-016-AC2] 끊김 중에도 마지막 스냅샷 화면을 유지한다(본문 그대로)", () => {
    snapshotStore.replace(buildSnapshotFixture());
    connectionStore.setDisconnected(5);

    render(
      <MemoryRouter>
        <AppShell breadcrumb="홈">
          <div>실제 화면 내용</div>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByText("실제 화면 내용")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toBeInTheDocument();
  });

  it("[NFR-12] 레일 툴팁(tooltip-rail): rail:에서만, hover·focus 때 data-tip 글자를 오른쪽 16px에 보인다", () => {
    const rule = /@utility tooltip-rail \{([\s\S]*?)\n\}/.exec(layoutCss)?.[1] ?? "";

    expect(rule).toContain("content: attr(data-tip);");
    expect(rule).toMatch(/&::after \{[^}]*display: none;/);
    expect(rule).toContain("left: calc(100% + var(--spacing) * 4);");
    expect(rule).toContain("background: var(--color-selected);");
    expect(rule).toContain("border: 1px solid var(--color-border-strong);");
    expect(rule).toMatch(
      /@media \(orientation: portrait\), \(max-width: 1199px\) \{\s*&:hover::after,\s*&:focus-within::after \{\s*display: block;/,
    );
  });
});
