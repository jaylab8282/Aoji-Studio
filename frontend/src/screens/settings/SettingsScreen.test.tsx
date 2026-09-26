import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "./SettingsScreen";
import type { Registry } from "../../api/types";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSettingsFixture } from "../../test/fixtures/settings";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface FetchCall {
  url: string;
  method: string;
}

interface Handlers {
  settings?: () => Response | Promise<Response>;
  rescan?: () => Response | Promise<Response>;
  /**
   * 도우미 `GET <helperUrl>/health` (FR-013-AC10). 기본값은 **응답하지 않는 프라미스**다 —
   * 진입 확인이 끝나기 전 화면(`확인 중…`)을 흔들림 없이 유지하려는 것이고,
   * 도우미 상태를 보는 테스트는 이 핸들러를 직접 넘긴다. `signal`은 2초 타임아웃 테스트가
   * `abort`에 반응하는 응답을 만들 때만 쓴다(고정 대기 없이 경계를 만든다).
   */
  helperHealth?: (signal: AbortSignal | null | undefined) => Response | Promise<Response>;
  /** 서버 `GET /api/helper/token` (FR-013-AC8). */
  helperToken?: () => Response | Promise<Response>;
  /** 도우미 `POST <helperUrl>/open` (FR-013-AC6). */
  helperOpen?: () => Response | Promise<Response>;
}

/** `/api/settings`·`/api/registry/rescan`·도우미 호출만 응답하는 fetch 대역(테스트 전용). */
function stubFetch(handlers: Handlers = {}): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/auth/browser-token")) {
        return jsonResponse({ token: "a".repeat(64) });
      }
      calls.push({ url, method });
      if (url.includes("/api/settings")) {
        return handlers.settings === undefined
          ? jsonResponse(buildSettingsFixture())
          : handlers.settings();
      }
      if (url.includes("/api/registry/rescan")) {
        return handlers.rescan === undefined
          ? jsonResponse(registryFixture())
          : handlers.rescan();
      }
      if (url.includes("/api/helper/token")) {
        return handlers.helperToken === undefined
          ? jsonResponse({ token: "b".repeat(64) })
          : handlers.helperToken();
      }
      if (url.endsWith("/health")) {
        return handlers.helperHealth === undefined
          ? new Promise<Response>(() => {})
          : handlers.helperHealth(init?.signal);
      }
      if (url.endsWith("/open")) {
        return handlers.helperOpen === undefined
          ? new Response(null, { status: 204 })
          : handlers.helperOpen();
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  return calls;
}

/** 2초 타임아웃의 `abort`에만 반응하는 응답(고정 대기 없이 경계를 만든다). */
function neverResolving(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise<Response>((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

function registryFixture(overrides: Partial<Registry> = {}): Registry {
  return { ...buildSnapshotFixture().registry, agentCount: 7, skillCount: 3, ...overrides };
}

/** 스냅샷 스토어를 `GET /api/settings` fixture와 같은 수치로 채운다(AppShell이 주는 상태). */
function putRegistryInStore(overrides: Partial<Registry> = {}) {
  const snapshot = buildSnapshotFixture();
  snapshotStore.replace({ ...snapshot, registry: registryFixture(overrides) });
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <SettingsScreen />
    </MemoryRouter>,
  );
}

/** 값이 경로(mono) + 설명 조각으로 나뉘므로 행 전체 글자로 확인한다. */
function rowText(testId: string): string {
  return screen.getByTestId(testId).textContent ?? "";
}

const writeText = vi.fn<(text: string) => Promise<void>>();

describe("SettingsScreen (SCR-07)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    putRegistryInStore();
  });

  afterEach(() => {
    snapshotStore.reset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("[FR-014-AC4] 마운트 폴더 = settings.hostPath(맥북 경로)", async () => {
    stubFetch();
    renderScreen();

    await waitFor(() =>
      expect(rowText("settings-row-mount-path")).toContain("/Users/jaybee/Desktop/JayStudio"),
    );
    // 컨테이너 마운트 경로는 화면 어디에도 없다(ADR-20).
    expect(screen.queryByText(/\/workspace/)).not.toBeInTheDocument();
  });

  it("[FR-001-AC5] 경로 읽기 전용 텍스트, input 요소 없음", async () => {
    stubFetch();
    const { container } = renderScreen();

    await waitFor(() =>
      expect(rowText("settings-row-mount-path")).toContain("/Users/jaybee/Desktop/JayStudio"),
    );
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(container.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
  });

  it("[FR-014-AC1] settings.json 편집 요소 없음, 복사 버튼만", async () => {
    stubFetch();
    const { container } = renderScreen();

    await waitFor(() => expect(rowText("settings-row-hook")).toContain(".claude/settings.json"));
    // hook 설정 카드에서 파일을 고칠 수 있는 요소(입력·저장 버튼)가 없다.
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "설정 예시 복사" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "다시 읽기",
      "테스트로 열기 (도우미 설치 후)",
      "명령 복사",
      "설정 예시 복사",
    ]);
  });

  it("[FR-014-AC2] 설정 예시 복사 → clipboard = settings.hookSettingsExample", async () => {
    const settings = buildSettingsFixture();
    stubFetch();
    renderScreen();

    // 값이 실린 뒤(`findBy*`는 존재만 기다린다) 눌러야 경쟁 없이 복사 대상이 확정된다.
    await waitFor(() => expect(rowText("settings-row-hook")).toContain(".claude/settings.json"));
    fireEvent.click(screen.getByRole("button", { name: "설정 예시 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(settings.hookSettingsExample));
    expect(await screen.findByRole("button", { name: "복사됨" })).toBeInTheDocument();
  });

  it("[FR-014-AC3] hookConfigured true → '설정됨', false → '없음'", async () => {
    stubFetch();
    const { unmount } = renderScreen();

    await waitFor(() => expect(rowText("settings-row-hook")).toContain("설정됨"));
    expect(rowText("settings-row-hook")).toContain(".claude/settings.json");
    unmount();

    putRegistryInStore({ hookConfigured: false });
    stubFetch({ settings: () => jsonResponse(buildSettingsFixture({ hookConfigured: false })) });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-hook")).toContain("없음"));
    expect(rowText("settings-row-hook")).not.toContain("설정됨");
    expect(within(screen.getByTestId("settings-row-hook")).getByText("없음")).toHaveClass(
      "text-danger",
    );
  });

  it("[FR-001-AC4] 다시 읽기 → POST /api/registry/rescan, 응답으로 수치 갱신", async () => {
    const calls = stubFetch({
      rescan: () => jsonResponse(registryFixture({ agentCount: 11, skillCount: 5 })),
    });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-agents")).toContain("정의 7개"));

    fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));

    await waitFor(() => expect(rowText("settings-row-agents")).toContain("정의 11개"));
    expect(rowText("settings-row-skills")).toContain("5개");
    expect(calls.filter((call) => call.url.includes("/api/registry/rescan"))).toEqual([
      { url: "/api/registry/rescan", method: "POST" },
    ]);
  });

  it("[FR-001-AC4] 다시 읽기 실패 → '다시 읽지 못했습니다 · <message>'", async () => {
    stubFetch({
      rescan: () =>
        jsonResponse({ code: "IO_FAILED", message: "폴더를 읽지 못했습니다" }, 500),
    });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-agents")).toContain("정의 7개"));
    fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));

    expect(
      await screen.findByText("다시 읽지 못했습니다 · 폴더를 읽지 못했습니다"),
    ).toBeInTheDocument();
    // 실패해도 마지막 값은 그대로 남는다.
    expect(rowText("settings-row-agents")).toContain("정의 7개");
  });

  it("[FR-001-AC4][FR-014-AC3] SSE registry 갱신 → 카드 수치와 hook 설정이 새 값으로 바뀐다", async () => {
    stubFetch();
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-agents")).toContain("정의 7개"));

    snapshotStore.setRegistry(
      registryFixture({
        agentCount: 2,
        skillCount: 1,
        hookConfigured: false,
        formatErrors: [{ kind: "agent", file: "broken.md", message: "name 누락" }],
      }),
    );

    await waitFor(() => expect(rowText("settings-row-agents")).toContain("정의 2개"));
    expect(rowText("settings-row-skills")).toContain("1개");
    expect(rowText("settings-row-hook")).toContain("없음");
    expect(rowText("settings-row-format-errors")).toContain("! 읽지 못한 정의 파일 1 개");
  });

  it("[FR-001-E1] agentsDirMissing → 프로젝트 폴더 카드에 AgentsDirMissing", async () => {
    putRegistryInStore({ agentsDirMissing: true, agentCount: null });
    stubFetch({
      settings: () =>
        jsonResponse(buildSettingsFixture({ agentsDirMissing: true, agentCount: null })),
    });
    renderScreen();

    expect(await screen.findByText("에이전트 폴더를 찾을 수 없습니다")).toBeInTheDocument();
    expect(
      screen.getByText("/Users/jaybee/Desktop/JayStudio/.claude/agents"),
    ).toBeInTheDocument();
    // 04-5가 카드 본문을 대체하므로 값 행은 그리지 않는다(에이전트 수를 표시하지 않는다).
    expect(screen.queryByTestId("settings-row-agents")).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-row-mount-path")).not.toBeInTheDocument();
  });

  it("[FR-001-E1][ADR-42] agentsDirMissing → 04-5 표시, '설정 열기' 없음, '다시 읽기' 1개", async () => {
    putRegistryInStore({ agentsDirMissing: true, agentCount: null });
    stubFetch({
      settings: () =>
        jsonResponse(buildSettingsFixture({ agentsDirMissing: true, agentCount: null })),
    });
    renderScreen();

    // 04-5 블록은 그대로 뜬다(제목·경로).
    expect(await screen.findByText("에이전트 폴더를 찾을 수 없습니다")).toBeInTheDocument();
    // 07은 `설정 열기`의 도착지 자신이라 이 버튼을 그리지 않는다(ADR-42).
    expect(screen.queryByRole("button", { name: "설정 열기" })).not.toBeInTheDocument();
    expect(screen.queryByText("설정 열기")).not.toBeInTheDocument();
    // `다시 읽기`는 04-5 안의 하나만 남는다(카드 하단 행은 04-5로 대체되어 사라진다).
    expect(screen.getAllByRole("button", { name: "다시 읽기" })).toHaveLength(1);
  });

  it("[FR-001-E2] writable false → '쓰기 권한 없음'(danger)", async () => {
    putRegistryInStore({ writable: false });
    stubFetch({ settings: () => jsonResponse(buildSettingsFixture({ writable: false })) });
    renderScreen();

    const value = await screen.findByText("✗ 쓰기 권한 없음");
    expect(value).toHaveClass("text-danger");
    expect(screen.queryByText("✓ agents 추가·수정·삭제 가능")).not.toBeInTheDocument();
  });

  it("[FR-013-AC5][ADR-33] 템플릿 값 그대로 표시", async () => {
    const settings = buildSettingsFixture();
    stubFetch();
    renderScreen();

    // 서버가 준 템플릿 문자열의 `<팀장 name>`을 지우거나 치환하지 않는다(ADR-33 (a)의 예외).
    await waitFor(() =>
      expect(rowText("settings-row-lead-session")).toContain(settings.leadSessionCommandTemplate),
    );
    expect(rowText("settings-row-lead-session")).toContain("<팀장 name>");
    expect(rowText("settings-row-lead-session")).toContain(
      "도우미가 받는 값은 팀장 name 하나 · 소문자·숫자·하이픈만 허용",
    );
    // 기본 세션 명령도 07에 함께 표시된다(FR-013-AC5 "두 명령").
    expect(rowText("settings-row-default-session")).toBe(
      `기본 세션${settings.defaultSessionCommand}`,
    );
  });

  it("[FR-014-AC5] 07 명령 복사 → clipboard = settings.defaultSessionCommand", async () => {
    const settings = buildSettingsFixture();
    stubFetch();
    renderScreen();

    // 값이 실린 뒤에 누른다(로딩 중에는 비활성이라 클릭이 무시된다).
    await waitFor(() =>
      expect(rowText("settings-row-default-session")).toContain(settings.defaultSessionCommand),
    );
    fireEvent.click(screen.getByRole("button", { name: "명령 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(settings.defaultSessionCommand));
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("도우미 상태를 확인하기 전에는 '확인 중…'과 비활성 '테스트로 열기'를 보여준다", async () => {
    stubFetch();
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-helper")).toContain("확인 중…"));
    const testOpen = screen.getByRole("button", { name: "테스트로 열기 (도우미 설치 후)" });
    expect(testOpen).toBeDisabled();
    // 확인 중은 ADR-35가 이유 문구를 지정한 지점이 아니므로 이유 줄을 붙이지 않는다.
    expect(screen.queryByText("도우미 미설치")).not.toBeInTheDocument();
  });

  it("GET /api/settings 응답 전에는 값 자리에 스켈레톤만 보이고 0을 먼저 보여주지 않는다", () => {
    stubFetch({ settings: () => new Promise<Response>(() => {}) });
    renderScreen();

    expect(within(screen.getByTestId("settings-row-agents")).getByRole("status")).toHaveAttribute(
      "aria-label",
      "에이전트 로딩 중",
    );
    expect(rowText("settings-row-agents")).not.toContain("0");
    expect(rowText("settings-row-skills")).not.toContain("0");
    expect(screen.getByRole("button", { name: "명령 복사" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "설정 예시 복사" })).toBeDisabled();
  });

  it("GET /api/settings 실패 → 카드 안에 ApiError.message를 그대로 보여준다", async () => {
    stubFetch({
      settings: () =>
        jsonResponse(
          {
            code: "FORBIDDEN_ORIGIN",
            message: "허용되지 않은 출처입니다 · http://127.0.0.1:4180 주소로 다시 접속하세요",
          },
          403,
        ),
    });
    renderScreen();

    const messages = await screen.findAllByText(
      "허용되지 않은 출처입니다 · http://127.0.0.1:4180 주소로 다시 접속하세요",
    );
    expect(messages).toHaveLength(3);
    expect(screen.queryByTestId("settings-row-agents")).not.toBeInTheDocument();
    // 복구 수단인 `다시 읽기`는 그대로 남는다.
    expect(screen.getByRole("button", { name: "다시 읽기" })).toBeEnabled();
  });

  it("카드 3개를 와이어프레임 p.4 순서(프로젝트 폴더 → Claude 열기 → 수집)로 그린다", async () => {
    stubFetch();
    renderScreen();

    // 행 전체 글자에는 라벨이 섞여 있으므로 값(경로)이 실린 것으로 로드를 확정한다.
    await waitFor(() =>
      expect(rowText("settings-row-mount-path")).toContain("/Users/jaybee/Desktop/JayStudio"),
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("설정");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "프로젝트 폴더",
      "Claude 열기",
      "수집",
    ]);
    expect(screen.getByText("읽기 전용")).toBeInTheDocument();
    expect(
      screen.getByText(
        "02의 Claude 열기 · 기본 세션과 03의 팀장 호출 · 터미널 열기를 누르면 맥북 터미널이 열리고 프로젝트 폴더에서 claude가 실행됩니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("폴더는 컨테이너 실행 시 마운트로 고정 · 웹에서 변경 불가")).toBeInTheDocument();
    expect(
      screen.getByText("allowedHttpHookUrls가 설정되어 있으면 수집 주소를 허용 목록에 추가하세요"),
    ).toBeInTheDocument();
    expect(rowText("settings-row-terminal-app")).toContain("macOS 기본 터미널");
    expect(rowText("settings-row-collect-url")).toContain("http://127.0.0.1:4180/hooks/events");
    expect(rowText("settings-row-teams")).toContain(".jaystudio/teams/*.json · 팀장·팀원 목록");
    expect(rowText("settings-row-trash")).toContain(".jaystudio/trash/ · 제거한 에이전트 보관");
    expect(rowText("settings-row-retention")).toContain("30일");
    expect(rowText("settings-row-format-errors")).toContain("없음");
  });

  it("[FR-013-AC10] 진입 시 /health 호출, 무응답 → '테스트로 열기' 비활성 '도우미 미설치', 버튼 누를 때 재확인", async () => {
    vi.useFakeTimers();
    const missingCalls = stubFetch({ helperHealth: (signal) => neverResolving(signal) });
    const { unmount } = renderScreen();

    // 진입 시(`useEffect`) 도우미 `GET /health`를 호출한다. mock fetch는 동기로 호출을 기록하므로
    // 렌더 직후 이미 호출이 잡힌다(`waitFor`는 가짜 타이머와 함께 쓰지 않는다 — 폴링이 멈춘다).
    expect(missingCalls.some((call) => call.url.endsWith("/health"))).toBe(true);

    // 2초 안에 응답이 없으면 미설치로 본다(FR-013-AC9와 같은 경계, api/helper.ts).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(rowText("settings-row-helper")).toContain("미설치 · helper/install.sh로 설치");
    expect(screen.getByRole("button", { name: "테스트로 열기 (도우미 설치 후)" })).toBeDisabled();
    expect(screen.getByText("도우미 미설치")).toBeInTheDocument();

    unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();

    // 도우미가 응답하는 상태로 다시 진입하면 버튼이 활성화된다.
    const installedCalls = stubFetch({ helperHealth: () => jsonResponse({ ok: true, version: "1" }) });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-helper")).toContain("응답 확인"));
    const testOpenButton = screen.getByRole("button", { name: "테스트로 열기 (도우미 설치 후)" });
    expect(testOpenButton).toBeEnabled();

    fireEvent.click(testOpenButton);

    // 버튼을 누르면 도우미를 호출하기 전에 /health로 다시 확인한다("버튼 누를 때 재확인").
    await waitFor(() =>
      expect(installedCalls.filter((call) => call.url.endsWith("/health")).length).toBeGreaterThanOrEqual(2),
    );
    await waitFor(() => expect(installedCalls.some((call) => call.url.endsWith("/open"))).toBe(true));
  });

  it("[FR-013-AC10] GET /api/helper/token이 null이면 '미설치 · 토큰 파일 없음'을 보여준다", async () => {
    stubFetch({
      helperHealth: () => jsonResponse({ ok: true, version: "1" }),
      helperToken: () => jsonResponse({ token: null }),
    });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-helper")).toContain("미설치 · 토큰 파일 없음"));
    expect(screen.getByRole("button", { name: "테스트로 열기 (도우미 설치 후)" })).toBeDisabled();
    expect(screen.getByText("도우미 미설치")).toBeInTheDocument();
  });

  it("[FR-013-E2] 403 → 인라인 '도우미 인증 실패 · 도우미를 다시 설치하세요'", async () => {
    stubFetch({
      helperHealth: () => jsonResponse({ ok: true, version: "1" }),
      helperOpen: () =>
        jsonResponse({ code: "FORBIDDEN_ORIGIN", message: "허용되지 않은 출처입니다" }, 403),
    });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-helper")).toContain("응답 확인"));
    fireEvent.click(screen.getByRole("button", { name: "테스트로 열기 (도우미 설치 후)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "도우미 인증 실패 · 도우미를 다시 설치하세요",
    );
    // 403은 도우미가 응답한 것이므로 미설치 안내(HelperMissingDialog)를 띄우지 않는다.
    expect(screen.queryByTestId("helper-missing-dialog")).not.toBeInTheDocument();
  });
});
