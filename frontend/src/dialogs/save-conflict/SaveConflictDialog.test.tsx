import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../app/router";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import { buildAgentDef, buildAgentDetail } from "../../test/fixtures/agent";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface RequestCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

/** GET은 순서대로, PUT은 호출마다 응답을 바꾼다(테스트 전용 대역). */
function stubFetch(getResponses: (() => Response)[], putResponses: (() => Response)[]) {
  const calls: RequestCall[] = [];
  let getIndex = 0;
  let putIndex = 0;
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
      if (method === "GET") {
        const handler = getResponses[Math.min(getIndex, getResponses.length - 1)];
        getIndex += 1;
        if (handler === undefined) throw new Error("no GET response");
        return handler();
      }
      const handler = putResponses[Math.min(putIndex, putResponses.length - 1)];
      putIndex += 1;
      if (handler === undefined) throw new Error("no PUT response");
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
  members: [],
  brokenRefs: [],
  rawMemberCount: 1,
};

function replaceSnapshot() {
  const fixture = buildSnapshotFixture();
  snapshotStore.replace({
    ...fixture,
    registry: { ...fixture.registry, workflows: [개발부서], agents: [buildAgentDef()] },
  });
}

const conflictResponse = () =>
  jsonResponse(
    {
      code: "REVISION_CONFLICT",
      message: "파일이 바뀌었습니다",
      details: { currentRevision: "1758343999999-2000", modifiedAt: "2026-09-22T10:20:30+09:00" },
    },
    409,
  );

describe("SaveConflictDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replaceSnapshot();
  });

  afterEach(() => {
    snapshotStore.reset();
    vi.unstubAllGlobals();
  });

  it("[FR-011-AC4] 409 REVISION_CONFLICT → 06-5, 다시 불러오기 → GET 재호출 폼 재채움, 덮어쓰기 → force true", async () => {
    const calls = stubFetch(
      [
        () => jsonResponse(buildAgentDetail({ description: "처음 설명" })),
        () => jsonResponse(buildAgentDetail({ description: "밖에서 바뀐 설명", revision: "1758343999999-2000" })),
      ],
      [conflictResponse, conflictResponse, () => jsonResponse(buildAgentDetail())],
    );
    const router = createMemoryRouter(routes, { initialEntries: ["/workflows?dialog=agent-edit&agent=dev-lead"] });
    render(<RouterProvider router={router} />);

    const description = await screen.findByLabelText("설명 (description)");
    fireEvent.change(description, { target: { value: "내가 고친 설명" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    // 06-5가 폼 위에 뜬다. 본문은 `details.modifiedAt`의 hh:mm:ss다.
    expect(await screen.findByTestId("save-conflict-dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "파일이 다른 곳에서 수정되었습니다" })).toBeInTheDocument();
    expect(
      screen.getByText("dev-lead.md이 이 창을 연 뒤 10:20:30에 변경되었습니다. 저장하면 그 변경이 사라집니다."),
    ).toBeInTheDocument();

    // 다시 불러오기 → GET 재호출 → 폼이 파일 값으로 다시 채워지고 06-5는 닫힌다.
    fireEvent.click(screen.getByRole("button", { name: "최신 파일 다시 불러오기" }));
    await waitFor(() => expect(screen.queryByTestId("save-conflict-dialog")).not.toBeInTheDocument());
    expect(calls.filter((call) => call.method === "GET")).toHaveLength(2);
    expect(screen.getByLabelText("설명 (description)")).toHaveValue("밖에서 바뀐 설명");

    // 다시 저장 → 또 충돌 → 덮어쓰기는 force: true와 다시 읽은 revision으로 보낸다.
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByTestId("save-conflict-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "덮어쓰기" }));

    await waitFor(() => expect(router.state.location.search).toBe(""));
    const puts = calls.filter((call) => call.method === "PUT");
    expect(puts).toHaveLength(3);
    expect(puts[0]?.body).toMatchObject({ expectedRevision: "1758343512345-1834" });
    expect(puts[0]?.body?.force).toBeUndefined();
    expect(puts[2]?.body).toMatchObject({ force: true, expectedRevision: "1758343999999-2000" });
  });

  it("[SCR-06-5] 진행 중에는 두 버튼이 비활성이고 이유 줄이 없다", async () => {
    let resolvePut: (res: Response) => void = () => {};
    const calls = stubFetch(
      [() => jsonResponse(buildAgentDetail())],
      [conflictResponse, () => new Promise<Response>((resolve) => (resolvePut = resolve)) as unknown as Response],
    );
    const router = createMemoryRouter(routes, { initialEntries: ["/workflows?dialog=agent-edit&agent=dev-lead"] });
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "저장" }));
    expect(await screen.findByTestId("save-conflict-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "덮어쓰기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "덮어쓰기" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "최신 파일 다시 불러오기" })).toBeDisabled();
    // 진행 중 비활성에는 이유 줄을 붙이지 않는다(ADR-35).
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
    expect(screen.queryByText("도구 방식을 고르세요")).not.toBeInTheDocument();

    resolvePut(jsonResponse(buildAgentDetail()));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(2);
  });

  it("[SCR-06-5] 취소(ESC)는 06-5만 닫고 06 폼은 열어 둔다", async () => {
    stubFetch([() => jsonResponse(buildAgentDetail())], [conflictResponse]);
    const router = createMemoryRouter(routes, { initialEntries: ["/workflows?dialog=agent-edit&agent=dev-lead"] });
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "저장" }));
    expect(await screen.findByTestId("save-conflict-dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("save-conflict-dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("agent-form-dialog")).toBeInTheDocument();
    expect(router.state.location.search).toContain("agent-edit");
  });
});
