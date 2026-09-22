import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

describe("AppShell", () => {
  afterEach(() => {
    snapshotStore.reset();
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
});
