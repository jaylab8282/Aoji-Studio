import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/router";
import { snapshotStore } from "../state/snapshotStore";
import { buildSnapshotFixture } from "../test/fixtures/snapshot";
import type { Snapshot, Workflow } from "../api/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const createdWorkflow: Workflow = {
  name: "개발부서",
  description: "",
  filePath: ".jaystudio/teams/개발부서.json",
  lead: null,
  members: [],
  brokenRefs: [],
  rawMemberCount: 0,
};

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
      if (url.includes("/api/workflows")) return jsonResponse(createdWorkflow, 201);
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

function replaceSnapshot(workflows: Workflow[]) {
  const fixture: Snapshot = buildSnapshotFixture();
  snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows } });
}

function renderAt(initialPath: string) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("DialogHost", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    snapshotStore.reset();
    vi.unstubAllGlobals();
  });

  it("[FR-005-AC5] 01 04-7 카드 → 05 왼쪽 열림 → 만들기 후 /workflows", async () => {
    stubFetch();
    replaceSnapshot([]);
    const router = renderAt("/");

    fireEvent.click(screen.getByRole("button", { name: "워크플로우 추가" }));
    expect(router.state.location.search).toBe("?dialog=workflow-add");
    expect(screen.getByRole("heading", { name: "워크플로우 추가" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "개발부서" } });
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/workflows"));
    expect(router.state.location.search).toBe("");
    expect(screen.queryByRole("heading", { name: "워크플로우 추가" })).not.toBeInTheDocument();
  });

  it("[FR-008-AC4] 02에서 만들기 성공 → 팝업 닫힘(`?dialog` 제거), 화면은 02 유지", async () => {
    stubFetch();
    replaceSnapshot([]);
    const router = renderAt("/workflows?dialog=workflow-add");

    expect(screen.getByRole("heading", { name: "워크플로우 추가" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "개발부서" } });
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "워크플로우 추가" })).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe("/workflows");
    expect(router.state.location.search).toBe("");
  });

  it("[FR-017-AC2][SCR-05-3] 02 층 헤더 `삭제` → 05-3 열림, 취소 → `?dialog`·`?workflow` 제거", () => {
    replaceSnapshot([
      {
        name: "개발부서",
        description: "",
        filePath: ".jaystudio/teams/개발부서.json",
        lead: null,
        members: [],
        brokenRefs: [],
        rawMemberCount: 0,
      },
    ]);
    const router = renderAt("/workflows");

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(router.state.location.search).toBe("?dialog=workflow-delete&workflow=%EA%B0%9C%EB%B0%9C%EB%B6%80%EC%84%9C");
    expect(screen.getByRole("heading", { name: "개발부서 워크플로우를 삭제할까요?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(router.state.location.search).toBe("");
    expect(screen.queryByTestId("confirm-by-name-dialog")).not.toBeInTheDocument();
  });

  it("[ADR-14] `?dialog` 없음 → 팝업 없음", () => {
    replaceSnapshot([]);
    renderAt("/workflows");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
