import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillForm } from "./SkillForm";
import { snapshotStore } from "../../state/snapshotStore";
import { skillsViewStore } from "../../state/skillsViewStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import { buildSkillDetail } from "../../test/fixtures/skills";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface RequestCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

type Handler = () => Response | Promise<Response>;

/** api-spec.yaml 응답만 바꿔 가며 쓰는 fetch 대역(테스트 전용). */
function stubFetch(handlers: { get?: Handler; post?: Handler; put?: Handler }) {
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

function seedRegistry(writable = true) {
  const base = buildSnapshotFixture();
  snapshotStore.replace({ ...base, registry: { ...base.registry, writable } });
}

function renderForm(props: { mode: "create" | "edit"; skillName?: string }, onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <SkillForm mode={props.mode} skillName={props.skillName ?? null} onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

const nameInput = () => screen.getByLabelText("이름");
const descriptionInput = () => screen.getByLabelText("설명 (description)");
const bodyInput = () => screen.getByLabelText("본문 (SKILL.md 지침)");
const saveButton = () => screen.getByRole("button", { name: /^저장/ });

function fillCreate(name = "design-token-audit", description = "토큰 점검") {
  fireEvent.change(nameInput(), { target: { value: name } });
  fireEvent.change(descriptionInput(), { target: { value: description } });
}

async function flush() {
  await act(async () => {
    for (let round = 0; round < 20; round += 1) await Promise.resolve();
  });
}

describe("SkillForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    seedRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    snapshotStore.reset();
    skillsViewStore.reset();
  });

  it("[FR-020-AC1] 만들기: 이름 안내 두 줄(접두어 고정폭)·빈 값이면 저장 비활성·경로는 이름을 쓰기 전까지 숨김·규칙 밖 이름은 사전 검증 문구", () => {
    stubFetch({});
    renderForm({ mode: "create" });

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "스킬 만들기" })).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-wf", "08-1-1");
    expect(screen.getByText("소문자·숫자·하이픈, 1~64자 · 같은 이름 불가 · 만든 뒤에는 바꿀 수 없음")).toBeInTheDocument();
    // 고정폭 조각이 섞인 한 줄: 자기 글자만 보는 기본 매처 대신 전체 글자로 찾는다.
    const prefixLine = screen.getByText(
      (_, element) =>
        element?.tagName === "SPAN" &&
        element.children.length > 0 &&
        element.textContent === "부서 접두어를 붙이세요 — 예: design-, web-, invest-, video-",
    );
    expect(Array.from(prefixLine.querySelectorAll("span.font-mono")).map((node) => node.textContent)).toEqual([
      "design-",
      "web-",
      "invest-",
      "video-",
    ]);
    expect(screen.queryByText(/^AojiStudio\/\.claude\/skills\//)).toBeNull();
    expect(saveButton()).toBeDisabled();

    fireEvent.change(nameInput(), { target: { value: "Bad_Name" } });
    expect(screen.getByRole("alert")).toHaveTextContent("소문자·숫자·하이픈만, 1~64자");
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(descriptionInput(), { target: { value: "설명" } });
    expect(saveButton()).toBeDisabled();

    fireEvent.change(nameInput(), { target: { value: "design-token-audit" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("AojiStudio/.claude/skills/design-token-audit/SKILL.md")).toBeInTheDocument();
    expect(dialog.querySelector('[data-wf="08-1-6"]')).toHaveTextContent(
      "저장하면 .claude/skills/design-token-audit/SKILL.md를 만듭니다",
    );
    expect(saveButton()).toBeEnabled();
    // 접두어는 검사하지 않는다(안내 문구뿐).
    fireEvent.change(nameInput(), { target: { value: "noprefix" } });
    expect(saveButton()).toBeEnabled();
  });

  it("[FR-020-AC1] 서버 400 `fields.name`(이미 있는 이름입니다)·`fields.description`(필수)이 해당 필드 아래에 서버 문구 그대로 뜬다", async () => {
    stubFetch({
      post: () =>
        jsonResponse(
          { code: "VALIDATION", message: "입력을 확인하세요", fields: { name: "이미 있는 이름입니다", description: "필수" } },
          400,
        ),
    });
    renderForm({ mode: "create" });
    fillCreate("design-review", "x");
    fireEvent.click(saveButton());
    await flush();

    expect(screen.getByText("이미 있는 이름입니다")).toHaveAttribute("role", "alert");
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("필수", { selector: '[role="alert"]' })).toBeInTheDocument();
    expect(descriptionInput()).toHaveAttribute("aria-invalid", "true");
    // 입력은 그대로 두고 저장은 다시 누를 수 있다.
    expect(descriptionInput()).toHaveValue("x");
    expect(saveButton()).toBeEnabled();
  });

  it("[FR-020-E1] 필드 오류는 필드별 사유로, 이름 오류가 있어도 설명 오류와 따로 보인다(Alert 아님)", async () => {
    stubFetch({
      post: () => jsonResponse({ code: "VALIDATION", message: "x", fields: { name: "소문자·숫자·하이픈만, 1~64자" } }, 400),
    });
    renderForm({ mode: "create" });
    fillCreate("ok-name", "설명");
    fireEvent.click(saveButton());
    await flush();

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("소문자·숫자·하이픈만, 1~64자");
    expect(descriptionInput()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("[FR-020-AC2] 만들기 저장: POST /api/skills {name, description, userOnly, body} → 창 닫힘 + 08 재조회·안내 신호", async () => {
    const calls = stubFetch({ post: () => jsonResponse(buildSkillDetail("design-token-audit"), 201) });
    const onClose = renderForm({ mode: "create" });
    fillCreate("design-token-audit", "토큰 점검");
    fireEvent.click(screen.getByLabelText("사용자만 호출"));
    fireEvent.change(bodyInput(), { target: { value: "# 지침\n\n1. 확인" } });
    const before = skillsViewStore.getSnapshot();

    fireEvent.click(saveButton());
    expect(screen.getByRole("button", { name: "저장 중…" })).toBeDisabled();
    await flush();

    const post = calls.find((call) => call.method === "POST");
    expect(post?.url).toBe("/api/skills");
    expect(post?.body).toEqual({
      name: "design-token-audit",
      description: "토큰 점검",
      userOnly: true,
      body: "# 지침\n\n1. 확인",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    const after = skillsViewStore.getSnapshot();
    expect(after.savedTick).toBe(before.savedTick + 1);
    expect(after.refreshTick).toBe(before.refreshTick + 1);
  });

  it("[FR-020-AC5] 저장 성공 직후 08 안내 줄 신호(savedTick)가 올라가고, 실패하면 올라가지 않는다", async () => {
    stubFetch({ post: () => jsonResponse({ code: "IO_FAILED", message: "실패" }, 500) });
    const onClose = renderForm({ mode: "create" });
    fillCreate();
    const before = skillsViewStore.getSnapshot().savedTick;
    fireEvent.click(saveButton());
    await flush();

    expect(skillsViewStore.getSnapshot().savedTick).toBe(before);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[FR-020-AC3] 수정: 읽는 동안 폼 비활성 + 스켈레톤 → 이름은 고정 글자(입력 아님)·도움말·경로·폼 값, 저장은 PUT {description,userOnly,body,expectedRevision}에 name이 없다", async () => {
    let release: (response: Response) => void = () => undefined;
    const calls = stubFetch({
      get: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
      put: () => jsonResponse(buildSkillDetail("design-critique"), 200),
    });
    renderForm({ mode: "edit", skillName: "design-critique" });

    expect(screen.getByRole("heading", { name: "스킬 수정" })).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(document.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0);

    await act(async () => {
      release(
        jsonResponse(
          buildSkillDetail("design-critique", {
            description: "원래 설명",
            userOnly: true,
            body: "원래 본문\n",
            revision: "111-22",
          }),
        ),
      );
    });
    await flush();

    expect(calls[0]).toMatchObject({ url: "/api/skills/design-critique", method: "GET" });
    expect(screen.queryByRole("textbox", { name: /^이름/ })).toBeNull();
    expect(screen.getByText("design-critique", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("이름(폴더 이름)은 바꿀 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText("AojiStudio/.claude/skills/design-critique/SKILL.md")).toBeInTheDocument();
    expect(screen.getByText("폼에 없는 frontmatter 항목(allowed-tools 등)은 값과 순서를 그대로 둡니다")).toBeInTheDocument();
    expect(descriptionInput()).toHaveValue("원래 설명");
    expect(bodyInput()).toHaveValue("원래 본문\n");
    expect(screen.getByLabelText("사용자만 호출")).toBeChecked();

    fireEvent.change(descriptionInput(), { target: { value: "고친 설명" } });
    fireEvent.click(saveButton());
    await flush();

    const put = calls.find((call) => call.method === "PUT");
    expect(put?.url).toBe("/api/skills/design-critique");
    expect(put?.body).toEqual({
      description: "고친 설명",
      userOnly: true,
      body: "원래 본문\n",
      expectedRevision: "111-22",
    });
  });

  it("[FR-020-AC4] 409 `REVISION_CONFLICT` → 08-4(alertdialog, 시각 hh:mm:ss) → `최신 파일 다시 불러오기`는 GET으로 폼을 새 값으로 채우고 PUT은 보내지 않는다", async () => {
    let detail = buildSkillDetail("design-critique", { description: "내 설명", revision: "1-1" });
    const calls = stubFetch({
      get: () => jsonResponse(detail),
      put: () =>
        jsonResponse(
          { code: "REVISION_CONFLICT", message: "충돌", details: { currentRevision: "2-2", modifiedAt: "2026-10-15T14:31:52+09:00" } },
          409,
        ),
    });
    renderForm({ mode: "edit", skillName: "design-critique" });
    await flush();
    fireEvent.change(descriptionInput(), { target: { value: "폼에 적은 설명" } });
    fireEvent.click(saveButton());
    await flush();

    const conflict = screen.getByRole("alertdialog");
    expect(conflict).toHaveAttribute("data-wf", "08-4-1");
    expect(within(conflict).getByRole("heading", { name: "파일이 다른 곳에서 수정되었습니다" })).toBeInTheDocument();
    expect(conflict).toHaveTextContent("design-critique/SKILL.md가 이 창을 연 뒤 14:31:52에 바뀌었습니다.");
    expect(conflict).toHaveTextContent("덮어쓰면 그 변경이 사라집니다");
    expect(conflict).toHaveTextContent("최신 파일을 다시 불러오면 지금 폼에 적은 내용이 사라집니다.");
    const reload = within(conflict).getByRole("button", { name: "최신 파일 다시 불러오기" });
    expect(reload.querySelector("svg.lucide-refresh-cw")).not.toBeNull();
    expect(within(conflict).getByRole("button", { name: "덮어쓰기" })).toBeEnabled();

    detail = buildSkillDetail("design-critique", { description: "밖에서 바뀐 설명", body: "새 본문", revision: "2-2" });
    fireEvent.click(reload);
    await flush();

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(descriptionInput()).toHaveValue("밖에서 바뀐 설명");
    expect(bodyInput()).toHaveValue("새 본문");
    expect(calls.filter((call) => call.method === "GET")).toHaveLength(2);
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("[FR-020-AC4] 08-4 `덮어쓰기` → 같은 내용을 `force: true`로 PUT하고 성공하면 창이 닫힌다", async () => {
    let putCount = 0;
    const calls = stubFetch({
      get: () => jsonResponse(buildSkillDetail("design-critique", { revision: "1-1" })),
      put: () => {
        putCount += 1;
        return putCount === 1
          ? jsonResponse({ code: "REVISION_CONFLICT", message: "충돌", details: { modifiedAt: "2026-10-15T14:31:52+09:00" } }, 409)
          : jsonResponse(buildSkillDetail("design-critique"), 200);
      },
    });
    const onClose = renderForm({ mode: "edit", skillName: "design-critique" });
    await flush();
    fireEvent.change(descriptionInput(), { target: { value: "덮어쓸 설명" } });
    fireEvent.click(saveButton());
    await flush();

    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "덮어쓰기" }));
    await flush();

    const puts = calls.filter((call) => call.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts[0]?.body).not.toHaveProperty("force");
    expect(puts[1]?.body).toMatchObject({ description: "덮어쓸 설명", expectedRevision: "1-1", force: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[FR-020-AC4] 08-4는 ESC로 이 창만 닫고 08-1 폼은 입력을 유지한다", async () => {
    stubFetch({
      get: () => jsonResponse(buildSkillDetail("design-critique")),
      put: () =>
        jsonResponse({ code: "REVISION_CONFLICT", message: "충돌", details: { modifiedAt: "2026-10-15T14:31:52+09:00" } }, 409),
    });
    const onClose = renderForm({ mode: "edit", skillName: "design-critique" });
    await flush();
    fireEvent.change(descriptionInput(), { target: { value: "유지될 설명" } });
    fireEvent.click(saveButton());
    await flush();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(descriptionInput()).toHaveValue("유지될 설명");
  });

  it("[FR-020-E3] 500 `IO_FAILED` → 아래 줄 위 Alert(서버 문구: 첫 문장 굵게 + 사유), 입력 유지·창 열림·다시 저장 가능", async () => {
    const message = "스킬 폴더를 만들지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 폴더 쓰기 권한을 확인한 뒤 다시 만드세요.";
    stubFetch({ post: () => jsonResponse({ code: "IO_FAILED", message }, 500) });
    const onClose = renderForm({ mode: "create" });
    fillCreate();
    fireEvent.click(saveButton());
    await flush();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert.querySelector('[data-part="lead"]')).toHaveTextContent("스킬 폴더를 만들지 못했습니다.");
    expect(nameInput()).toHaveValue("design-token-audit");
    expect(saveButton()).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[FR-020-E4] 409 `FILE_GONE` → `저장 중 파일이 사라졌습니다` Alert", async () => {
    stubFetch({
      get: () => jsonResponse(buildSkillDetail("design-critique")),
      put: () => jsonResponse({ code: "FILE_GONE", message: "서버 문구", }, 409),
    });
    renderForm({ mode: "edit", skillName: "design-critique" });
    await flush();
    fireEvent.click(saveButton());
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("저장 중 파일이 사라졌습니다");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("[FR-020-E4] (D-164) 쓰기 404 `SKILL_NOT_FOUND`도 FILE_GONE과 같은 알림 `저장 중 파일이 사라졌습니다`", async () => {
    stubFetch({
      get: () => jsonResponse(buildSkillDetail("design-critique")),
      put: () => jsonResponse({ code: "SKILL_NOT_FOUND", message: "이미 없는 스킬입니다" }, 404),
    });
    renderForm({ mode: "edit", skillName: "design-critique" });
    await flush();
    fireEvent.click(saveButton());
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("저장 중 파일이 사라졌습니다");
  });

  it("[FR-020-AC6] 409 `IMPORTED_SKILL` → `가져온 스킬은 수정할 수 없습니다` Alert, 입력 유지", async () => {
    stubFetch({
      get: () => jsonResponse(buildSkillDetail("imported-lint", { imported: true })),
      put: () => jsonResponse({ code: "IMPORTED_SKILL", message: "가져온 스킬은 수정할 수 없습니다" }, 409),
    });
    renderForm({ mode: "edit", skillName: "imported-lint" });
    await flush();
    fireEvent.change(descriptionInput(), { target: { value: "고치려는 설명" } });
    fireEvent.click(saveButton());
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("가져온 스킬은 수정할 수 없습니다");
    expect(descriptionInput()).toHaveValue("고치려는 설명");
  });

  it("[FR-020-E5] 수정 GET이 409 `UNEDITABLE`이면 창을 열지 않고(onClose) 오류를 보이지 않는다", async () => {
    stubFetch({ get: () => jsonResponse({ code: "UNEDITABLE", message: "에디터에서 SKILL.md를 고치세요" }, 409) });
    const onClose = renderForm({ mode: "edit", skillName: "bad-yaml" });
    await flush();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("[FR-020-E5] 수정 GET이 404 `SKILL_NOT_FOUND`면 `이미 없는 스킬입니다` Alert + `닫기`(저장 없음)", async () => {
    stubFetch({ get: () => jsonResponse({ code: "SKILL_NOT_FOUND", message: "이미 없는 스킬입니다" }, 404) });
    const onClose = renderForm({ mode: "edit", skillName: "gone" });
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("이미 없는 스킬입니다");
    expect(screen.queryByRole("button", { name: /^저장/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[FR-020-E2] writable=false면 `저장`이 비활성이고 아래에 `쓰기 권한 없음 · 마운트한 폴더를 쓰기 가능하게 실행해야 바꿀 수 있습니다`", () => {
    seedRegistry(false);
    const calls = stubFetch({});
    renderForm({ mode: "create" });
    fillCreate();

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("쓰기 권한 없음 · 마운트한 폴더를 쓰기 가능하게 실행해야 바꿀 수 있습니다")).toBeInTheDocument();
    fireEvent.click(saveButton());
    expect(calls).toHaveLength(0);
  });

  it("[FR-020-AC1] 취소·ESC는 요청 없이 창을 닫는다", () => {
    const calls = stubFetch({});
    const onClose = renderForm({ mode: "create" });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(0);
  });
});
