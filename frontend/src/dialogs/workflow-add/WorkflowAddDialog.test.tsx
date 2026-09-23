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
  filePath: ".jaystudio/teams/개발부서.json",
  lead: null,
  members: [],
  brokenRefs: [],
  rawMemberCount: 0,
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

  it("[FR-008-AC3] 안내 문구 렌더", () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "워크플로우 추가" })).toBeInTheDocument();
    expect(
      screen.getByText("구성 파일 .jaystudio/teams/[이름].json(팀장·팀원 목록)이 만들어집니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "만든 뒤 팀장 1명을 만들거나 가져오세요. 팀장이 없으면 층에 팀장 없음이 표시됩니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("이름 중복 불가 · 개수 제한 없음")).toBeInTheDocument();
    expect(screen.getByLabelText("설명 (선택)")).toBeInTheDocument();
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
    expect(screen.getByText("쓰기 권한 없음")).toBeInTheDocument();
  });

  it("[FR-008-AC4] 만들기 성공 → 요청 본문은 trim한 이름, 팝업 닫힘", async () => {
    const calls = stubFetch(() => jsonResponse(createdWorkflow, 201));
    const onClose = renderDialog();

    typeName("  개발부서  ");
    fireEvent.change(screen.getByLabelText("설명 (선택)"), { target: { value: "백엔드 팀" } });
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

  it("[FR-008-E1] 400 fields.name → 필드 아래 사유", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          code: "VALIDATION",
          message: "요청을 처리할 수 없습니다",
          fields: { name: "이미 있는 이름입니다" },
        },
        400,
      ),
    );
    const onClose = renderDialog();

    typeName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    expect(await screen.findByText("이미 있는 이름입니다")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // 필드 사유는 이름 입력 아래에 붙는다(conventions.md §4).
    expect(screen.getByLabelText("이름").parentElement).toHaveTextContent("이미 있는 이름입니다");
  });

  it("[FR-008-E2] 사전 검증 문구, 서버 400 표시", async () => {
    const calls = stubFetch(() =>
      jsonResponse(
        {
          code: "VALIDATION",
          message: "요청을 처리할 수 없습니다",
          fields: { name: "1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만" },
        },
        400,
      ),
    );
    renderDialog();

    // 허용하지 않는 문자 → 요청을 보내지 않고 사전 검증 문구를 보여준다.
    typeName("개발/부서");
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));
    expect(
      await screen.findByText("1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만"),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    // 사전 검증을 통과해도 최종 판정은 서버가 하고, 400 사유를 같은 자리에 보여준다.
    typeName("개발부서");
    expect(screen.queryByText("1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));
    expect(
      await screen.findByText("1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만"),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it("[FR-008-E3] 500 IO_FAILED → 팝업 하단 message", async () => {
    stubFetch(() =>
      jsonResponse(
        { code: "IO_FAILED", message: "구성 파일 쓰기 실패 · 파일을 만들지 않았습니다" },
        500,
      ),
    );
    const onClose = renderDialog();

    typeName("개발부서");
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "구성 파일 쓰기 실패 · 파일을 만들지 않았습니다",
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

  it("[SCR-05-L] 취소 → 팝업 닫힘", () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
