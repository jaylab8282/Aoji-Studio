import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../app/router";
import type { AgentDetail, FormatError, Registry } from "../../api/types";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import { buildAgentDef, buildAgentDetail } from "../../test/fixtures/agent";
import { AGENT_CREATED_NOTICE_MS } from "../../screens/workflows/screenSignals";
import { RemoveAgentDialog } from "../remove-agent/RemoveAgentDialog";
import { SaveConflictDialog } from "../save-conflict/SaveConflictDialog";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface RequestCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

type Handler = () => Response;

/** api-spec.yaml 응답만 바꿔 가며 쓰는 fetch 대역(테스트 전용). */
function stubFetch(handlers: { get?: Handler; post?: Handler; put?: Handler; delete?: Handler }) {
  const calls: RequestCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: init?.body === undefined ? null : (JSON.parse(String(init.body)) as Record<string, unknown>),
      });
      const handler = handlers[method.toLowerCase() as keyof typeof handlers];
      if (handler === undefined) throw new Error(`unexpected fetch: ${method} ${url}`);
      return handler();
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
const 운영팀 = { ...개발부서, name: "운영팀", filePath: ".jaystudio/teams/운영팀.json", lead: null, members: [], rawMemberCount: 0 };

function replaceSnapshot(overrides: Partial<Registry> = {}) {
  const fixture = buildSnapshotFixture();
  snapshotStore.replace({
    ...fixture,
    registry: {
      ...fixture.registry,
      workflows: [개발부서, 운영팀],
      agents: [buildAgentDef(), buildAgentDef({ name: "qa-01", workflow: null, role: null })],
      ...overrides,
    },
  });
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

function fillRequired(name = "qa-09", description = "설명") {
  fireEvent.change(screen.getByLabelText("이름 (name)"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("설명 (description)"), { target: { value: description } });
}

const saveButton = () => screen.getByRole("button", { name: "저장" });

describe("AgentForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replaceSnapshot();
  });

  afterEach(() => {
    snapshotStore.reset();
    vi.unstubAllGlobals();
  });

  it("[FR-010-AC2] 전체 상속/직접 선택 명시 선택 전 저장 비활성, 직접 선택 0개 → 사유, 기타 쉼표 분리", async () => {
    const calls = stubFetch({ post: () => jsonResponse(buildAgentDetail({ name: "qa-09" }), 201) });
    renderAt("/workflows?dialog=agent-new&workflow=개발부서");

    fillRequired();
    // 도구 방식을 고르기 전에는 저장할 수 없고, 그 사유가 버튼 옆에 붙는다(ADR-35 지정 지점).
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("도구 방식을 고르세요")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("전체 상속"));
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText("도구 방식을 고르세요")).not.toBeInTheDocument();

    // 직접 선택인데 0개면 사유를 보여주고 저장하지 않는다.
    fireEvent.click(screen.getByLabelText("직접 선택"));
    expect(screen.getByText("직접 선택은 1개 이상")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Read"));
    fireEvent.click(screen.getByLabelText("Bash"));
    fireEvent.change(screen.getByLabelText("기타"), { target: { value: "mcp__docs, mcp__db" } });
    expect(screen.queryByText("직접 선택은 1개 이상")).not.toBeInTheDocument();

    fireEvent.click(saveButton());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ url: "/api/agents", method: "POST" });
    expect(calls[0]?.body).toMatchObject({
      name: "qa-09",
      description: "설명",
      workflow: "개발부서",
      toolsMode: "explicit",
      tools: ["Read", "Bash", "mcp__docs", "mcp__db"],
    });
  });

  it("[FR-010-AC3] 드롭다운 옵션 = 상속·sonnet·opus·haiku·직접 입력, 원본 'claude-opus-5' → 직접 입력에 채움, 'inherit' 원본 → 상속", async () => {
    stubFetch({ get: () => jsonResponse(buildAgentDetail({ model: "claude-opus-5" })) });
    const created = renderAt("/workflows?dialog=agent-new");

    const options = () =>
      Array.from(screen.getByLabelText("모델 (model)").querySelectorAll("option")).map((each) => each.textContent);
    expect(options()).toEqual(["상속 (지정 안 함)", "sonnet", "opus", "haiku", "직접 입력"]);
    expect(screen.getByLabelText("모델 (model)")).toHaveValue("inherit");
    expect(screen.queryByLabelText("직접 입력")).not.toBeInTheDocument();

    // 목록에 없는 전체 모델 ID는 `직접 입력`에 채운다(ADR-13).
    created.navigate("/workflows?dialog=agent-edit&agent=dev-lead");
    await waitFor(() => expect(screen.getByLabelText("모델 (model)")).toHaveValue("custom"));
    expect(screen.getByLabelText("직접 입력")).toHaveValue("claude-opus-5");

    // 원본에 `model: inherit` 줄이 있으면 `상속`으로 보여준다.
    vi.unstubAllGlobals();
    stubFetch({ get: () => jsonResponse(buildAgentDetail({ model: "inherit", hasLiteralInheritModel: true })) });
    const inherited = renderAt("/workflows?dialog=agent-edit&agent=dev-lead");
    await waitFor(() => expect(inherited.state.location.search).toContain("agent-edit"));
    await waitFor(() => expect(screen.getAllByLabelText("모델 (model)").at(-1)).toHaveValue("inherit"));
  });

  it("[FR-010-AC4] 대상 lead 있음 → 팀장 라디오 비활성 + '이미 팀장이 있습니다 (<lead>)'", () => {
    stubFetch({});
    renderAt("/workflows?dialog=agent-new&workflow=개발부서");

    expect(screen.getByLabelText("팀장")).toBeDisabled();
    expect(screen.getByText("이미 팀장이 있습니다 (dev-lead)")).toBeInTheDocument();
    expect(screen.getByLabelText("팀원")).toBeEnabled();

    // 팀장이 없는 워크플로우로 바꾸면 다시 고를 수 있다.
    fireEvent.change(screen.getByLabelText("소속 워크플로우"), { target: { value: "운영팀" } });
    expect(screen.getByLabelText("팀장")).toBeEnabled();
    expect(screen.queryByText("이미 팀장이 있습니다 (dev-lead)")).not.toBeInTheDocument();
  });

  it("[FR-010-AC5][FR-010-AC6] 만들기 성공 → 02에 재시작 안내 줄", async () => {
    stubFetch({ post: () => jsonResponse(buildAgentDetail({ name: "qa-09" }), 201) });
    const router = renderAt("/workflows?dialog=agent-new&workflow=개발부서");

    fillRequired();
    fireEvent.click(screen.getByLabelText("전체 상속"));
    fireEvent.click(saveButton());

    // FR-010-AC5: 저장 후 팝업이 닫히고 02로 돌아간다.
    // 팝업 unmount는 라우터 state 변경 **뒤**의 리렌더에서 일어나므로 DOM을 먼저 기다린다(간헐 실패 방지).
    await waitFor(() => expect(screen.queryByTestId("agent-form-dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/workflows");
    expect(router.state.location.search).toBe("");
    // FR-010-AC6: 토스트가 아니라 02 상단 한 줄이다.
    expect(
      screen.getByText("Claude Code가 새 정의를 바로 인식하지 못하면 재시작이 필요할 수 있습니다"),
    ).toBeInTheDocument();
    // 지속 시간은 ui-spec.md SCR-06이 명시한 8초다(conventions.md §7 MUST).
    expect(AGENT_CREATED_NOTICE_MS).toBe(8000);
  });

  it("[FR-011-AC3] 워크플로우 밖 에이전트 → '(없음)' 옵션, 소속 에이전트 → 없음", async () => {
    stubFetch({ get: () => jsonResponse(buildAgentDetail({ name: "qa-01", workflow: null, role: null })) });
    renderAt("/workflows?dialog=agent-edit&agent=qa-01");

    const workflowSelect = await screen.findByLabelText("소속 워크플로우");
    const optionTexts = Array.from(workflowSelect.querySelectorAll("option")).map((each) => each.textContent);
    expect(optionTexts).toEqual(["(없음)", "개발부서", "운영팀"]);
    expect(workflowSelect).toHaveValue("");
    // 소속이 없으면 역할을 고를 수 없다(ui-spec.md SCR-06 역할 행 `빈` 열).
    expect(screen.getByLabelText("팀장")).toBeDisabled();
    expect(screen.getByLabelText("팀원")).toBeDisabled();

    vi.unstubAllGlobals();
    stubFetch({ get: () => jsonResponse(buildAgentDetail()) });
    const assigned = renderAt("/workflows?dialog=agent-edit&agent=dev-lead");
    await waitFor(() => expect(assigned.state.location.search).toContain("dev-lead"));
    await waitFor(() => {
      const select = screen.getAllByLabelText("소속 워크플로우").at(-1);
      expect(Array.from(select?.querySelectorAll("option") ?? []).map((each) => each.textContent)).toEqual([
        "개발부서",
        "운영팀",
      ]);
    });
  });

  it("[FR-002-AC3][FR-011-E3] GET 409 UNEDITABLE → 팝업 열지 않고 04-6로 스크롤", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const formatErrors: FormatError[] = [{ kind: "agent", file: "broken.md", message: "name 누락" }];
    replaceSnapshot({ formatErrors });
    stubFetch({
      get: () => jsonResponse({ code: "UNEDITABLE", message: "읽지 못한 정의 파일입니다", fields: { file: "broken.md" } }, 409),
    });
    const router = renderAt("/workflows?dialog=agent-edit&agent=broken");

    // 409 뒤 팝업이 사라지는 것은 라우터 state 변경 **뒤**의 리렌더다 — DOM을 먼저 기다린다(간헐 실패 방지).
    await waitFor(() => expect(screen.queryByTestId("agent-form-dialog")).not.toBeInTheDocument());
    expect(router.state.location.search).toBe("");
    expect(screen.getByText("읽지 못한 정의 파일 1개")).toBeInTheDocument();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it("[FR-010-E1] 400 fields → 필드별 사유", async () => {
    stubFetch({
      post: () =>
        jsonResponse(
          {
            code: "VALIDATION",
            message: "입력을 확인하세요",
            fields: { name: "이미 있는 name입니다", description: "필수", model: "허용하지 않는 값" },
          },
          400,
        ),
    });
    renderAt("/workflows?dialog=agent-new&workflow=개발부서");

    fillRequired();
    fireEvent.click(screen.getByLabelText("전체 상속"));
    fireEvent.click(saveButton());

    expect(await screen.findByText("이미 있는 name입니다")).toBeInTheDocument();
    // `필수`는 라벨 옆 필수 표시에도 쓰이므로 해당 필드 안에서 개수로 확인한다(표시 1 + 서버 사유 1).
    const descriptionField = screen.getByLabelText("설명 (description)").parentElement as HTMLElement;
    expect(within(descriptionField).getAllByText("필수")).toHaveLength(2);
    expect(screen.getByText("허용하지 않는 값")).toBeInTheDocument();
    // fields가 있으면 message는 따로 띄우지 않는다(conventions.md §4 MUST).
    expect(screen.queryByText("입력을 확인하세요")).not.toBeInTheDocument();
  });

  it("[FR-010-E2] writable false → 저장 비활성 '쓰기 권한 없음'", async () => {
    replaceSnapshot({ writable: false });
    stubFetch({ get: () => jsonResponse(buildAgentDetail()) });
    renderAt("/workflows?dialog=agent-edit&agent=dev-lead");

    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(screen.getAllByText("쓰기 권한 없음").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "워크플로우에서 제거" })).toBeDisabled();
  });

  it("[FR-010-E3] 500 → message", async () => {
    stubFetch({
      post: () =>
        jsonResponse({ code: "IO_FAILED", message: "정의 파일 쓰기 실패 · 구성 파일은 변경하지 않았습니다" }, 500),
    });
    renderAt("/workflows?dialog=agent-new&workflow=개발부서");

    fillRequired();
    fireEvent.click(screen.getByLabelText("전체 상속"));
    fireEvent.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "정의 파일 쓰기 실패 · 구성 파일은 변경하지 않았습니다",
    );
    expect(screen.getByTestId("agent-form-dialog")).toBeInTheDocument();
  });

  it("[FR-011-E1] 409 FILE_GONE → 문구", async () => {
    stubFetch({
      get: () => jsonResponse(buildAgentDetail()),
      put: () => jsonResponse({ code: "FILE_GONE", message: "저장 중 파일이 사라졌습니다" }, 409),
    });
    renderAt("/workflows?dialog=agent-edit&agent=dev-lead");

    // 파일을 읽는 동안 `저장`은 그려져 있지만 비활성이다 — 읽기 완료 뒤에 눌러야 실제로 저장된다.
    await screen.findByLabelText("이름 (name)");
    fireEvent.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("저장 중 파일이 사라졌습니다");
  });

  it("[FR-011-E2] 400 fields.name → 사유", async () => {
    stubFetch({
      get: () => jsonResponse(buildAgentDetail()),
      put: () => jsonResponse({ code: "VALIDATION", message: "x", fields: { name: "이미 있는 name입니다" } }, 400),
    });
    renderAt("/workflows?dialog=agent-edit&agent=dev-lead");

    const nameInput = await screen.findByLabelText("이름 (name)");
    fireEvent.change(nameInput, { target: { value: "qa-01" } });
    fireEvent.click(saveButton());

    expect(await screen.findByText("이미 있는 name입니다")).toBeInTheDocument();
    expect(nameInput).toHaveValue("qa-01");
  });

  it("[FR-011-E4] 409 AGENT_BUSY → 상단 문구, 폼 값 유지", async () => {
    stubFetch({
      get: () => jsonResponse(buildAgentDetail()),
      put: () =>
        jsonResponse(
          { code: "AGENT_BUSY", message: "작업 중에는 수정할 수 없습니다 · 대기가 되면 다시 시도하세요" },
          409,
        ),
    });
    renderAt("/workflows?dialog=agent-edit&agent=dev-lead");

    const description = await screen.findByLabelText("설명 (description)");
    fireEvent.change(description, { target: { value: "바뀐 설명" } });
    fireEvent.click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("작업 중에는 수정할 수 없습니다 · 대기가 되면 다시 시도하세요");
    // 폼 상단이다: 이름 입력보다 앞에 있다.
    expect(alert.compareDocumentPosition(screen.getByLabelText("이름 (name)"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(description).toHaveValue("바뀐 설명");
    expect(screen.getByTestId("agent-form-dialog")).toBeInTheDocument();
  });

  it("[FR-012-AC6][ADR-27] 실제 live 상태가 idle이 아니면 `워크플로우에서 제거` 비활성", async () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, workflows: [개발부서], agents: [buildAgentDef()] },
      live: {
        ...fixture.live,
        everReceived: false,
        agents: {
          "dev-lead": {
            name: "dev-lead",
            status: "running",
            currentTool: null,
            sessionStartedAt: null,
            childCount: 0,
            cwd: null,
            parentLabel: null,
            lastEventAt: null,
            lastEvent: null,
          },
        },
      },
    });
    // 04-4(수집 중단) 표시 고정과 무관하게 실제 상태로 판정한다(ADR-27).
    stubFetch({ get: () => jsonResponse(buildAgentDetail({ status: "idle" })) });
    renderAt("/workflows?dialog=agent-edit&agent=dev-lead");

    // 파일을 읽는 동안에도 버튼은 (이유 줄 없이) 비활성이므로, 읽기 완료 뒤에 상태와 이유 줄을 본다.
    await screen.findByLabelText("이름 (name)");
    expect(screen.getByRole("button", { name: "워크플로우에서 제거" })).toBeDisabled();
    expect(screen.getByText("작업 중에는 제거할 수 없습니다")).toBeInTheDocument();
  });

  it("[SCR-06] 수정 모드는 파일을 읽는 동안 스켈레톤, 404 → 사유 + 닫기", async () => {
    stubFetch({ get: () => jsonResponse({ code: "AGENT_NOT_FOUND", message: "없음" }, 404) });
    const router = renderAt("/workflows?dialog=agent-edit&agent=ghost");

    expect(screen.getByTestId("agent-form-skeleton")).toBeInTheDocument();
    expect(await screen.findByText("정의 파일이 없습니다 · 목록을 확인하세요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    // `?dialog`만 지우고 03 선택 상태인 `?agent=`는 남긴다(useDialog.close).
    expect(router.state.location.search).not.toContain("dialog");
    expect(screen.queryByTestId("agent-form-dialog")).not.toBeInTheDocument();
  });

  it("[SCR-06] 수정 모드 로딩 중 취소·저장이 비활성으로 보인다", async () => {
    stubFetch({ get: () => jsonResponse(buildAgentDetail()) });
    renderAt("/workflows?dialog=agent-edit&agent=dev-lead");

    // 스켈레톤은 필드 자리에만 있고 각주·버튼은 사라지지 않는다(ui-spec.md SCR-06 `로딩` 열).
    expect(screen.getByTestId("agent-form-skeleton")).toBeInTheDocument();
    expect(
      screen.getByText("이름 변경 시 파일명도 변경 · 폼에 없는 필드(permissionMode 등)는 기존 값 보존"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "워크플로우에서 제거" })).toBeDisabled();
    // ADR-35: 이 비활성 지점에는 이유 줄을 붙이지 않는다.
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
    expect(screen.queryByText("도구 방식을 고르세요")).not.toBeInTheDocument();
    expect(screen.queryByText("작업 중에는 제거할 수 없습니다")).not.toBeInTheDocument();

    // 파일을 다 읽으면 폼이 채워지고 버튼은 그대로 남는다.
    await screen.findByLabelText("이름 (name)");
    expect(screen.queryByTestId("agent-form-skeleton")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소" })).toBeEnabled();
  });

  it("[SCR-06] 워크플로우 0개 → '먼저 워크플로우를 추가하세요' 안내", () => {
    stubFetch({});
    replaceSnapshot({ workflows: [] });
    renderAt("/workflows?dialog=agent-new");

    expect(screen.getByText("먼저 워크플로우를 추가하세요")).toBeInTheDocument();
    // `<span>`은 labelable 요소가 아니므로 라벨을 연결하지 않는다(T-019 리뷰 Minor 2).
    const label = screen.getByText("소속 워크플로우");
    expect(label.tagName).toBe("LABEL");
    expect(label).not.toHaveAttribute("for");
    expect(screen.queryByLabelText("소속 워크플로우")).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("[FR-017-AC5] 06 폼·06-6 어디에도 워크플로우 이름 편집 입력·버튼 없음", async () => {
    stubFetch({ get: () => jsonResponse(buildAgentDetail()) });
    renderAt("/workflows?dialog=agent-edit&agent=dev-lead");
    await screen.findByLabelText("이름 (name)");

    // 06의 소속 워크플로우는 고르는 드롭다운이고, 워크플로우 이름을 고쳐 저장하는 입력이 아니다.
    expect(screen.getByLabelText("소속 워크플로우").tagName).toBe("SELECT");
    const labels = Array.from(document.querySelectorAll("label")).map((each) => each.textContent ?? "");
    expect(labels.some((text) => /워크플로우 이름|이름 변경|이름 수정/.test(text))).toBe(false);
    for (const button of screen.getAllByRole("button")) {
      expect(button.textContent).not.toMatch(/워크플로우 이름|이름 변경|이름 수정|이름 바꾸기/);
    }

    // 06-6도 확인용 입력 하나뿐이다.
    render(
      <MemoryRouter>
        <RemoveAgentDialog agentName="dev-lead" onClose={vi.fn()} />
      </MemoryRouter>,
    );
    const confirmDialog = screen.getByTestId("confirm-by-name-dialog");
    expect(confirmDialog.querySelectorAll("input")).toHaveLength(1);
    expect(screen.getByLabelText("확인을 위해 이름 입력")).toHaveValue("");
    for (const button of Array.from(confirmDialog.querySelectorAll("button"))) {
      expect(button.textContent).not.toMatch(/워크플로우 이름|이름 변경|이름 수정|이름 바꾸기/);
    }
  });

  it("[ADR-33] 06 폼 placeholder·라벨에 대괄호 없음", () => {
    stubFetch({});
    renderAt("/workflows?dialog=agent-new&workflow=개발부서");

    expect(screen.getByLabelText("설명 (description)")).toHaveAttribute(
      "placeholder",
      "언제 이 에이전트에게 일을 맡기는지",
    );
    expect(screen.getByLabelText("기타")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    const texts = [
      ...Array.from(dialog.querySelectorAll("label")).map((each) => each.textContent ?? ""),
      ...Array.from(dialog.querySelectorAll("input,textarea")).map(
        (each) => each.getAttribute("placeholder") ?? "",
      ),
      ...Array.from(dialog.querySelectorAll("p,span,option")).map((each) => each.textContent ?? ""),
    ];
    expect(texts.filter((text) => /\[[^\]]{1,40}\]|<[^>]{1,40}>/.test(text))).toEqual([]);
  });

  it("[ADR-35] 지정 지점만 이유 줄, 나머지 비활성은 이유 줄 없음", () => {
    stubFetch({});
    renderAt("/workflows?dialog=agent-new&workflow=개발부서");

    // 지정 지점: 도구 방식 미선택.
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("도구 방식을 고르세요")).toBeInTheDocument();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();

    // 필수값 미입력으로 비활성인 동안에는 이유 줄이 없다(원인이 같은 폼의 입력 상태다).
    fireEvent.click(screen.getByLabelText("전체 상속"));
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText("도구 방식을 고르세요")).not.toBeInTheDocument();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
    expect(screen.queryByText("작업 중에는 제거할 수 없습니다")).not.toBeInTheDocument();

    // 06-6의 이름 불일치 비활성에도 이유 줄이 없다(라벨이 조건을 말한다).
    render(
      <MemoryRouter>
        <RemoveAgentDialog agentName="dev-lead" onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "제거 (이름 일치 시 활성)" })).toBeDisabled();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
    expect(screen.queryByText("작업 중에는 제거할 수 없습니다")).not.toBeInTheDocument();
  });

  it("[ADR-40] 06 폼은 size lg, 06-5·06-6은 md", () => {
    stubFetch({});
    renderAt("/workflows?dialog=agent-new&workflow=개발부서");
    expect(screen.getByRole("dialog").className).toContain("max-w-3xl");

    const conflict = render(
      <SaveConflictDialog
        agentName="dev-lead"
        modifiedAt="2026-09-22T10:20:30+09:00"
        reloading={false}
        overwriting={false}
        onReload={vi.fn()}
        onOverwrite={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("dialog").at(-1)?.className).toContain("max-w-md");
    conflict.unmount();

    render(
      <MemoryRouter>
        <RemoveAgentDialog agentName="dev-lead" onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("dialog").at(-1)?.className).toContain("max-w-md");
  });

  it("[FR-011-AC1][FR-011-AC2] 각주로 파일명 변경·보존 규칙을 알린다", async () => {
    stubFetch({ get: () => jsonResponse(buildAgentDetail() as AgentDetail) });
    renderAt("/workflows?dialog=agent-edit&agent=dev-lead");

    // 각주는 읽는 중에도 그려지므로(T-019 리뷰 Minor 1) 경로 단언은 읽기 완료 뒤에 한다.
    await screen.findByLabelText("이름 (name)");
    expect(
      screen.getByText("이름 변경 시 파일명도 변경 · 폼에 없는 필드(permissionMode 등)는 기존 값 보존"),
    ).toBeInTheDocument();
    expect(screen.getByText("JayStudio/.claude/agents/dev-lead.md")).toBeInTheDocument();
  });
});
