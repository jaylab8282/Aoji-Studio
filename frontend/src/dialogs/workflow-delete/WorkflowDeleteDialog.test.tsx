import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowDeleteDialog } from "./WorkflowDeleteDialog";
import { WorkflowAddDialog } from "../workflow-add/WorkflowAddDialog";
import { MemoryRouter } from "react-router-dom";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

/** `DELETE /api/workflows/{workflow}` 응답만 바꿔 가며 쓰는 fetch 대역(테스트 전용). */
function stubFetch(deleteResponse: () => Response | Promise<Response>) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/browser-token")) {
        return jsonResponse({ token: "a".repeat(64) });
      }
      if (url.includes("/api/workflows/")) {
        calls.push({ url, method: init?.method ?? "GET" });
        return deleteResponse();
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  return calls;
}

function renderDialog(onClose = vi.fn(), workflowName = "개발부서") {
  render(<WorkflowDeleteDialog workflowName={workflowName} onClose={onClose} />);
  return onClose;
}

function typeConfirmName(value: string) {
  fireEvent.change(screen.getByLabelText("확인을 위해 이름 입력"), { target: { value } });
}

describe("WorkflowDeleteDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[FR-017-AC2] 제목·안내·입력·취소·삭제 구성(06-6과 같은 컴포넌트 ConfirmByNameDialog)", () => {
    renderDialog();

    // 06-6(SCR-06-6)과 같은 공통 컴포넌트를 쓴다.
    expect(screen.getByTestId("confirm-by-name-dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "개발부서 워크플로우를 삭제할까요?" })).toBeInTheDocument();
    expect(screen.getByText("구성 파일 .jaystudio/teams/개발부서.json이 삭제됩니다")).toBeInTheDocument();
    expect(screen.getByLabelText("확인을 위해 이름 입력")).toHaveAttribute("placeholder", "개발부서");
    expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제 (이름 일치 시 활성)" })).toBeInTheDocument();
  });

  it("[FR-017-AC3] 이름 불일치 비활성, 일치 활성", () => {
    renderDialog();
    const deleteButton = () => screen.getByRole("button", { name: "삭제 (이름 일치 시 활성)" });

    expect(deleteButton()).toBeDisabled();
    typeConfirmName("개발");
    expect(deleteButton()).toBeDisabled();
    typeConfirmName("개발부서 ");
    expect(deleteButton()).toBeDisabled();
    typeConfirmName("개발부서");
    expect(deleteButton()).toBeEnabled();
  });

  it("[FR-017-AC4] 삭제 성공 → DELETE 호출(이름 percent-encoding) 후 팝업 닫힘", async () => {
    const calls = stubFetch(() => emptyResponse(204));
    const onClose = renderDialog();

    typeConfirmName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "삭제 (이름 일치 시 활성)" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([
      { url: `/api/workflows/${encodeURIComponent("개발부서")}`, method: "DELETE" },
    ]);
  });

  it("[SCR-05-3] 요청 중에는 `삭제 중…`", async () => {
    let resolveDelete: (res: Response) => void = () => {};
    stubFetch(() => new Promise<Response>((resolve) => (resolveDelete = resolve)));
    renderDialog();

    typeConfirmName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "삭제 (이름 일치 시 활성)" }));

    expect(await screen.findByRole("button", { name: "삭제 중…" })).toBeDisabled();
    resolveDelete(emptyResponse(204));
  });

  it("[FR-017-E1] 409 WORKFLOW_NOT_EMPTY → 문구 표시 후 닫힘", async () => {
    stubFetch(() =>
      jsonResponse({ code: "WORKFLOW_NOT_EMPTY", message: "팀원이 있어 삭제할 수 없습니다" }, 409),
    );
    const onClose = renderDialog();

    typeConfirmName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "삭제 (이름 일치 시 활성)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("팀원이 있어 삭제할 수 없습니다");
    expect(onClose).not.toHaveBeenCalled();
    // 사유를 보여준 뒤 팝업이 닫힌다(02 갱신은 SSE `registry`가 한다).
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("[FR-017-E2] 500 → message, 팝업 유지", async () => {
    stubFetch(() =>
      jsonResponse({ code: "IO_FAILED", message: "구성 파일 삭제 실패 · 파일은 그대로입니다" }, 500),
    );
    const onClose = renderDialog();

    typeConfirmName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "삭제 (이름 일치 시 활성)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("구성 파일 삭제 실패 · 파일은 그대로입니다");
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "개발부서 워크플로우를 삭제할까요?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제 (이름 일치 시 활성)" })).toBeEnabled();
  });

  it("[SCR-05-3] 취소 → 팝업 닫힘", () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[FR-017-AC5] 이름 변경 입력·버튼 없음", () => {
    snapshotStore.replace(buildSnapshotFixture());
    const deleteDialog = render(<WorkflowDeleteDialog workflowName="개발부서" onClose={vi.fn()} />);

    // 05-3의 입력은 확인용 하나뿐이고, 기존 이름을 바꿔 저장하는 입력·버튼이 없다.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByLabelText("확인을 위해 이름 입력")).toHaveValue("");
    for (const button of screen.getAllByRole("button")) {
      expect(button.textContent).not.toMatch(/이름 변경|이름 수정|이름 바꾸기/);
    }
    deleteDialog.unmount();

    // 05 왼쪽의 `이름`은 새로 만들 이름이고 기존 워크플로우 이름이 채워지지 않는다.
    render(
      <MemoryRouter initialEntries={["/workflows"]}>
        <WorkflowAddDialog onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("이름")).toHaveValue("");
    for (const button of screen.getAllByRole("button")) {
      expect(button.textContent).not.toMatch(/이름 변경|이름 수정|이름 바꾸기/);
    }
    snapshotStore.reset();
  });
});
