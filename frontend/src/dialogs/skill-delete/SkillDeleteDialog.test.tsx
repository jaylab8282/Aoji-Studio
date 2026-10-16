import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillDeleteDialog } from "./SkillDeleteDialog";
import { skillsViewStore } from "../../state/skillsViewStore";
import { buildSkillRow, buildSkillsReport } from "../../test/fixtures/skills";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface Call {
  url: string;
  method: string;
}

/** `DELETE /api/skills/{skill}`·(스토어가 비었을 때만) `GET /api/skills` 응답을 바꿔 쓰는 fetch 대역(테스트 전용). */
function stubFetch(deleteResponse: () => Response | Promise<Response> = () => jsonResponse({ trashPath: ".aojistudio/trash/x/" })) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
      calls.push({ url, method });
      if (method === "DELETE") return deleteResponse();
      return jsonResponse(
        buildSkillsReport([buildSkillRow("design-review", { definedAgents: ["proj-lead", "proj-dev"] })]),
      );
    }),
  );
  return calls;
}

function seed(definedAgents: string[]) {
  skillsViewStore.setReport(
    buildSkillsReport([buildSkillRow("design-review", { definedAgents }), buildSkillRow("other")]),
  );
}

function renderDialog(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <SkillDeleteDialog skillName="design-review" onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

function typeName(value: string) {
  fireEvent.change(screen.getByLabelText("확인을 위해 스킬 이름 입력"), { target: { value } });
}

async function flush() {
  await act(async () => {
    for (let round = 0; round < 20; round += 1) await Promise.resolve();
  });
}

describe("SkillDeleteDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    skillsViewStore.reset();
  });

  it("[FR-022-AC1] 제목·휴지통 안내·이름 입력(placeholder = 이름)·이유 줄, 이름이 같아질 때까지 `삭제` 비활성, wf 08-3-1·3·4", () => {
    stubFetch();
    seed([]);
    renderDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-wf", "08-3-1");
    expect(within(dialog).getByRole("heading", { name: "design-review 스킬을 삭제할까요?" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem")[0]).toHaveTextContent(
      "스킬 폴더가 .aojistudio/trash/로 이동합니다 (폴더를 옮겨 복구할 수 있습니다)",
    );
    const input = within(dialog).getByLabelText("확인을 위해 스킬 이름 입력");
    expect(input).toHaveAttribute("placeholder", "design-review");
    expect(dialog.querySelector('[data-wf="08-3-3"]')).not.toBeNull();
    expect(dialog.querySelector('[data-wf="08-3-4"]')).not.toBeNull();

    const confirm = within(dialog).getByRole("button", { name: "삭제" });
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText("design-review을(를) 똑같이 입력하면 삭제 버튼이 켜집니다")).toBeInTheDocument();
    typeName("design-revie");
    expect(confirm).toBeDisabled();
    typeName("design-review");
    expect(confirm).toBeEnabled();
    expect(within(dialog).queryByText("design-review을(를) 똑같이 입력하면 삭제 버튼이 켜집니다")).toBeNull();
  });

  it("[FR-022-AC2] 미리 넣어 쓰는 에이전트 N명 상자(08-3-2): name 오름차순 목록 + `skills: 항목은 바뀌지 않습니다`", () => {
    stubFetch();
    seed(["proj-lead", "proj-dev"]);
    renderDialog();

    const box = screen.getByRole("dialog").querySelector('[data-wf="08-3-2"]') as HTMLElement;
    expect(box).toHaveTextContent("이 스킬을 미리 넣어 쓰는 에이전트 2명");
    expect(within(box).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["proj-dev", "proj-lead"]);
    expect(box).toHaveTextContent("에이전트 정의 파일의 skills: 항목은 바뀌지 않습니다");
  });

  it("[FR-022-AC2] 에이전트가 0명이면 상자가 없다", () => {
    stubFetch();
    seed([]);
    renderDialog();

    expect(screen.getByRole("dialog").querySelector('[data-wf="08-3-2"]')).toBeNull();
    expect(screen.queryByText(/미리 넣어 쓰는 에이전트/)).toBeNull();
  });

  it("[FR-022-AC2] 08을 거치지 않아 스토어에 응답이 없으면 같은 조회를 한 번 하고 그 definedAgents를 보인다", async () => {
    const calls = stubFetch();
    renderDialog();
    expect(screen.queryByRole("dialog")).toBeNull();
    await flush();

    const box = screen.getByRole("dialog").querySelector('[data-wf="08-3-2"]') as HTMLElement;
    expect(within(box).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["proj-dev", "proj-lead"]);
    expect(calls.filter((call) => call.method === "GET")).toHaveLength(1);
  });

  it("[FR-022-AC3][FR-022-AC5] 이름 일치 후 `삭제` → DELETE /api/skills/<이름> 한 번, 창이 닫히고 08 목록에서 행이 바로 빠진다", async () => {
    const calls = stubFetch();
    seed([]);
    const onClose = renderDialog();

    typeName("design-review");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(screen.getByRole("button", { name: "삭제 중…" })).toBeDisabled();
    await flush();

    expect(calls.filter((call) => call.method === "DELETE")).toEqual([{ url: "/api/skills/design-review", method: "DELETE" }]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(skillsViewStore.getSnapshot().report?.skills.map((skill) => skill.name)).toEqual(["other"]);
  });

  it("[FR-022-E1] 500 IO_FAILED → 서버 message `Alert`, 창은 열려 있고 폴더는 그대로(다시 삭제할 수 있다)", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          code: "IO_FAILED",
          message: "스킬 폴더를 휴지통으로 옮기지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 폴더는 그대로입니다.",
        },
        500,
      ),
    );
    seed([]);
    const onClose = renderDialog();

    typeName("design-review");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "스킬 폴더를 휴지통으로 옮기지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 폴더는 그대로입니다.",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "삭제" })).toBeEnabled();
    expect(skillsViewStore.getSnapshot().report?.skills).toHaveLength(2);
  });

  it("[FR-022-E2] 404 SKILL_NOT_FOUND → `이미 없는 스킬입니다` 안내, 3000ms 뒤 닫히고 08 갱신 요청(그 전에는 `삭제` 비활성)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    stubFetch(() => jsonResponse({ code: "SKILL_NOT_FOUND", message: "이미 없는 스킬입니다" }, 404));
    seed([]);
    const onClose = renderDialog();
    const tickBefore = skillsViewStore.getSnapshot().refreshTick;

    typeName("design-review");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("이미 없는 스킬입니다");
    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(skillsViewStore.getSnapshot().refreshTick).toBe(tickBefore + 1);
  });

  it("[FR-022-AC1] `취소`는 요청 없이 닫는다", () => {
    const calls = stubFetch();
    seed([]);
    const onClose = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });
});
