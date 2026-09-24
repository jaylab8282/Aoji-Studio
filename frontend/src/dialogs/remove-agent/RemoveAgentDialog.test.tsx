import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../app/router";
import type { Registry } from "../../api/types";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import { buildAgentDef, buildAgentDetail } from "../../test/fixtures/agent";
import { RemoveAgentDialog } from "./RemoveAgentDialog";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface RequestCall {
  url: string;
  method: string;
}

function stubFetch(response: () => Response) {
  const calls: RequestCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
      const method = init?.method ?? "GET";
      if (method === "GET") {
        // 06 수정 폼이 부르는 `GET /api/agents/{name}`: 요청한 name 그대로 돌려준다.
        const name = url.split("/").pop() ?? "dev-lead";
        return jsonResponse(
          name === "qa-01"
            ? buildAgentDetail({ name, workflow: null, role: null })
            : buildAgentDetail({ name }),
        );
      }
      calls.push({ url, method });
      return response();
    }),
  );
  return calls;
}

const 개발부서 = {
  name: "개발부서",
  description: "",
  filePath: ".jaystudio/teams/개발부서.json",
  lead: "dev-lead",
  members: ["qa-02"],
  brokenRefs: [],
  rawMemberCount: 2,
};

function replaceSnapshot(overrides: Partial<Registry> = {}) {
  const fixture = buildSnapshotFixture();
  snapshotStore.replace({
    ...fixture,
    registry: {
      ...fixture.registry,
      workflows: [개발부서],
      agents: [buildAgentDef(), buildAgentDef({ name: "qa-01", workflow: null, role: null })],
      ...overrides,
    },
  });
}

function renderDialog(agentName = "dev-lead", onClose = vi.fn(), onRemoved?: () => void) {
  render(
    <MemoryRouter>
      <RemoveAgentDialog agentName={agentName} onClose={onClose} onRemoved={onRemoved} />
    </MemoryRouter>,
  );
  return onClose;
}

function typeConfirmName(value: string) {
  fireEvent.change(screen.getByLabelText("확인을 위해 이름 입력"), { target: { value } });
}

const removeButton = () => screen.getByRole("button", { name: "제거 (이름 일치 시 활성)" });

describe("RemoveAgentDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replaceSnapshot();
  });

  afterEach(() => {
    snapshotStore.reset();
    vi.unstubAllGlobals();
  });

  it("[FR-012-AC1] name 일치 시만 활성", async () => {
    const calls = stubFetch(() => jsonResponse({ trashPath: ".jaystudio/trash/dev-lead.20260922-100000.md", removedFromWorkflow: "개발부서" }));
    const onClose = renderDialog();

    expect(removeButton()).toBeDisabled();
    typeConfirmName("dev");
    expect(removeButton()).toBeDisabled();
    typeConfirmName("dev-lead ");
    expect(removeButton()).toBeDisabled();
    typeConfirmName("dev-lead");
    expect(removeButton()).toBeEnabled();

    fireEvent.click(removeButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([{ url: "/api/agents/dev-lead", method: "DELETE" }]);
  });

  it("[FR-012-AC3] 팀장이면 '팀장 없음이 표시됩니다' 안내", () => {
    stubFetch(() => jsonResponse({}, 500));
    renderDialog("dev-lead");

    expect(screen.getByText("정의 파일이 .jaystudio/trash/로 이동합니다 (소프트 삭제, 복구 가능).")).toBeInTheDocument();
    expect(screen.getByText("팀장을 제거하면 개발부서 층에 팀장 없음이 표시됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "dev-lead을(를) 개발부서에서 제거할까요?" })).toBeInTheDocument();
  });

  it("[FR-012-AC3] 팀원이면 팀장 안내 줄이 없다", () => {
    replaceSnapshot({ agents: [buildAgentDef({ name: "qa-02", role: "member" })] });
    stubFetch(() => jsonResponse({}, 500));
    renderDialog("qa-02");

    expect(screen.getByText("정의 파일이 .jaystudio/trash/로 이동합니다 (소프트 삭제, 복구 가능).")).toBeInTheDocument();
    expect(screen.queryByText(/팀장 없음이 표시됩니다/)).not.toBeInTheDocument();
  });

  it("[FR-012-AC5] 워크플로우 밖 에이전트 06에서 제거 버튼 활성, 제목 '<name>을(를) 제거할까요?'", async () => {
    stubFetch(() => jsonResponse({ trashPath: ".jaystudio/trash/qa-01.20260922-100000.md", removedFromWorkflow: null }));
    const router = createMemoryRouter(routes, { initialEntries: ["/workflows?dialog=agent-edit&agent=qa-01"] });
    render(<RouterProvider router={router} />);

    // 06 수정 폼에서 워크플로우 밖 에이전트도 제거할 수 있다(휴지통 이동만).
    // 06 폼은 정의 파일을 읽는 동안에도 버튼을 그린 채 비활성으로 둔다(T-019 리뷰 Minor 1).
    // `findBy*`는 요소의 **존재**만 기다리므로, 상태 단언은 파일 읽기가 끝난 뒤(필드 렌더)에 한다.
    await screen.findByLabelText("이름 (name)");
    const openRemove = screen.getByRole("button", { name: "워크플로우에서 제거" });
    expect(openRemove).toBeEnabled();
    fireEvent.click(openRemove);

    expect(screen.getByRole("heading", { name: "qa-01을(를) 제거할까요?" })).toBeInTheDocument();
    expect(screen.queryByText(/팀장 없음이 표시됩니다/)).not.toBeInTheDocument();

    typeConfirmName("qa-01");
    fireEvent.click(removeButton());
    // 06에서 열었으면 성공 후 02로 간다(ui-spec.md SCR-06-6 이동 열).
    // 팝업 unmount는 라우터 state 변경 **뒤**의 리렌더에서 일어나므로 DOM을 먼저 기다린다(간헐 실패 방지).
    await waitFor(() => expect(screen.queryByTestId("confirm-by-name-dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/workflows");
  });

  it("[FR-012-E1] 500 → message, 팝업 유지", async () => {
    stubFetch(() => jsonResponse({ code: "IO_FAILED", message: "휴지통 이동 실패 · 파일은 그대로입니다" }, 500));
    const onClose = renderDialog();

    typeConfirmName("dev-lead");
    fireEvent.click(removeButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("휴지통 이동 실패 · 파일은 그대로입니다");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirm-by-name-dialog")).toBeInTheDocument();
    expect(removeButton()).toBeEnabled();
  });

  it("[FR-012-E2] 409 AGENT_BUSY → 문구", async () => {
    stubFetch(() => jsonResponse({ code: "AGENT_BUSY", message: "작업 중에는 제거할 수 없습니다" }, 409));
    const onClose = renderDialog();

    typeConfirmName("dev-lead");
    fireEvent.click(removeButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("작업 중에는 제거할 수 없습니다");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[SCR-06-6] 404 → `이미 없는 에이전트입니다`, 알 수 없는 오류 → 공통 문구", async () => {
    stubFetch(() => jsonResponse({ code: "AGENT_NOT_FOUND", message: "없음" }, 404));
    renderDialog();

    typeConfirmName("dev-lead");
    fireEvent.click(removeButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("이미 없는 에이전트입니다");

    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
        throw new TypeError("Failed to fetch");
      }),
    );
    fireEvent.click(removeButton());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("서버에 연결할 수 없습니다 · 다시 시도하세요"),
    );
    expect(screen.getByRole("alert").textContent).not.toMatch(/TypeError|Failed to fetch/);
  });

  it("[ADR-39] 06-6 제목 조사 병기", () => {
    stubFetch(() => jsonResponse({}, 500));
    renderDialog("dev-lead");
    expect(screen.getByRole("heading", { name: "dev-lead을(를) 개발부서에서 제거할까요?" })).toBeInTheDocument();
  });

  it("[SCR-06-6] `?dialog=agent-remove`로 열면 성공 후 03 화면을 그대로 둔다", async () => {
    stubFetch(() => jsonResponse({ trashPath: ".jaystudio/trash/dev-lead.20260922-100000.md", removedFromWorkflow: "개발부서" }));
    const router = createMemoryRouter(routes, {
      initialEntries: ["/workflows/개발부서?agent=dev-lead&dialog=agent-remove"],
    });
    render(<RouterProvider router={router} />);

    typeConfirmName("dev-lead");
    fireEvent.click(removeButton());

    await waitFor(() => expect(screen.queryByTestId("confirm-by-name-dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/workflows/개발부서");
  });
});
