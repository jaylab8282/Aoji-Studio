import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/router";
import { snapshotStore } from "../state/snapshotStore";
import { buildSnapshotFixture } from "../test/fixtures/snapshot";
import type { Snapshot, Workflow } from "../api/types";
import { buildSkillDetail, buildSkillRow, buildSkillsReport } from "../test/fixtures/skills";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const createdWorkflow: Workflow = {
  name: "개발부서",
  description: "",
  filePath: ".aojistudio/teams/개발부서.json",
  lead: null,
  members: [],
  brokenRefs: [],
  rawMemberCount: 0,
  rawLead: null,
  rawMembers: [],
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

    // 팝업이 사라지는 것은 라우터 state가 바뀐 **뒤**의 리렌더에서 일어난다. 라우터 state를 기다린 직후
    // DOM을 읽으면 아직 이전 트리가 남아 있을 수 있으므로(간헐 실패), DOM이 반영될 때까지 기다린 뒤
    // 라우터 state를 단언한다 — 아래 `[FR-008-AC4]`와 같은 순서다.
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "워크플로우 추가" })).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe("/workflows");
    expect(router.state.location.search).toBe("");
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
        filePath: ".aojistudio/teams/개발부서.json",
        lead: null,
        members: [],
        brokenRefs: [],
        rawMemberCount: 0,
        rawLead: null,
        rawMembers: [],
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

  it("[FR-009-AC7][SCR-05-R] `?dialog=import` → 05-R 열림(대상 드롭다운), `?workflow` 있으면 고정 텍스트", () => {
    replaceSnapshot([
      {
        name: "개발부서",
        description: "",
        filePath: ".aojistudio/teams/개발부서.json",
        lead: null,
        members: [],
        brokenRefs: [],
        rawMemberCount: 0,
        rawLead: null,
        rawMembers: [],
      },
    ]);
    const router = renderAt("/workflows?dialog=import");

    // ADR-71: `?workflow`가 없으면 제목은 고정이다.
    expect(screen.getByRole("heading", { name: "기존 에이전트 가져오기" })).toBeInTheDocument();
    expect(screen.getByLabelText("대상 워크플로우").tagName).toBe("SELECT");

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(router.state.location.search).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
    expect(router.state.location.search).toBe("?dialog=import&workflow=%EA%B0%9C%EB%B0%9C%EB%B6%80%EC%84%9C");
    expect(
      screen.getByRole("heading", { name: "개발부서(으)로 기존 에이전트 가져오기" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "대상 워크플로우" })).not.toBeInTheDocument();
  });

  it("[SCR-05-R] 05-R `새로 만들기` → `?dialog=agent-new&workflow=<대상>`", () => {
    replaceSnapshot([
      {
        name: "개발부서",
        description: "",
        filePath: ".aojistudio/teams/개발부서.json",
        lead: null,
        members: [],
        brokenRefs: [],
        rawMemberCount: 0,
        rawLead: null,
        rawMembers: [],
      },
    ]);
    const router = renderAt("/workflows?dialog=import&workflow=%EA%B0%9C%EB%B0%9C%EB%B6%80%EC%84%9C");

    fireEvent.click(screen.getByRole("button", { name: "새로 만들기" }));
    expect(router.state.location.search).toBe(
      "?dialog=agent-new&workflow=%EA%B0%9C%EB%B0%9C%EB%B6%80%EC%84%9C",
    );
  });

  it("[ADR-14] `?dialog` 없음 → 팝업 없음", () => {
    replaceSnapshot([]);
    renderAt("/workflows");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("[FR-020-AC1] `?dialog=skill-new`는 08-1 만들기, `skill-edit&skill=<이름>`은 08-1 수정(읽기 GET), `skill-edit`에 `skill`이 없으면 열지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
        if (url.startsWith("/api/skills/design-review")) {
          return jsonResponse(buildSkillDetail("design-review", { description: "수정할 설명" }));
        }
        return jsonResponse(buildSkillsReport([]));
      }),
    );
    replaceSnapshot([]);

    const created = renderAt("/skills?dialog=skill-new");
    expect(screen.getByRole("heading", { name: "스킬 만들기", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("data-wf", "08-1-1");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(created.state.location.search).toBe("");
    cleanup();

    renderAt("/skills?dialog=skill-edit&skill=design-review");
    expect(await screen.findByDisplayValue("수정할 설명")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "스킬 수정" })).toBeInTheDocument();
    cleanup();

    renderAt("/skills?dialog=skill-edit");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("[FR-021-AC1] `?dialog=skill-import`는 08-2 가져오기를 연다", () => {
    stubFetch();
    replaceSnapshot([]);
    renderAt("/skills?dialog=skill-import");

    expect(screen.getByRole("heading", { name: "스킬 가져오기" })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("data-wf", "08-2-1");
  });

  it("[FR-020-AC5][FR-020-AC2] 08에서 `스킬 만들기` → 08-1 저장 → 창 닫힘 + 안내 줄 ①과 재조회로 새 행(실제 화면 연결)", async () => {
    let created = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
        if ((init?.method ?? "GET") === "POST" && url === "/api/skills") {
          created = true;
          return jsonResponse(buildSkillDetail("design-token-audit"), 201);
        }
        return jsonResponse(buildSkillsReport(created ? [buildSkillRow("design-token-audit")] : []));
      }),
    );
    replaceSnapshot([]);
    renderAt("/skills");

    fireEvent.click((await screen.findAllByRole("button", { name: "스킬 만들기" }))[0] as HTMLElement);
    fireEvent.change(await screen.findByLabelText("이름"), { target: { value: "design-token-audit" } });
    fireEvent.change(screen.getByLabelText("설명 (description)"), { target: { value: "토큰 점검" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Claude Code가 새 스킬을 바로 인식하지 못하면 재시작이 필요할 수 있습니다")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "design-token-audit 펼치기" }, { timeout: 3000 })).toBeInTheDocument();
  });
});
