import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowAddDialog } from "./WorkflowAddDialog";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import type { Workflow } from "../../api/types";

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

/** `/api/workflows` POST에 대한 응답만 바꿔 가며 쓰는 fetch 대역(테스트 전용). */
function stubFetch(postResponse: () => Response | Promise<Response>) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/browser-token")) {
        return jsonResponse({ token: "a".repeat(64) });
      }
      if (url.includes("/api/workflows")) {
        calls.push({ url, body: init?.body === undefined ? null : JSON.parse(String(init.body)) });
        return postResponse();
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  return calls;
}

function renderDialog(onClose = vi.fn(), initialPath = "/workflows") {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <WorkflowAddDialog onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

function typeName(value: string) {
  fireEvent.change(screen.getByLabelText("이름"), { target: { value } });
}

describe("WorkflowAddDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    snapshotStore.replace(buildSnapshotFixture());
  });

  afterEach(() => {
    snapshotStore.reset();
    vi.unstubAllGlobals();
  });

  it("[FR-008-AC3] 제목·부제·안내 박스·도움말 렌더, 부제의 경로만 고정폭", () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "워크플로우 추가" })).toBeInTheDocument();
    // 부제는 앞 글자 + 고정폭 경로 + 뒤 글자라 문단 전체 글자로 확인한다(ui-spec SCR-05-L, 와이어프레임 괄호는 정적 텍스트).
    const subtitle = screen.getByText(".aojistudio/teams/이름.json").parentElement;
    expect(subtitle).toHaveTextContent("구성 파일 .aojistudio/teams/이름.json(팀장·팀원 목록)이 만들어집니다.");
    expect(subtitle?.textContent).not.toMatch(/[[\]]/);
    expect(screen.getByText(".aojistudio/teams/이름.json")).toHaveClass("font-mono");
    expect(
      screen.getByText("만든 뒤 팀장 1명을 만들거나 가져오세요. 팀장이 없으면 층에 팀장 없음이 표시됩니다"),
    ).toBeInTheDocument();
    expect(screen.getByText("1~40자 · 한글·영문·숫자·공백·하이픈·언더스코어 · 같은 이름 불가")).toBeInTheDocument();
  });

  it("[FR-008-AC3] 설명 입력: 라벨 `설명` + 라벨 밖 `(선택)`, placeholder `한 줄 설명`", () => {
    renderDialog();

    const description = screen.getByLabelText("설명");
    expect(description).toHaveAttribute("placeholder", "한 줄 설명");
    expect(screen.getByText("(선택)")).toHaveClass("text-text-muted");
    expect(screen.queryByLabelText("설명 (선택)")).not.toBeInTheDocument();
  });

  it("[NFR-12] data-wf 영역 05L-1(창, md 560)·05L-2(이름 필드)·05L-3(안내 박스)·05L-4(아래 줄)", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveAttribute("data-wf", "05L-1");
    expect(screen.getByRole("dialog")).toHaveClass("max-w-dialog-md");
    expect(document.querySelector('[data-wf="05L-2"]')).toContainElement(screen.getByLabelText("이름"));
    expect(document.querySelector('[data-wf="05L-3"]')).toHaveTextContent("팀장 1명을 만들거나 가져오세요");
    const footer = document.querySelector('[data-wf="05L-4"]');
    expect(footer).toContainElement(screen.getByRole("button", { name: "취소" }));
    expect(footer).toContainElement(screen.getByRole("button", { name: "만들기" }));
  });

  it("[SCR-05-L] 이름이 비면 `만들기` 비활성, 입력하면 활성", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "만들기" })).toBeDisabled();
    typeName("개발부서");
    expect(screen.getByRole("button", { name: "만들기" })).toBeEnabled();
  });

  it("[FR-001-E2] writable=false → `만들기` 비활성 + 쓰기 권한 없음", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, writable: false } });
    renderDialog();

    typeName("개발부서");
    expect(screen.getByRole("button", { name: "만들기" })).toBeDisabled();
    expect(
      screen.getByText("쓰기 권한 없음 · 마운트한 폴더를 쓰기 가능하게 실행해야 바꿀 수 있습니다"),
    ).toBeInTheDocument();
  });

  it("[FR-008-AC4] 만들기 성공 → 요청 본문은 trim한 이름, 팝업 닫힘", async () => {
    const calls = stubFetch(() => jsonResponse(createdWorkflow, 201));
    const onClose = renderDialog();

    typeName("  개발부서  ");
    fireEvent.change(screen.getByLabelText("설명"), { target: { value: "백엔드 팀" } });
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ name: "개발부서", description: "백엔드 팀" });
  });

  it("[SCR-05-L] 요청 중에는 `만드는 중…`", async () => {
    let resolvePost: (res: Response) => void = () => {};
    stubFetch(() => new Promise<Response>((resolve) => (resolvePost = resolve)));
    renderDialog();

    typeName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    expect(await screen.findByRole("button", { name: "만드는 중…" })).toBeDisabled();
    resolvePost(jsonResponse(createdWorkflow, 201));
  });

  it("[FR-008-E1] 이름 중복 400 fields.name → ui-rules E1 문구를 이름 입력 아래에, aria-invalid, 도움말 유지, 팝업 유지", async () => {
    stubFetch(() =>
      jsonResponse(
        { code: "VALIDATION", message: "이미 있는 이름입니다", fields: { name: "이미 있는 이름입니다" } },
        400,
      ),
    );
    const onClose = renderDialog();

    typeName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    const message = "같은 이름의 워크플로우가 이미 있습니다. 다른 이름을 입력하세요. (대소문자는 구분하지 않습니다)";
    const error = await screen.findByText(message);
    expect(error).toHaveAttribute("role", "alert");
    expect(screen.queryByText("이미 있는 이름입니다")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("이름")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("이름")).toHaveAccessibleDescription(
      `${message} 1~40자 · 한글·영문·숫자·공백·하이픈·언더스코어 · 같은 이름 불가`,
    );
  });

  it("[FR-008-E2] 사전 검증 = ui-rules E2 글자(요청 없음), 서버 400(규칙 위반)도 같은 E2 글자", async () => {
    const calls = stubFetch(() =>
      jsonResponse(
        {
          code: "VALIDATION",
          message: "1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만",
          fields: { name: "1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만" },
        },
        400,
      ),
    );
    renderDialog();
    const message = "이름은 1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만 쓸 수 있습니다.";

    // 허용하지 않는 문자 → 요청을 보내지 않고 사전 검증 문구를 보여준다.
    typeName("개발/부서");
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    // 입력을 고치면 사유가 사라지고, 사전 검증을 통과한 뒤 서버가 규칙 위반을 알려도 (프론트 규칙을 어기지 않았으니) E1 형태다.
    typeName("개발부서");
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));
    expect(
      await screen.findByText("같은 이름의 워크플로우가 이미 있습니다. 다른 이름을 입력하세요. (대소문자는 구분하지 않습니다)"),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    // 서버 글자 자체는 화면에 보이지 않는다(D-142).
    expect(screen.queryByText("1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만")).not.toBeInTheDocument();
  });

  it("[FR-008-E3] 500 IO_FAILED → 아래 줄 위 Alert, 서버 message가 아니라 ui-rules E3 글자(<사유> 고정), 첫 문장 굵게", async () => {
    stubFetch(() => jsonResponse({ code: "IO_FAILED", message: "구성 파일 쓰기 실패 · 파일을 만들지 않았습니다" }, 500));
    const onClose = renderDialog();

    typeName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    const alert = await screen.findByRole("alert");
    const lead = alert.querySelector('[data-part="lead"]');
    const rest = alert.querySelector('[data-part="rest"]');
    expect(lead).toHaveTextContent("구성 파일을 만들지 못했습니다.");
    expect(lead).toHaveClass("font-semibold");
    expect(`${lead?.textContent}${rest?.textContent}`).toBe(
      "구성 파일을 만들지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 폴더 쓰기 권한을 확인한 뒤 다시 만드세요.",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "워크플로우 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "만들기" })).toBeEnabled();
  });

  it("[SCR-05-L] 네트워크 실패 → 공통 문구를 팝업 하단에 표시", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
        throw new Error("network down");
      }),
    );
    renderDialog();

    typeName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("서버에 연결할 수 없습니다 · 다시 시도하세요");
  });

  it("[conventions §4] 형식이 깨진 응답 → 알 수 없는 오류 공통 문구", async () => {
    // JSON이 아닌 본문은 `SyntaxError`를 던진다. 내부 오류 표현이 화면에 오르면 안 된다.
    stubFetch(() => new Response("not-json", { status: 201, headers: { "Content-Type": "application/json" } }));
    renderDialog();

    typeName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("서버에 연결할 수 없습니다 · 다시 시도하세요");
    expect(alert.textContent).not.toMatch(/SyntaxError|JSON/);
  });

  it("[SCR-05-L] 취소 → 팝업 닫힘", () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
