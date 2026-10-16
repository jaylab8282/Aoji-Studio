import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowDeleteDialog } from "./WorkflowDeleteDialog";
import { WorkflowAddDialog } from "../workflow-add/WorkflowAddDialog";
import { MemoryRouter } from "react-router-dom";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import type { Workflow } from "../../api/types";

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

/** 가짜 타이머 구간에서 fetch 체인(마이크로태스크)을 흘려보낸다. */
async function flushPromises() {
  await act(async () => {
    for (let round = 0; round < 20; round += 1) {
      await Promise.resolve();
    }
  });
}

function buildWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "개발부서",
    description: "",
    filePath: ".aojistudio/teams/개발부서.json",
    lead: null,
    members: [],
    brokenRefs: [],
    rawMemberCount: 0,
    rawLead: null,
    rawMembers: [],
    ...overrides,
  };
}

/** 열 때의 registry를 만든다. 기본은 인원 0명(05-3). */
function seedWorkflows(...workflows: Workflow[]) {
  const base = buildSnapshotFixture();
  snapshotStore.replace({ ...base, registry: { ...base.registry, workflows } });
}

function renderDialog(onClose = vi.fn(), workflowName = "개발부서") {
  if (!snapshotStore.getSnapshot().ready) seedWorkflows(buildWorkflow({ name: workflowName }));
  render(<WorkflowDeleteDialog workflowName={workflowName} onClose={onClose} />);
  return onClose;
}

function typeConfirmName(value: string) {
  fireEvent.change(screen.getByLabelText("확인을 위해 워크플로우 이름 입력"), { target: { value } });
}

describe("WorkflowDeleteDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    snapshotStore.reset();
  });

  it("[FR-017-AC2] 제목·안내·입력·취소·삭제 구성(06-6과 같은 컴포넌트 ConfirmByNameDialog)", () => {
    renderDialog();

    // 06-6(SCR-06-6)과 같은 공통 컴포넌트(sm 480)를 쓴다.
    expect(screen.getByRole("dialog")).toHaveClass("max-w-dialog-sm");
    expect(screen.getByRole("heading", { name: "개발부서 워크플로우를 삭제할까요?" })).toBeInTheDocument();
    // 첫 줄은 앞 글자 + 고정폭 경로 + 뒤 글자(경로만 고정폭).
    const configLine = screen.getByText(".aojistudio/teams/개발부서.json");
    expect(configLine).toHaveClass("font-mono");
    expect(configLine.parentElement).toHaveTextContent("구성 파일 .aojistudio/teams/개발부서.json이 삭제됩니다");
    expect(screen.getByLabelText("확인을 위해 워크플로우 이름 입력")).toHaveAttribute("placeholder", "개발부서");
    expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(screen.getByText("삭제한 구성 파일은 휴지통에 남지 않습니다")).toBeInTheDocument();
    expect(screen.getByText("개발부서을(를) 똑같이 입력하면 삭제 버튼이 켜집니다")).toBeInTheDocument();
  });

  it("[NFR-12] data-wf 영역 05-3-1(창)·05-3-2(입력)·05-3-3(아래 줄)", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveAttribute("data-wf", "05-3-1");
    expect(document.querySelector('[data-wf="05-3-2"]')).toContainElement(screen.getByLabelText("확인을 위해 워크플로우 이름 입력"));
    const footer = document.querySelector('[data-wf="05-3-3"]');
    expect(footer).toContainElement(screen.getByRole("button", { name: "취소" }));
    expect(footer).toContainElement(screen.getByRole("button", { name: "삭제" }));
  });

  it("[FR-017-AC3] 이름 불일치 비활성, 일치 활성", () => {
    renderDialog();
    const deleteButton = () => screen.getByRole("button", { name: "삭제" });

    expect(deleteButton()).toBeDisabled();
    typeConfirmName("개발");
    expect(deleteButton()).toBeDisabled();
    typeConfirmName("개발부서 ");
    expect(deleteButton()).toBeDisabled();
    expect(deleteButton()).toHaveAccessibleDescription("개발부서을(를) 똑같이 입력하면 삭제 버튼이 켜집니다");
    typeConfirmName("개발부서");
    expect(deleteButton()).toBeEnabled();
    expect(deleteButton()).toHaveClass("text-danger");
    expect(screen.queryByText("개발부서을(를) 똑같이 입력하면 삭제 버튼이 켜집니다")).not.toBeInTheDocument();
  });

  it("[FR-017-AC4] 삭제 성공 → DELETE 호출(이름 percent-encoding) 후 팝업 닫힘", async () => {
    const calls = stubFetch(() => emptyResponse(204));
    const onClose = renderDialog();

    typeConfirmName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

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
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(await screen.findByRole("button", { name: "삭제 중…" })).toBeDisabled();
    resolveDelete(emptyResponse(204));
  });

  it("[FR-017-E1] 409 WORKFLOW_NOT_EMPTY → 3초 후 닫힘", async () => {
    // 지속 시간은 ui-spec.md SCR-05-3이 명시한 3000ms다(ADR-34).
    vi.useFakeTimers();
    try {
      stubFetch(() =>
        jsonResponse({ code: "WORKFLOW_NOT_EMPTY", message: "팀원이 있어 삭제할 수 없습니다" }, 409),
      );
      const onClose = renderDialog();

      typeConfirmName("개발부서");
      fireEvent.click(screen.getByRole("button", { name: "삭제" }));
      await flushPromises();

      expect(screen.getByRole("alert")).toHaveTextContent("팀원이 있어 삭제할 수 없습니다");
      expect(onClose).not.toHaveBeenCalled();

      // 2.9초까지는 사유가 보이고 팝업이 열려 있다.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2900);
      });
      expect(screen.getByRole("alert")).toHaveTextContent("팀원이 있어 삭제할 수 없습니다");
      expect(onClose).not.toHaveBeenCalled();

      // 3.0초에 한 번만 닫힌다(02 갱신은 SSE `registry`가 한다).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(onClose).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("[FR-017-E1] 안내 표시 중 삭제 버튼 비활성(중복 DELETE 0건, 이유 줄 없음)", async () => {
    vi.useFakeTimers();
    try {
      const calls = stubFetch(() =>
        jsonResponse({ code: "WORKFLOW_NOT_EMPTY", message: "팀원이 있어 삭제할 수 없습니다" }, 409),
      );
      renderDialog();

      typeConfirmName("개발부서");
      const deleteButton = screen.getByRole("button", { name: "삭제" });
      fireEvent.click(deleteButton);
      await flushPromises();

      // 이름이 그대로 일치해도 안내 표시 중에는 다시 누를 수 없다(같은 DELETE 중복 전송 방지).
      expect(deleteButton).toBeDisabled();
      fireEvent.click(deleteButton);
      await flushPromises();
      expect(calls).toHaveLength(1);

      // 진행 중 비활성이므로 이유 줄은 붙지 않는다(ADR-35).
      expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
      expect(screen.queryByText("팀원을 먼저 제거하세요")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("[FR-017-E1] 안내 중 취소·ESC → 3초를 기다리지 않고 즉시 닫힘", async () => {
    vi.useFakeTimers();
    try {
      stubFetch(() =>
        jsonResponse({ code: "WORKFLOW_NOT_EMPTY", message: "팀원이 있어 삭제할 수 없습니다" }, 409),
      );
      const onClose = renderDialog();

      typeConfirmName("개발부서");
      fireEvent.click(screen.getByRole("button", { name: "삭제" }));
      await flushPromises();

      const cancelButton = screen.getByRole("button", { name: "취소" });
      expect(cancelButton).toBeEnabled();
      fireEvent.click(cancelButton);
      expect(onClose).toHaveBeenCalledTimes(1);

      // ESC도 같은 구간에서 그대로 동작한다(§공통 `Dialog`).
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("[FR-017-E1] 알 수 없는 오류 → 공통 문구(내부 오류 표현 노출 없음)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) {
          return jsonResponse({ token: "a".repeat(64) });
        }
        throw new TypeError("Failed to fetch");
      }),
    );
    renderDialog();

    typeConfirmName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("서버에 연결할 수 없습니다 · 다시 시도하세요");
    expect(alert.textContent).not.toMatch(/TypeError|Failed to fetch/);
  });

  it("[FR-017-E2] 500 → message, 팝업 유지", async () => {
    // FR-017-E1 안내 시간(3000ms, ADR-34)이 지나도 500은 팝업을 닫지 않는다. 실제 시간을 재우지 않고
    // 가짜 타이머로 그 시점을 지나간다(고정 대기는 느리고 머신 부하에 따라 불안정하다).
    vi.useFakeTimers();
    try {
      stubFetch(() =>
        jsonResponse({ code: "IO_FAILED", message: "구성 파일 삭제 실패 · 파일은 그대로입니다" }, 500),
      );
      const onClose = renderDialog();

      typeConfirmName("개발부서");
      fireEvent.click(screen.getByRole("button", { name: "삭제" }));
      await flushPromises();

      expect(screen.getByRole("alert")).toHaveTextContent("구성 파일 삭제 실패 · 파일은 그대로입니다");

      // 3000ms를 넘겨도(3200ms) 닫히지 않는다 — 500에는 자동 닫힘 타이머 자체가 없다.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3200);
      });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "개발부서 워크플로우를 삭제할까요?" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "삭제" })).toBeEnabled();
      expect(screen.getByRole("alert")).toHaveTextContent("구성 파일 삭제 실패 · 파일은 그대로입니다");
    } finally {
      vi.useRealTimers();
    }
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
    expect(screen.getByLabelText("확인을 위해 워크플로우 이름 입력")).toHaveValue("");
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
  describe("05-4 삭제 불가 안내 (FR-017-AC1)", () => {
    const blocked = buildWorkflow({
      name: "디자인부서",
      lead: "design-lead",
      members: ["design-motion", "design-reviewer", "design-ui"],
      rawMemberCount: 5,
      rawLead: "design-lead",
      // 구성 파일 원본 기준: 깨진 참조(`ghost-agent`)도 나온다. 순서는 일부러 섞어 둔다.
      rawMembers: ["design-ui", "ghost-agent", "design-motion", "design-reviewer"],
    });

    function renderBlocked(onClose = vi.fn()) {
      seedWorkflows(blocked);
      const calls = stubFetch(() => emptyResponse(204));
      render(<WorkflowDeleteDialog workflowName="디자인부서" onClose={onClose} />);
      return { onClose, calls };
    }

    it("[FR-017-AC1] 인원 1명 이상 → 05-4: alertdialog·제목·data-wf, 05-3 요소(입력·삭제) 없음", () => {
      renderBlocked();

      const dialog = screen.getByRole("alertdialog", { name: "디자인부서 워크플로우를 삭제할 수 없습니다" });
      expect(dialog).toHaveAttribute("data-wf", "05-4-1");
      expect(dialog).toHaveClass("max-w-dialog-sm");
      expect(screen.getByRole("heading", { name: "디자인부서 워크플로우를 삭제할 수 없습니다" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("확인을 위해 워크플로우 이름 입력")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
      expect(document.querySelector('[data-wf="05-3-1"]')).toBeNull();
    });

    it("[FR-017-AC1] 조건 문구는 한 요소에 정확히 `팀장·팀원이 0명일 때만 삭제할 수 있습니다 · 팀원을 먼저 제거하세요`(창 설명)", () => {
      renderBlocked();

      const condition = screen.getByText("팀장·팀원이 0명일 때만 삭제할 수 있습니다 · 팀원을 먼저 제거하세요");
      expect(condition.textContent).toBe("팀장·팀원이 0명일 때만 삭제할 수 있습니다 · 팀원을 먼저 제거하세요");
      expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(condition.textContent ?? "");
    });

    it("[FR-017-AC1] `남은 에이전트 N명` + 행: 팀장 먼저, 팀원 name 오름차순, 깨진 참조 포함, 행 글자는 `<name> 팀장|팀원`뿐", () => {
      renderBlocked();

      const box = document.querySelector('[data-wf="05-4-2"]') as HTMLElement;
      expect(within(box).getByRole("heading", { name: "남은 에이전트 5명" })).toBeInTheDocument();
      const rows = within(box).getAllByRole("listitem");
      expect(rows.map((row) => row.textContent)).toEqual([
        "design-lead팀장",
        "design-motion팀원",
        "design-reviewer팀원",
        "design-ui팀원",
        "ghost-agent팀원",
      ]);
      expect(rows[0]?.textContent).toMatch(/^design-lead\s*팀장$/);
      // 팀장은 Badge, 팀원은 muted 글자. name은 말줄임 대상이라 title에 전체를 담는다.
      expect(within(rows[0] as HTMLElement).getByText("팀장")).toHaveClass("bg-selected");
      expect(within(rows[1] as HTMLElement).getByText("팀원")).toHaveClass("text-text-muted");
      expect(within(rows[0] as HTMLElement).getByText("design-lead")).toHaveAttribute("data-clamp");
      expect(within(rows[0] as HTMLElement).getByText("design-lead")).toHaveAttribute("title", "design-lead");
    });

    it("[FR-017-AC1] 팀장이 없으면(rawLead null) 팀원만, 05-4-3에는 `확인` 버튼 하나뿐이고 열리면 초점이 `확인`", () => {
      seedWorkflows(buildWorkflow({ name: "디자인부서", rawMemberCount: 1, rawLead: null, rawMembers: ["design-ui"] }));
      render(<WorkflowDeleteDialog workflowName="디자인부서" onClose={vi.fn()} />);

      expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["design-ui팀원"]);
      expect(screen.getByRole("heading", { name: "남은 에이전트 1명" })).toBeInTheDocument();
      const footer = document.querySelector('[data-wf="05-4-3"]') as HTMLElement;
      expect(within(footer).getAllByRole("button").map((button) => button.textContent)).toEqual(["확인"]);
      expect(screen.getAllByRole("button")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "확인" })).toHaveFocus();
    });

    it("[FR-017-AC1] `확인`·ESC → 창만 닫히고 삭제 요청 0회", async () => {
      const { onClose, calls } = renderBlocked();

      fireEvent.click(screen.getByRole("button", { name: "확인" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(2);

      await flushPromises();
      expect(calls).toEqual([]);
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it("[FR-017-AC1] 목록은 열 때 값으로 고정된다: 열린 사이 registry가 바뀌어도 다시 그리지 않는다", () => {
      renderBlocked();

      act(() => {
        seedWorkflows({ ...blocked, rawMemberCount: 1, rawLead: null, rawMembers: ["design-ui"] });
      });

      expect(screen.getByRole("heading", { name: "남은 에이전트 5명" })).toBeInTheDocument();
      expect(screen.getAllByRole("listitem")).toHaveLength(5);
    });

    it("[FR-017-AC1] 05-4가 열린 사이 워크플로우가 registry에서 사라지면 창을 닫는다", () => {
      const { onClose } = renderBlocked();
      expect(onClose).not.toHaveBeenCalled();

      act(() => {
        seedWorkflows();
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("[FR-017-AC1] 인원 0명 → 05-3(dialog, 05-3-1, 이름 입력·삭제), 05-4 요소는 없다", () => {
      seedWorkflows(buildWorkflow({ name: "개발부서", rawMemberCount: 0 }));
      render(<WorkflowDeleteDialog workflowName="개발부서" onClose={vi.fn()} />);

      expect(screen.getByRole("dialog")).toHaveAttribute("data-wf", "05-3-1");
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.getByLabelText("확인을 위해 워크플로우 이름 입력")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
      expect(document.querySelector('[data-wf="05-4-1"]')).toBeNull();
    });

    it("[FR-017-E1] 05-3이 열린 사이 인원이 늘어도 05-3을 유지하고, 그 뒤 409는 3초 안내 후 닫힌다(05-4로 바뀌지 않는다)", () => {
      seedWorkflows(buildWorkflow({ name: "개발부서", rawMemberCount: 0 }));
      render(<WorkflowDeleteDialog workflowName="개발부서" onClose={vi.fn()} />);

      act(() => {
        seedWorkflows(buildWorkflow({ name: "개발부서", rawMemberCount: 2, rawLead: "dev-lead", rawMembers: ["dev-01"] }));
      });

      expect(screen.getByRole("dialog")).toHaveAttribute("data-wf", "05-3-1");
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("첫 스냅샷 전에는 어느 창도 그리지 않는다(registry 없이는 05-3·05-4를 고를 수 없다)", () => {
      render(<WorkflowDeleteDialog workflowName="개발부서" onClose={vi.fn()} />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
