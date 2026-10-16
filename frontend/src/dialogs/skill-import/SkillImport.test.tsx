import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillImport } from "./SkillImport";
import type { SkillImportPreview } from "../../api/types";
import { formatYmd } from "../../lib/format/time";
import { skillsViewStore } from "../../state/skillsViewStore";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import { buildSkillDetail } from "../../test/fixtures/skills";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface RequestCall {
  url: string;
  method: string;
  /** JSON 본문 또는 multipart `FormData`. */
  body: Record<string, unknown> | FormData | null;
}

type Handler = () => Response | Promise<Response>;

/** api-spec.yaml 응답만 바꿔 가며 쓰는 fetch 대역(테스트 전용). */
function stubFetch(handlers: { preview?: Handler; importSkill?: Handler }) {
  const calls: RequestCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
      const method = init?.method ?? "GET";
      const raw = init?.body;
      calls.push({
        url,
        method,
        body:
          raw === undefined || raw === null
            ? null
            : raw instanceof FormData
              ? raw
              : (JSON.parse(String(raw)) as Record<string, unknown>),
      });
      const handler = url.endsWith("/api/skills/import/preview") ? handlers.preview : handlers.importSkill;
      if (handler === undefined) throw new Error(`unexpected fetch: ${method} ${url}`);
      return handler();
    }),
  );
  return calls;
}

function buildPreview(overrides: Partial<SkillImportPreview> = {}): SkillImportPreview {
  return {
    uploadId: "11111111-2222-3333-4444-555555555555",
    expiresAt: "2026-10-15T15:02:00+09:00",
    name: "frontend-design",
    description: "Distinctive, intentional visual design for new UI",
    files: [
      { path: "SKILL.md", size: 1200, script: false, executable: false },
      { path: "reference/color.md", size: 800, script: false, executable: false },
      { path: "scripts/contrast.py", size: 400, script: true, executable: false },
      { path: "scripts/palette.sh", size: 300, script: true, executable: true },
    ],
    fileCount: 4,
    unpackedBytes: 188416,
    scriptCount: 2,
    hasSourceMd: false,
    ...overrides,
  };
}

function seedRegistry(writable = true) {
  const base = buildSnapshotFixture();
  snapshotStore.replace({ ...base, registry: { ...base.registry, writable } });
}

function renderImport(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <SkillImport onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

const zipFile = (name = "frontend-design-1.3.zip", size = 1_887_437) => {
  const file = new File(["zip"], name, { type: "application/zip" });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const importButton = () => screen.getByRole("button", { name: /^가져오기|^가져오는 중/ });

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** jsdom은 `FileList`를 만들 수 없어 인덱스로 읽히는 같은 모양의 객체를 쓴다. */
const fileList = (...files: File[]) => Object.assign([...files], { item: (index: number) => files[index] ?? null });

async function pick(file = zipFile()) {
  fireEvent.change(fileInput(), { target: { files: fileList(file) } });
  await flush();
}

function fillSource(source = "https://github.com/anthropics/skills", version = "a1c9e07", license = "Apache-2.0") {
  fireEvent.change(screen.getByRole("textbox", { name: /^출처/ }), { target: { value: source } });
  fireEvent.change(screen.getByRole("textbox", { name: /^커밋/ }), { target: { value: version } });
  fireEvent.change(screen.getByRole("textbox", { name: /^라이선스/ }), { target: { value: license } });
}

describe("SkillImport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    seedRegistry();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    snapshotStore.reset();
    skillsViewStore.reset();
  });

  it("[FR-021-AC2] 고르기 전: 제목·부제·점선 상자 `zip 파일 선택`·제한 문구, 출처 입력과 `가져오기`는 비활성 + `zip 파일을 먼저 고르세요`, 입력은 accept .zip", () => {
    const calls = stubFetch({});
    renderImport();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-wf", "08-2-1");
    expect(within(dialog).getByRole("heading", { name: "스킬 가져오기" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("zip을 올리면 저장 전에 미리 보여 줍니다 · .claude/skills/<이름>/에 넣고 출처를 SOURCE.md로 남깁니다");
    expect(screen.getByRole("button", { name: "zip 파일 선택" })).toBeEnabled();
    expect(
      screen.getByText("zip 10MB · 파일 500개 · 풀었을 때 50MB 이하. 맨 위에 SKILL.md가 있거나, 맨 위 폴더 하나 안에 SKILL.md가 있어야 합니다"),
    ).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute("accept", ".zip");
    expect(importButton()).toBeDisabled();
    expect(screen.getByText("zip 파일을 먼저 고르세요")).toBeInTheDocument();
    for (const name of [/^출처/, /^커밋/, /^라이선스/]) expect(screen.getByRole("textbox", { name })).toBeDisabled();
    expect(dialog.querySelector('[data-wf="08-2-4"]')).toBeNull();
    expect(screen.getByRole("button", { name: "취소" })).toBeEnabled();
    expect(calls).toHaveLength(0);
  });

  it("[FR-021-AC1] 파일을 고르면 바로 multipart `file`로 POST /api/skills/import/preview를 보내고 올리는 동안 미리보기는 스켈레톤이다", async () => {
    let release: (response: Response) => void = () => undefined;
    const calls = stubFetch({
      preview: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });
    renderImport();
    fireEvent.change(fileInput(), { target: { files: fileList(zipFile()) } });
    await flush();

    const post = calls.find((call) => call.method === "POST");
    expect(post?.url).toBe("/api/skills/import/preview");
    expect(post?.body).toBeInstanceOf(FormData);
    const sent = (post?.body as FormData).get("file") as File;
    expect(sent.name).toBe("frontend-design-1.3.zip");
    const preview = screen.getByRole("region", { name: "미리보기" });
    expect(preview).toHaveAttribute("aria-busy", "true");
    expect(preview.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0);
    expect(screen.getByText("frontend-design-1.3.zip")).toBeInTheDocument();

    await act(async () => {
      release(jsonResponse(buildPreview()));
    });
    await flush();
    expect(screen.getByRole("region", { name: "미리보기" })).toHaveAttribute("aria-busy", "false");
  });

  it("[FR-021-AC1] 끌어 놓은 zip도 같은 방식으로 올린다", async () => {
    const calls = stubFetch({ preview: () => jsonResponse(buildPreview()) });
    renderImport();
    const drop = document.querySelector('[data-wf="08-2-2"]') as HTMLElement;
    fireEvent.drop(drop, { dataTransfer: { files: fileList(zipFile("dropped.zip")) } });
    await flush();

    expect(((calls[0]?.body as FormData).get("file") as File).name).toBe("dropped.zip");
    expect(screen.getByRole("region", { name: "미리보기" })).toHaveTextContent("frontend-design");
  });

  it("[FR-021-AC4] 미리보기: 스킬 이름·설명·`파일 N개 · 풀면 <크기> · 스크립트 N개`·경로 목록과 `스크립트`·`실행 파일` 칩, 스크립트가 있으면 경고 상자(triangle-alert)", async () => {
    stubFetch({ preview: () => jsonResponse(buildPreview()) });
    renderImport();
    await pick();

    expect(screen.getByText("1.8MB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다른 파일 선택" })).toBeEnabled();
    const preview = screen.getByRole("region", { name: "미리보기" });
    expect(preview).toHaveTextContent("스킬 이름");
    expect(within(preview).getByText("frontend-design")).toBeInTheDocument();
    expect(within(preview).getByText("Distinctive, intentional visual design for new UI")).toBeInTheDocument();
    expect(within(preview).getByRole("heading", { name: "파일 목록" })).toBeInTheDocument();
    expect(preview).toHaveTextContent("파일 4개 · 풀면 184KB · 스크립트 2개");
    expect(within(preview).getByText("scripts/palette.sh")).toBeInTheDocument();
    expect(within(preview).getAllByText("스크립트", { exact: true })).toHaveLength(2);
    expect(within(preview).getAllByText("실행 파일", { exact: true })).toHaveLength(1);

    const warning = document.querySelector('[data-wf="08-2-4"]') as HTMLElement;
    expect(warning).toHaveAttribute("role", "note");
    expect(warning.querySelector("svg.lucide-triangle-alert")).not.toBeNull();
    expect(warning).toHaveTextContent("Claude가 이 스킬을 쓸 때 스크립트를 실행할 수 있습니다");
    expect(warning).toHaveTextContent("가져오기 전에 scripts/ 내용을 확인하세요");
    expect(screen.queryByText("zip 파일을 먼저 고르세요")).toBeNull();
    expect(importButton()).toBeEnabled();
  });

  it("[FR-021-AC4] 스크립트가 0개면 경고 상자가 없고 칩도 없다", async () => {
    stubFetch({
      preview: () =>
        jsonResponse(
          buildPreview({
            files: [{ path: "SKILL.md", size: 10, script: false, executable: false }],
            fileCount: 1,
            scriptCount: 0,
          }),
        ),
    });
    renderImport();
    await pick();

    expect(document.querySelector('[data-wf="08-2-4"]')).toBeNull();
    const preview = screen.getByRole("region", { name: "미리보기" });
    expect(preview).toHaveTextContent("스크립트 0개");
    expect(within(preview).queryByText("스크립트", { exact: true })).toBeNull();
    expect(within(preview).queryByText("실행 파일", { exact: true })).toBeNull();
  });

  it.each([
    ["FR-021-E1", "NOT_ZIP", "zip 파일이 아니거나 손상되었습니다"],
    ["FR-021-E1", "NO_SKILL_MD", "맨 위나 맨 위 폴더 하나 안에 SKILL.md가 없습니다"],
    ["FR-021-E2", "PATH_TRAVERSAL", "가져올 수 없는 항목이 있습니다. scripts/../../etc · 경로 이탈"],
    ["FR-021-E2", "TOO_LARGE", "zip이 10MB를 넘습니다"],
    ["FR-021-E3", "NAME_INVALID", "스킬 이름 Bad_Name · 소문자·숫자·하이픈만, 1~64자"],
  ])("[%s] 400 `IMPORT_REJECTED`(%s) → 상자 아래 Alert에 서버 문구, 미리보기·경고 없음, `가져오기` 비활성 + 이유", async (_id, reason, message) => {
    stubFetch({
      preview: () => jsonResponse({ code: "IMPORT_REJECTED", message, details: { reason, entry: null } }, 400),
    });
    renderImport();
    await pick();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(document.querySelector('[data-wf="08-2-2"]')?.parentElement).toContainElement(alert);
    expect(screen.queryByRole("heading", { name: "파일 목록" })).toBeNull();
    expect(document.querySelector('[data-wf="08-2-4"]')).toBeNull();
    expect(importButton()).toBeDisabled();
    expect(screen.getByText("zip 파일을 먼저 고르세요")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^출처/ })).toBeDisabled();
    // 거부된 뒤 다른 파일을 다시 고를 수 있다.
    expect(screen.getByRole("button", { name: "다른 파일 선택" })).toBeEnabled();
  });

  it("[FR-021-E3][ADR-93] preview 409 `IMPORT_REJECTED`(NAME_EXISTS) → Alert, 미리보기 없음", async () => {
    stubFetch({
      preview: () =>
        jsonResponse(
          { code: "IMPORT_REJECTED", message: "스킬 이름 design-review · 이미 있는 이름입니다", details: { reason: "NAME_EXISTS", entry: null } },
          409,
        ),
    });
    renderImport();
    await pick();

    expect(screen.getByRole("alert")).toHaveTextContent("스킬 이름 design-review · 이미 있는 이름입니다");
    expect(screen.queryByRole("heading", { name: "파일 목록" })).toBeNull();
    expect(importButton()).toBeDisabled();
  });

  it("[FR-021-E1][ADR-93] preview 500 `IO_FAILED` → Alert(서버 문구), 미리보기 없음", async () => {
    const message = "스킬을 가져오지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 아무것도 남기지 않았습니다.";
    stubFetch({ preview: () => jsonResponse({ code: "IO_FAILED", message }, 500) });
    renderImport();
    await pick();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert.querySelector('[data-part="lead"]')).toHaveTextContent("스킬을 가져오지 못했습니다.");
    expect(screen.queryByRole("heading", { name: "파일 목록" })).toBeNull();
    expect(importButton()).toBeDisabled();
  });

  it("[FR-021-E1] 거부 뒤 다른 zip을 고르면 이전 Alert가 사라지고 새 미리보기가 나온다", async () => {
    let reject = true;
    stubFetch({
      preview: () =>
        reject
          ? jsonResponse({ code: "IMPORT_REJECTED", message: "zip 파일이 아니거나 손상되었습니다", details: { reason: "NOT_ZIP" } }, 400)
          : jsonResponse(buildPreview()),
    });
    renderImport();
    await pick(zipFile("bad.zip"));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    reject = false;
    await pick(zipFile("good.zip"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { name: "파일 목록" })).toBeInTheDocument();
    expect(screen.getByText("good.zip")).toBeInTheDocument();
  });

  it("[FR-021-AC5] 출처 아래 안내의 가져온 날짜는 브라우저 오늘 yyyy-mm-dd(고정폭)이고, 가져오기는 POST /api/skills/import {uploadId, source, version, license} → 창 닫힘 + 08 안내 신호", async () => {
    const calls = stubFetch({
      preview: () => jsonResponse(buildPreview()),
      importSkill: () => jsonResponse(buildSkillDetail("frontend-design", { imported: true }), 201),
    });
    const onClose = renderImport();
    await pick();
    fillSource();

    const note = document.querySelector('[data-wf="08-2-5"]') as HTMLElement;
    expect(note).toHaveTextContent(
      `SOURCE.md에 출처·커밋·라이선스·가져온 날짜(${formatYmd(new Date())})를 씁니다. zip 안에 SOURCE.md가 있으면 그 뒤에 덧붙입니다`,
    );
    expect(within(note).getByText(formatYmd(new Date())).className).toContain("font-mono");
    expect(document.querySelector('[data-wf="08-2-6"]')).toHaveTextContent("가져온 스킬은 웹에서 수정할 수 없고 삭제만 할 수 있습니다");

    const before = skillsViewStore.getSnapshot();
    fireEvent.click(importButton());
    expect(screen.getByRole("button", { name: "가져오는 중…" })).toBeDisabled();
    await flush();

    const post = calls.filter((call) => call.url === "/api/skills/import");
    expect(post).toHaveLength(1);
    expect(post[0]?.body).toEqual({
      uploadId: "11111111-2222-3333-4444-555555555555",
      source: "https://github.com/anthropics/skills",
      version: "a1c9e07",
      license: "Apache-2.0",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(skillsViewStore.getSnapshot().savedTick).toBe(before.savedTick + 1);
    expect(skillsViewStore.getSnapshot().refreshTick).toBe(before.refreshTick + 1);
  });

  it("[FR-021-AC5] 커밋·버전을 비우면 `version: null`로 보낸다", async () => {
    const calls = stubFetch({
      preview: () => jsonResponse(buildPreview()),
      importSkill: () => jsonResponse(buildSkillDetail("frontend-design", { imported: true }), 201),
    });
    renderImport();
    await pick();
    fillSource("출처 설명", "", "MIT");
    fireEvent.click(importButton());
    await flush();

    expect(calls.find((call) => call.url === "/api/skills/import")?.body).toMatchObject({ source: "출처 설명", version: null, license: "MIT" });
  });

  it("[FR-021-E4] 출처·라이선스가 비면 서버 400 `fields.source`·`fields.license` `필수`가 각 입력 아래에 뜨고 창은 열려 있다", async () => {
    stubFetch({
      preview: () => jsonResponse(buildPreview()),
      importSkill: () =>
        jsonResponse({ code: "VALIDATION", message: "입력을 확인하세요", fields: { source: "필수", license: "필수" } }, 400),
    });
    const onClose = renderImport();
    await pick();
    fireEvent.click(importButton());
    await flush();

    const source = screen.getByRole("textbox", { name: /^출처/ });
    const license = screen.getByRole("textbox", { name: /^라이선스/ });
    expect(source).toHaveAttribute("aria-invalid", "true");
    expect(license).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("필수", { selector: '[role="alert"]' })).toHaveLength(2);
    expect(screen.getByRole("textbox", { name: /^커밋/ })).not.toHaveAttribute("aria-invalid", "true");
    expect(onClose).not.toHaveBeenCalled();
    expect(importButton()).toBeEnabled();
  });

  it("[FR-021-E5] 가져오기 500 `IO_FAILED` → 아래 줄 위 Alert(서버 문구), 미리보기·입력 유지, 다시 누를 수 있다", async () => {
    const message = "스킬을 가져오지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 아무것도 남기지 않았습니다.";
    stubFetch({
      preview: () => jsonResponse(buildPreview()),
      importSkill: () => jsonResponse({ code: "IO_FAILED", message }, 500),
    });
    const onClose = renderImport();
    await pick();
    fillSource();
    fireEvent.click(importButton());
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("heading", { name: "파일 목록" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^출처/ })).toHaveValue("https://github.com/anthropics/skills");
    expect(importButton()).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[FR-021-E5] 404 `UPLOAD_NOT_FOUND` → 상자 아래 Alert + 고르기 전으로(미리보기·파일 이름 없음, `zip 파일 선택`)", async () => {
    stubFetch({
      preview: () => jsonResponse(buildPreview()),
      importSkill: () => jsonResponse({ code: "UPLOAD_NOT_FOUND", message: "올린 zip을 찾을 수 없습니다 · 파일을 다시 고르세요" }, 404),
    });
    renderImport();
    await pick();
    fillSource();
    fireEvent.click(importButton());
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("올린 zip을 찾을 수 없습니다 · 파일을 다시 고르세요");
    expect(screen.getByRole("button", { name: "zip 파일 선택" })).toBeEnabled();
    expect(screen.queryByText("frontend-design-1.3.zip")).toBeNull();
    expect(screen.queryByRole("heading", { name: "파일 목록" })).toBeNull();
    expect(importButton()).toBeDisabled();
    expect(screen.getByText("zip 파일을 먼저 고르세요")).toBeInTheDocument();
  });

  it("[FR-021-E3] 가져오기 409 `IMPORT_REJECTED`(NAME_EXISTS) → 상자 아래 같은 자리 Alert(서버 문구)", async () => {
    stubFetch({
      preview: () => jsonResponse(buildPreview()),
      importSkill: () =>
        jsonResponse(
          { code: "IMPORT_REJECTED", message: "스킬 이름 frontend-design · 이미 있는 이름입니다", details: { reason: "NAME_EXISTS" } },
          409,
        ),
    });
    const onClose = renderImport();
    await pick();
    fillSource();
    fireEvent.click(importButton());
    await flush();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("스킬 이름 frontend-design · 이미 있는 이름입니다");
    expect(document.querySelector('[data-wf="08-2-2"]')?.parentElement).toContainElement(alert);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[FR-020-E2] writable=false면 미리보기가 있어도 `가져오기`는 비활성이고 아래에 `쓰기 권한 없음 · …`", async () => {
    seedRegistry(false);
    stubFetch({ preview: () => jsonResponse(buildPreview()) });
    renderImport();
    await pick();
    fillSource();

    expect(importButton()).toBeDisabled();
    expect(screen.getByText("쓰기 권한 없음 · 마운트한 폴더를 쓰기 가능하게 실행해야 바꿀 수 있습니다")).toBeInTheDocument();
  });

  it("[FR-021-AC1] 취소·ESC는 요청 없이 창을 닫는다", () => {
    const calls = stubFetch({});
    const onClose = renderImport();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(0);
  });
});
