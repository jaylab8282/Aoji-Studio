import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportDialog } from "./ImportDialog";
import type { AgentDef, Snapshot, Workflow } from "../../api/types";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function buildAgent(overrides: Partial<AgentDef> = {}): AgentDef {
  return {
    name: "agent-02",
    description: "",
    filePath: ".claude/agents/agent-02.md",
    workflow: null,
    role: null,
    duplicateWorkflows: [],
    ...overrides,
  };
}

function buildWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "개발부서",
    description: "",
    filePath: ".jaystudio/teams/개발부서.json",
    lead: null,
    members: [],
    brokenRefs: [],
    rawMemberCount: 0,
    ...overrides,
  };
}

/** `POST /api/workflows/{workflow}/members` 응답만 바꿔 가며 쓰는 fetch 대역(테스트 전용). */
function stubFetch(postResponse: () => Response | Promise<Response>) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
      if (url.includes("/members")) {
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
        });
        return postResponse();
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  return calls;
}

function setRegistry(agents: AgentDef[], workflows: Workflow[], writable = true) {
  const fixture: Snapshot = buildSnapshotFixture();
  snapshotStore.replace({
    ...fixture,
    registry: { ...fixture.registry, agents, workflows, writable, agentCount: agents.length },
  });
}

function renderDialog(workflowName: string | null = "개발부서", onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/workflows"]}>
      <ImportDialog workflowName={workflowName} onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

function check(name: string) {
  fireEvent.click(screen.getByRole("checkbox", { name }));
}

function submitButton() {
  return screen.getByRole("button", { name: /가져오기$/ });
}

/** 그 에이전트 행(`<tr>`) — 행 안의 체크박스에서 거슬러 올라간다. */
function rowOf(name: string): HTMLTableRowElement {
  const row = screen.getByRole("checkbox", { name }).closest("tr");
  if (row === null) throw new Error(`행을 찾지 못했습니다: ${name}`);
  return row;
}

describe("ImportDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    snapshotStore.reset();
    vi.unstubAllGlobals();
  });

  it("[FR-009-AC1] workflow null인 에이전트만 name 오름차순", () => {
    setRegistry(
      [
        buildAgent({ name: "zeta" }),
        buildAgent({ name: "dev-lead", workflow: "개발부서", role: "lead" }),
        buildAgent({ name: "agent-02" }),
      ],
      [buildWorkflow({ lead: null, members: ["dev-lead"] })],
    );
    renderDialog();

    const rows = screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"));
    expect(rows).toEqual(["agent-02", "zeta"]);
    expect(screen.queryByRole("checkbox", { name: "dev-lead" })).not.toBeInTheDocument();
    expect(
      screen.getByText("어느 워크플로우에도 없는 정의 파일 2개 · 파일은 그대로 두고 소속만 지정"),
    ).toBeInTheDocument();
  });

  it("[FR-009-AC2] 검색 입력 → name·description 일치 행만, 결과 0 → 안내", () => {
    setRegistry(
      [
        buildAgent({ name: "agent-02", description: "빌드를 담당한다" }),
        buildAgent({ name: "qa-01", description: "Review" }),
      ],
      [buildWorkflow()],
    );
    renderDialog();

    fireEvent.change(screen.getByPlaceholderText("이름·설명 검색"), { target: { value: "review" } });
    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual(["qa-01"]);

    fireEvent.change(screen.getByPlaceholderText("이름·설명 검색"), { target: { value: "zzz" } });
    expect(screen.getByText("일치하는 에이전트가 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("[FR-009-AC4] 대상 lead 있음 → 팀장 옵션 disabled", () => {
    setRegistry(
      [buildAgent({ name: "agent-02" }), buildAgent({ name: "agent-03" })],
      [buildWorkflow({ lead: "dev-lead", members: [] })],
    );
    renderDialog();

    for (const name of ["agent-02", "agent-03"]) {
      const select = screen.getByLabelText(`${name} 역할`);
      expect(within(select).getByRole("option", { name: "팀장" })).toBeDisabled();
      expect(within(select).getByRole("option", { name: "팀원" })).toBeEnabled();
    }
  });

  it("[FR-009-AC4] 한 행 팀장 선택 → 다른 행 팀장 disabled", () => {
    setRegistry(
      [buildAgent({ name: "agent-02" }), buildAgent({ name: "agent-03" })],
      [buildWorkflow({ lead: null })],
    );
    renderDialog();

    expect(
      within(screen.getByLabelText("agent-03 역할")).getByRole("option", { name: "팀장" }),
    ).toBeEnabled();

    fireEvent.change(screen.getByLabelText("agent-02 역할"), { target: { value: "lead" } });

    expect(
      within(screen.getByLabelText("agent-02 역할")).getByRole("option", { name: "팀장" }),
    ).toBeEnabled();
    expect(
      within(screen.getByLabelText("agent-03 역할")).getByRole("option", { name: "팀장" }),
    ).toBeDisabled();
  });

  it("[FR-009-AC5] '선택한 2명 가져오기', 0명 비활성", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ added: ["agent-02", "agent-03"], rejected: [], workflow: buildWorkflow() }),
    );
    setRegistry(
      [buildAgent({ name: "agent-02" }), buildAgent({ name: "agent-03" })],
      [buildWorkflow({ lead: null })],
    );
    const onClose = renderDialog();

    expect(screen.getByRole("button", { name: "선택한 0명 가져오기" })).toBeDisabled();

    check("agent-02");
    expect(screen.getByRole("button", { name: "선택한 1명 가져오기" })).toBeEnabled();
    check("agent-03");
    fireEvent.change(screen.getByLabelText("agent-03 역할"), { target: { value: "lead" } });

    const submit = screen.getByRole("button", { name: "선택한 2명 가져오기" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(screen.getByRole("button", { name: "가져오는 중…" })).toBeDisabled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("/api/workflows/%EA%B0%9C%EB%B0%9C%EB%B6%80%EC%84%9C/members");
    expect(calls[0]?.body).toEqual({
      members: [
        { name: "agent-02", role: "member" },
        { name: "agent-03", role: "lead" },
      ],
    });
  });

  it("[FR-009-AC5][ADR-35] 0명 비활성에 이유 줄 없음, writable=false는 '쓰기 권한 없음'", () => {
    setRegistry([buildAgent({ name: "agent-02" })], [buildWorkflow()]);
    const { unmount } = render(
      <MemoryRouter initialEntries={["/workflows"]}>
        <ImportDialog workflowName="개발부서" onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "선택한 0명 가져오기" })).toBeDisabled();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
    unmount();

    setRegistry([buildAgent({ name: "agent-02" })], [buildWorkflow()], false);
    renderDialog();

    // ui-spec §공통(ADR-35)이 이유 줄을 지정한 지점은 `writable=false`뿐이다.
    expect(screen.getAllByText("쓰기 권한 없음")).toHaveLength(2); // `+ 새로 만들기`와 `가져오기`
    expect(screen.getByRole("button", { name: "선택한 0명 가져오기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ 새로 만들기" })).toBeDisabled();
  });

  it("[FR-009-AC6] 밖 에이전트 0 → 안내 + '+ 새로 만들기'만", () => {
    setRegistry([buildAgent({ name: "dev-lead", workflow: "개발부서", role: "lead" })], [buildWorkflow()]);
    renderDialog();

    expect(screen.getByText("가져올 에이전트가 없습니다 · 새로 만들어 넣으세요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ 새로 만들기" })).toBeEnabled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("이름·설명 검색")).not.toBeInTheDocument();
  });

  it("[FR-009-AC7] ?workflow 없음 → 드롭다운, 있음 → 고정 텍스트", () => {
    setRegistry([buildAgent({ name: "agent-02" })], [buildWorkflow(), buildWorkflow({ name: "마케팅부서" })]);
    const { unmount } = render(
      <MemoryRouter initialEntries={["/workflows"]}>
        <ImportDialog workflowName={null} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    const select = screen.getByLabelText("대상 워크플로우");
    expect(select.tagName).toBe("SELECT");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "개발부서",
      "마케팅부서",
    ]);
    // ADR-38: `?workflow`가 없어도 제목은 드롭다운 현재 선택값(첫 워크플로우)을 따른다.
    expect(screen.getByRole("heading", { name: "개발부서(으)로 기존 에이전트 가져오기" })).toBeInTheDocument();
    unmount();

    renderDialog("개발부서");
    expect(screen.queryByRole("combobox", { name: "대상 워크플로우" })).not.toBeInTheDocument();
    expect(screen.getByText("개발부서", { selector: "span" })).toBeInTheDocument();
    // D-051: 값이 `<span>`(고정 텍스트)이면 labelable 요소가 아니므로 라벨을 연결하지 않는다
    // (`AgentFormFields`의 T-019 리뷰 Minor 2 선례). `for`가 남으면 무효한 `<label for>`가 된다.
    const fixedTargetLabel = screen.getByText("대상 워크플로우");
    expect(fixedTargetLabel.tagName).toBe("LABEL");
    expect(fixedTargetLabel).not.toHaveAttribute("for");
    expect(screen.getByRole("heading", { name: "개발부서(으)로 기존 에이전트 가져오기" })).toBeInTheDocument();
  });

  it("[FR-009-AC7] 워크플로우 0개 → `먼저 워크플로우를 추가하세요` + 가져오기 비활성", () => {
    setRegistry([buildAgent({ name: "agent-02" })], []);
    render(
      <MemoryRouter initialEntries={["/workflows"]}>
        <ImportDialog workflowName={null} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText("먼저 워크플로우를 추가하세요")).toBeInTheDocument();
    // D-051: 안내도 `<span>`이라 라벨을 연결하지 않는다.
    const emptyTargetLabel = screen.getByText("대상 워크플로우");
    expect(emptyTargetLabel.tagName).toBe("LABEL");
    expect(emptyTargetLabel).not.toHaveAttribute("for");
    check("agent-02");
    expect(screen.getByRole("button", { name: "선택한 1명 가져오기" })).toBeDisabled();
    // ADR-35: 이 비활성 지점에는 이유 줄이 없다.
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
  });

  it("[FR-009-AC7][ADR-38] ?workflow 없음 + 드롭다운 기본 선택 → 제목에 첫 워크플로우 이름", () => {
    setRegistry([buildAgent({ name: "agent-02" })], [buildWorkflow(), buildWorkflow({ name: "마케팅부서" })]);
    renderDialog(null);

    // 기본 선택은 `registry.workflows`의 첫 항목이고 제목이 그 대상을 말한다(ADR-38).
    expect(screen.getByLabelText("대상 워크플로우")).toHaveValue("개발부서");
    expect(screen.getByRole("heading", { name: "개발부서(으)로 기존 에이전트 가져오기" })).toBeInTheDocument();
  });

  it("[ADR-38] 드롭다운을 바꾸면 제목도 바뀐다", () => {
    setRegistry([buildAgent({ name: "agent-02" })], [buildWorkflow(), buildWorkflow({ name: "마케팅부서" })]);
    renderDialog(null);

    fireEvent.change(screen.getByLabelText("대상 워크플로우"), { target: { value: "마케팅부서" } });

    expect(screen.getByRole("heading", { name: "마케팅부서(으)로 기존 에이전트 가져오기" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "개발부서(으)로 기존 에이전트 가져오기" }),
    ).not.toBeInTheDocument();
  });

  it("[ADR-38] 워크플로우 0개 → 제목 '기존 에이전트 가져오기'", () => {
    setRegistry([buildAgent({ name: "agent-02" })], []);
    renderDialog(null);

    // 대상이 하나도 없을 때만 대상 미정 문구를 쓴다(ADR-38).
    expect(screen.getByRole("heading", { name: "기존 에이전트 가져오기" })).toBeInTheDocument();
    expect(screen.getByText("먼저 워크플로우를 추가하세요")).toBeInTheDocument();
  });

  it("[ADR-37] 2명 선택 후 결과 0 검색 → '검색으로 가려진 선택 2명' 표시, 체크 유지, '선택한 2명 가져오기' 활성", () => {
    setRegistry(
      [buildAgent({ name: "agent-02" }), buildAgent({ name: "agent-03" })],
      [buildWorkflow({ lead: null })],
    );
    renderDialog();

    check("agent-02");
    check("agent-03");
    fireEvent.change(screen.getByLabelText("agent-03 역할"), { target: { value: "lead" } });
    fireEvent.change(screen.getByPlaceholderText("이름·설명 검색"), { target: { value: "zzz" } });

    const notice = screen.getByText("검색으로 가려진 선택 2명");
    const noResults = screen.getByText("일치하는 에이전트가 없습니다");
    expect(notice).toBeInTheDocument();
    // 안내 줄은 검색 입력 아래, 결과 0 안내 위에 온다(ui-spec.md SCR-05-R 요소 표 순서).
    expect(notice.compareDocumentPosition(noResults) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "선택한 2명 가져오기" })).toBeEnabled();

    // 검색은 표시 필터일 뿐이라 체크 상태·행별 역할 값을 바꾸지 않는다(ADR-37).
    fireEvent.change(screen.getByPlaceholderText("이름·설명 검색"), { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: "agent-02" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "agent-03" })).toBeChecked();
    expect(screen.getByLabelText("agent-03 역할")).toHaveValue("lead");
    expect(screen.queryByText(/검색으로 가려진 선택/)).not.toBeInTheDocument();
  });

  it("[ADR-37] 검색어 없음 → 안내 줄 없음", () => {
    setRegistry(
      [buildAgent({ name: "agent-02" }), buildAgent({ name: "agent-03" })],
      [buildWorkflow({ lead: null })],
    );
    renderDialog();

    check("agent-02");
    expect(screen.queryByText(/검색으로 가려진 선택/)).not.toBeInTheDocument();

    // 선택 행이 검색 결과에 남아 있으면 가려진 선택이 0명이라 줄을 그리지 않는다.
    fireEvent.change(screen.getByPlaceholderText("이름·설명 검색"), { target: { value: "agent-02" } });
    expect(screen.queryByText(/검색으로 가려진 선택/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("이름·설명 검색"), { target: { value: "agent-03" } });
    expect(screen.getByText("검색으로 가려진 선택 1명")).toBeInTheDocument();
  });

  it("[FR-009-E1] 400 fields.members → 표시", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          code: "VALIDATION",
          message: "요청을 처리할 수 없습니다",
          fields: { members: "팀장은 1명만 선택할 수 있습니다" },
        },
        400,
      ),
    );
    setRegistry([buildAgent({ name: "agent-02" })], [buildWorkflow()]);
    const onClose = renderDialog();

    check("agent-02");
    fireEvent.click(submitButton());

    expect(await screen.findByText("팀장은 1명만 선택할 수 있습니다")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "선택한 1명 가져오기" })).toBeEnabled();
  });

  it("[FR-009-E2] rejected ALREADY_ASSIGNED → 행별 사유, 팝업 유지, 목록 갱신", async () => {
    stubFetch(() =>
      jsonResponse({
        added: ["agent-02"],
        rejected: [{ name: "agent-03", reason: "ALREADY_ASSIGNED" }],
        workflow: buildWorkflow({ members: ["agent-02"] }),
      }),
    );
    setRegistry(
      [buildAgent({ name: "agent-02" }), buildAgent({ name: "agent-03" })],
      [buildWorkflow({ lead: null })],
    );
    const onClose = renderDialog();

    check("agent-02");
    check("agent-03");
    fireEvent.click(submitButton());

    expect(
      await screen.findByText("agent-03: 가져오는 사이 다른 워크플로우에 소속되었습니다"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "개발부서(으)로 기존 에이전트 가져오기" })).toBeInTheDocument();

    // 목록 갱신은 SSE `registry`가 한다(realtime-spec §5): 두 에이전트 모두 소속이 생기면 목록에서 빠진다.
    snapshotStore.setRegistry({
      ...buildSnapshotFixture().registry,
      agents: [
        buildAgent({ name: "agent-02", workflow: "개발부서", role: "member" }),
        buildAgent({ name: "agent-03", workflow: "마케팅부서", role: "member" }),
      ],
      workflows: [buildWorkflow({ members: ["agent-02"] })],
    });

    await waitFor(() => expect(screen.queryByRole("checkbox")).not.toBeInTheDocument());
    expect(screen.getByText("가져올 에이전트가 없습니다 · 새로 만들어 넣으세요")).toBeInTheDocument();
    expect(
      screen.getByText("agent-03: 가져오는 사이 다른 워크플로우에 소속되었습니다"),
    ).toBeInTheDocument();
  });

  it("[FR-009-E2][ADR-36] rejected 세 사유가 각각 '<name>: <사유>'로 표시된다", async () => {
    stubFetch(() =>
      jsonResponse({
        added: [],
        rejected: [
          { name: "agent-02", reason: "ALREADY_ASSIGNED" },
          { name: "agent-03", reason: "NOT_FOUND" },
          { name: "agent-04", reason: "FORMAT_ERROR" },
        ],
        workflow: buildWorkflow(),
      }),
    );
    setRegistry(
      [
        buildAgent({ name: "agent-02" }),
        buildAgent({ name: "agent-03" }),
        buildAgent({ name: "agent-04" }),
      ],
      [buildWorkflow({ lead: null })],
    );
    const onClose = renderDialog();

    check("agent-02");
    check("agent-03");
    check("agent-04");
    fireEvent.click(submitButton());

    expect(
      await screen.findByText("agent-02: 가져오는 사이 다른 워크플로우에 소속되었습니다"),
    ).toBeInTheDocument();
    expect(screen.getByText("agent-03: 정의 파일이 없습니다 · 목록을 확인하세요")).toBeInTheDocument();
    expect(screen.getByText("agent-04: 읽지 못한 정의 파일입니다 · 목록을 확인하세요")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[ADR-36] enum 밖 reason → 이름만 표시", async () => {
    // 계약(api-spec.yaml enum) 밖 값이 오면 문장을 지어내지 않고 이름만 보여준다.
    stubFetch(() =>
      jsonResponse({
        added: [],
        rejected: [{ name: "agent-02", reason: "SOMETHING_ELSE" }],
        workflow: buildWorkflow(),
      }),
    );
    setRegistry([buildAgent({ name: "agent-02" })], [buildWorkflow({ lead: null })]);
    renderDialog();

    check("agent-02");
    fireEvent.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("agent-02");
  });

  it("[FR-009-E3] 500 → message", async () => {
    stubFetch(() =>
      jsonResponse(
        { code: "IO_FAILED", message: "구성 파일 쓰기 실패 · 구성 파일은 변경하지 않았습니다" },
        500,
      ),
    );
    setRegistry([buildAgent({ name: "agent-02" })], [buildWorkflow()]);
    const onClose = renderDialog();

    check("agent-02");
    fireEvent.click(submitButton());

    expect(
      await screen.findByText("구성 파일 쓰기 실패 · 구성 파일은 변경하지 않았습니다"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[SCR-05-R] 첫 스냅샷 전 목록 자리는 스켈레톤 5행(ADR-32 예외), 숫자를 먼저 보여주지 않는다", () => {
    renderDialog();

    expect(screen.getAllByRole("status")).toHaveLength(6); // 부제 1 + 목록 5(대상은 `?workflow` 고정 텍스트)
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/정의 파일 0개/)).not.toBeInTheDocument();
  });

  it("[SCR-05-R] 안내 박스 2줄·취소 동작", () => {
    setRegistry([buildAgent({ name: "agent-02" })], [buildWorkflow()]);
    const onClose = renderDialog();

    expect(
      screen.getByText(
        "팀장은 워크플로우당 1명이고 층의 첫 자리에 배치됩니다. 이미 팀장이 있으면 팀장 선택은 비활성.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "가져온 뒤 워크플로우에서 제거하면 정의 파일이 휴지통(.jaystudio/trash/)으로 이동합니다. 다른 워크플로우 소속 에이전트는 목록에 없습니다.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[ADR-49] 05-R 목록 행 — 비선택 행 className에 hover:·focus-visible: 문자열이 없고, 선택 행은 bg-selected를 유지한다", () => {
    setRegistry([buildAgent({ name: "agent-02" }), buildAgent({ name: "agent-03" })], [buildWorkflow()]);
    renderDialog();

    check("agent-02");

    const selectedRow = rowOf("agent-02");
    const plainRow = rowOf("agent-03");
    // 선택 표시는 그대로 남는다(hover가 아니라 선택 상태다).
    expect(selectedRow).toHaveClass("bg-selected");
    // 행에는 클릭 동작이 없으므로 hover·focus 표현을 주지 않는다(ADR-49 1).
    expect(selectedRow.className).not.toMatch(/hover:|focus-visible:/);
    expect(plainRow.className).not.toMatch(/hover:|focus-visible:/);
    expect(plainRow).not.toHaveClass("bg-soft");
    expect(plainRow).not.toHaveClass("bg-selected");
  });

  it("[ADR-49][FR-009-AC1] 05-R 행 자체에는 클릭 동작이 없다 — <tr>에 onClick·tabIndex·role이 없고, 행 본문(이름 칸) 클릭으로는 체크 상태가 바뀌지 않는다", () => {
    setRegistry([buildAgent({ name: "agent-02", description: "빌드를 담당한다" })], [buildWorkflow()]);
    renderDialog();

    const row = rowOf("agent-02");
    // 행을 클릭 영역으로 만들지 않는다(키보드 포커스·역할도 신설하지 않는다).
    expect(row.getAttribute("role")).toBeNull();
    expect(row.getAttribute("tabindex")).toBeNull();

    const checkbox = screen.getByRole("checkbox", { name: "agent-02" });
    expect(checkbox).not.toBeChecked();

    // 이름 칸(행 본문) 클릭 → 행으로 버블링되지만 토글이 없다.
    fireEvent.click(screen.getByText("agent-02"));
    expect(checkbox).not.toBeChecked();
    expect(submitButton()).toBeDisabled();

    // 체크박스 클릭으로 바뀌는 기존 동작은 그대로다.
    check("agent-02");
    expect(checkbox).toBeChecked();
    expect(screen.getByRole("button", { name: "선택한 1명 가져오기" })).toBeEnabled();
  });
});
