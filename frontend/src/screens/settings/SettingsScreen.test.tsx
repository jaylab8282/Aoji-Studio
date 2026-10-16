import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "./SettingsScreen";
import type { Registry } from "../../api/types";
import { snapshotStore } from "../../state/snapshotStore";
import { usageSignalStore } from "../../state/usageSignalStore";
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

/** 카드(`<section aria-label>` = region). */
function card(name: string): HTMLElement {
  return screen.getByRole("region", { name });
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
      expect(rowText("settings-row-mount-path")).toContain("/Users/jaybee/Desktop/AojiStudio"),
    );
    // 컨테이너 마운트 경로는 화면 어디에도 없다(ADR-20).
    expect(screen.queryByText(/\/workspace/)).not.toBeInTheDocument();
  });

  it("[FR-001-AC5] 경로 읽기 전용 텍스트, input 요소 없음", async () => {
    stubFetch();
    const { container } = renderScreen();

    await waitFor(() =>
      expect(rowText("settings-row-mount-path")).toContain("/Users/jaybee/Desktop/AojiStudio"),
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
    expect(within(card("수집")).getByRole("button", { name: "설정 예시 복사" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
    // v1.2.0: 상태줄 연동 카드에도 `설정 예시 복사`가 있다(DOM 순서: 폴더 → 수집 → 전역 → Claude 열기 → 상태줄).
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "다시 읽기",
      "설정 예시 복사",
      "테스트로 열기",
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
    fireEvent.click(within(card("수집")).getByRole("button", { name: "설정 예시 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(settings.hookSettingsExample));
    expect(await screen.findByRole("button", { name: "복사됨" })).toBeInTheDocument();
  });

  it("[FR-014-AC3] hookConfigured true → '있음'(시안), false → '없음'(danger)", async () => {
    stubFetch();
    const { unmount } = renderScreen();

    await waitFor(() => expect(rowText("settings-row-hook")).toContain("있음"));
    expect(within(screen.getByTestId("settings-row-hook")).getByText("있음")).toHaveClass("text-live");
    expect(rowText("settings-row-hook")).toContain(".claude/settings.json");
    unmount();

    putRegistryInStore({ hookConfigured: false });
    stubFetch({ settings: () => jsonResponse(buildSettingsFixture({ hookConfigured: false })) });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-hook")).toContain("없음"));
    expect(rowText("settings-row-hook")).not.toContain("있음");
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
    // 요청 중에는 `다시 읽는 중…`이고 버튼이 잠긴다.
    expect(screen.getByRole("button", { name: "다시 읽는 중…" })).toBeDisabled();

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
    expect(rowText("settings-row-format-errors")).toContain("읽지 못한 정의 파일 1개");
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
      screen.getByText("/Users/jaybee/Desktop/AojiStudio/.claude/agents"),
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

    const value = await screen.findByText("쓰기 권한 없음");
    expect(value).toHaveClass("text-danger");
    expect(screen.queryByText(/추가·수정·삭제 가능/)).not.toBeInTheDocument();
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
    expect(rowText("settings-row-default-session")).toBe(settings.defaultSessionCommand);
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
    const testOpen = screen.getByRole("button", { name: "테스트로 열기" });
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
    for (const button of screen.getAllByRole("button", { name: "설정 예시 복사" })) {
      expect(button).toBeDisabled();
    }
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
    // 프로젝트 폴더 카드의 Alert 하나(role="alert")에만 그린다.
    expect(messages).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "허용되지 않은 출처입니다 · http://127.0.0.1:4180 주소로 다시 접속하세요",
    );
    expect(screen.queryByTestId("settings-row-agents")).not.toBeInTheDocument();
    // 복구 수단인 `다시 읽기`는 그대로 남는다.
    expect(screen.getByRole("button", { name: "다시 읽기" })).toBeEnabled();
  });

  it("GET /api/settings 실패 → '다시 시도'로 다시 불러와 값을 채운다", async () => {
    let attempt = 0;
    const calls = stubFetch({
      settings: () => {
        attempt += 1;
        return attempt === 1
          ? jsonResponse({ code: "INTERNAL", message: "설정을 읽지 못했습니다" }, 500)
          : jsonResponse(buildSettingsFixture());
      },
    });
    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("설정을 읽지 못했습니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() =>
      expect(rowText("settings-row-mount-path")).toContain("/Users/jaybee/Desktop/AojiStudio"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(calls.filter((call) => call.url.includes("/api/settings"))).toHaveLength(2);
  });

  it("[data-wf 07-2~07-5] 제목·부제 → 카드 3개(폴더·수집 열 / Claude 열기), h1·main 없음", async () => {
    stubFetch();
    const { container } = renderScreen();

    await waitFor(() =>
      expect(rowText("settings-row-mount-path")).toContain("/Users/jaybee/Desktop/AojiStudio"),
    );
    // D-125: 본문에 h1·`<main>`이 없다(상단 바 h1 하나 · AppShell `<main>` 하나).
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll("[data-wf]")).map((el) => el.getAttribute("data-wf")),
    ).toEqual(["07-2", "07-3", "07-5", "07-7", "07-4", "07-6"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "설정",
      "프로젝트 폴더",
      "수집",
      "전역 Claude 설정 연결",
      "Claude 열기",
      "상태줄 연동",
    ]);
    expect(
      screen.getByText("읽기 전용 · 웹에서 바꾸지 않습니다. 값은 마운트한 폴더와 실행 설정에서 옵니다."),
    ).toBeInTheDocument();
    // `읽기 전용` 칩은 프로젝트 폴더·전역 연결 카드에 둘.
    expect(screen.getAllByText("읽기 전용", { selector: "span" })).toHaveLength(2);
    const description = container.querySelector('[data-wf="07-4"] > p');
    expect(description?.textContent).toBe(
      "에이전트 워크플로우의 Claude 열기 · 기본 세션은 claude를, 워크플로우 상세의 팀장 호출은 그 워크플로우 팀장 세션을 macOS 기본 터미널에서 AojiStudio 폴더 기준으로 엽니다.",
    );
    expect(Array.from(description?.querySelectorAll("b") ?? []).map((b) => b.textContent)).toEqual([
      "Claude 열기 · 기본 세션",
      "팀장 호출",
    ]);
    expect(
      screen.getByText("폴더는 컨테이너를 실행할 때 마운트로 정해지며 웹에서 바꿀 수 없습니다"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("웹은 settings.json을 쓰지 않습니다. 예시를 복사해 직접 붙여 넣으세요"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("명령 복사 = 기본 세션 명령 · 팀장 명령은 워크플로우 상세에서 복사합니다"),
    ).toBeInTheDocument();
    // ADR-74: allowedHttpHookUrlsNote `.help` 한 줄(서버 값 그대로).
    expect(screen.getByTestId("settings-hook-note")).toHaveTextContent(
      "allowedHttpHookUrls가 설정되어 있으면 수집 주소를 허용 목록에 추가하세요",
    );
    expect(rowText("settings-row-terminal-app")).toBe("macOS 기본 터미널");
    expect(rowText("settings-row-collect-url")).toBe("http://127.0.0.1:4180/hooks/events");
    expect(rowText("settings-row-teams")).toBe(".aojistudio/teams/*.json · 팀장·팀원 목록");
    expect(rowText("settings-row-trash")).toBe(".aojistudio/trash/ · 제거한 정의 파일·스킬 보관");
    expect(rowText("settings-row-retention")).toBe("30일 · 일별 집계(스킬 사용·MCP 호출·토큰 수)는 계속 보관");
    expect(rowText("settings-row-host-os")).toBe("맥북");
    expect(rowText("settings-row-agents")).toBe(".claude/agents/ · 정의 7개");
    expect(rowText("settings-row-skills")).toBe(".claude/skills/ · 3개");
    expect(rowText("settings-row-writable")).toBe("있음 · 에이전트·스킬 추가·수정·삭제 가능");
    expect(rowText("settings-row-format-errors")).toBe("읽지 못한 정의 파일 0개");
  });

  it("[FR-001-E2] 형식 오류 N > 0 → danger", async () => {
    putRegistryInStore({
      formatErrors: [{ kind: "agent", file: "broken.md", message: "name 누락" }],
    });
    stubFetch();
    renderScreen();

    await waitFor(() =>
      expect(rowText("settings-row-format-errors")).toBe("읽지 못한 정의 파일 1개"),
    );
    expect(screen.getByText("읽지 못한 정의 파일 1개")).toHaveClass("text-danger");
  });

  it("[FR-014] teamsPath·trashPath는 서버 값 그대로 표시", async () => {
    const base = buildSettingsFixture();
    const teamsPath = ".aojistudio/teams/*.json";
    const trashPath = ".aojistudio/trash/";
    stubFetch({ settings: () => jsonResponse({ ...base, teamsPath, trashPath }) });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-teams")).toContain(teamsPath));
    expect(rowText("settings-row-trash")).toContain(trashPath);
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
    expect(screen.getByRole("button", { name: "테스트로 열기" })).toBeDisabled();
    expect(screen.getByText("도우미 미설치")).toBeInTheDocument();

    unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();

    // 도우미가 응답하는 상태로 다시 진입하면 버튼이 활성화된다.
    const installedCalls = stubFetch({ helperHealth: () => jsonResponse({ ok: true, version: "1" }) });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-helper")).toContain("설치됨"));
    // `설치됨 · host:port`(settings.helperUrl에서 뽑는다).
    await waitFor(() => expect(rowText("settings-row-helper")).toBe("맥북 도우미 설치됨 · 127.0.0.1:4181"));
    const testOpenButton = screen.getByRole("button", { name: "테스트로 열기" });
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
    expect(screen.getByRole("button", { name: "테스트로 열기" })).toBeDisabled();
    expect(screen.getByText("도우미 미설치")).toBeInTheDocument();
  });

  it("[FR-013-E2] 403 → 인라인 '도우미 인증 실패 · 도우미를 다시 설치하세요'", async () => {
    stubFetch({
      helperHealth: () => jsonResponse({ ok: true, version: "1" }),
      helperOpen: () =>
        jsonResponse({ code: "FORBIDDEN_ORIGIN", message: "허용되지 않은 출처입니다" }, 403),
    });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-helper")).toContain("설치됨"));
    fireEvent.click(screen.getByRole("button", { name: "테스트로 열기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "도우미 인증 실패 · 도우미를 다시 설치하세요",
    );
    // 403은 도우미가 응답한 것이므로 미설치 안내(HelperMissingDialog)를 띄우지 않는다.
    expect(screen.queryByTestId("helper-missing-dialog")).not.toBeInTheDocument();
  });

  // ── v1.2.0 (T-R4-19): WSL 실행 환경 · 상태줄 연동 · 전역 Claude 설정 연결 ─────────────────────

  const WSL_PATH = "/home/jaybee/AojiStudio";
  const WSL_DEFAULT = `wsl -d Ubuntu-24.04 --cd ${WSL_PATH} -- claude`;
  const WSL_LEAD = `wsl -d Ubuntu-24.04 --cd ${WSL_PATH} -- claude --agent <팀장 name>`;

  function wslSettings() {
    return buildSettingsFixture({
      hostOs: "wsl",
      wslDistro: "Ubuntu-24.04",
      hostPath: WSL_PATH,
      terminalApp: "Windows Terminal",
      defaultSessionCommand: WSL_DEFAULT,
      leadSessionCommandTemplate: WSL_LEAD,
    });
  }

  /** `useHelperOpen`·미설치 안내는 `config.hostOs`를 쓰므로 스냅샷도 WSL로 맞춘다. */
  function putWslConfigInStore() {
    const snapshot = buildSnapshotFixture();
    snapshotStore.replace({
      ...snapshot,
      config: { ...snapshot.config, hostOs: "wsl", wslDistro: "Ubuntu-24.04", hostPath: WSL_PATH, defaultSessionCommand: WSL_DEFAULT },
      registry: registryFixture(),
    });
  }

  it("[FR-014-AC4] WSL 실행 환경에서 마운트 폴더는 WSL 경로 그대로 표시된다", async () => {
    putWslConfigInStore();
    stubFetch({ settings: () => jsonResponse(wslSettings()) });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-mount-path")).toBe(WSL_PATH));
    expect(screen.queryByText(/\/workspace|\/mnt\//)).not.toBeInTheDocument();
  });

  it("[FR-013-AC5] macos: 실행 환경 `맥북` · 터미널 앱 · 기본 세션·팀장 두 명령 · 설명의 터미널 이름", async () => {
    const settings = buildSettingsFixture();
    stubFetch();
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-default-session")).toBe(settings.defaultSessionCommand));
    const claude = card("Claude 열기");
    expect(rowText("settings-row-host-os")).toBe("맥북");
    expect(rowText("settings-row-terminal-app")).toBe("macOS 기본 터미널");
    expect(rowText("settings-row-lead-session")).toContain(settings.leadSessionCommandTemplate);
    expect(claude.querySelector(":scope > p")?.textContent).toContain("macOS 기본 터미널에서 AojiStudio 폴더 기준으로 엽니다.");
  });

  it("[FR-013-AC5] wsl: 실행 환경 `WSL · Ubuntu-24.04`(배포판 고정폭) · `Windows Terminal` · WSL 두 명령 · 설명 · 명령 복사 = WSL 기본 세션", async () => {
    putWslConfigInStore();
    stubFetch({ settings: () => jsonResponse(wslSettings()) });
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-default-session")).toBe(WSL_DEFAULT));
    const claude = card("Claude 열기");
    expect(rowText("settings-row-host-os")).toBe("WSL · Ubuntu-24.04");
    expect(within(screen.getByTestId("settings-row-host-os")).getByText("Ubuntu-24.04")).toHaveClass("font-mono");
    expect(rowText("settings-row-terminal-app")).toBe("Windows Terminal");
    expect(rowText("settings-row-lead-session")).toContain(WSL_LEAD);
    expect(claude.querySelector(":scope > p")?.textContent).toBe(
      "에이전트 워크플로우의 Claude 열기 · 기본 세션은 claude를, 워크플로우 상세의 팀장 호출은 그 워크플로우 팀장 세션을 Windows Terminal 새 탭에서 WSL AojiStudio 폴더 기준으로 엽니다.",
    );
    expect(claude).not.toHaveTextContent("&& claude");
    expect(claude).not.toHaveTextContent("macOS 기본 터미널");

    fireEvent.click(within(claude).getByRole("button", { name: "명령 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(WSL_DEFAULT));
  });

  it("[FR-013-AC10] wsl 도우미 설치됨 → `Windows 도우미 설치됨 · host:port`, 미응답 → `미설치 · helper/windows/install.ps1로 설치`·`테스트로 열기` 비활성·안내 팝업은 wsl 설치 스크립트", async () => {
    putWslConfigInStore();
    stubFetch({
      settings: () => jsonResponse(wslSettings()),
      helperHealth: () => jsonResponse({ ok: true, version: "1" }),
    });
    const installed = renderScreen();
    await waitFor(() => expect(rowText("settings-row-helper")).toBe("Windows 도우미 설치됨 · 127.0.0.1:4181"));
    installed.unmount();
    vi.unstubAllGlobals();

    vi.useFakeTimers();
    stubFetch({ settings: () => jsonResponse(wslSettings()), helperHealth: (signal) => neverResolving(signal) });
    renderScreen();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(rowText("settings-row-helper")).toContain("미설치 · helper/windows/install.ps1로 설치");
    expect(rowText("settings-row-helper")).not.toContain("helper/install.sh");
    expect(screen.getByRole("button", { name: "테스트로 열기" })).toBeDisabled();
    expect(screen.getByText("도우미 미설치")).toBeInTheDocument();
  });

  it("[FR-013-AC10][FR-013-E1] wsl `테스트로 열기`가 무응답이면 wsl 설치 스크립트 안내와 WSL 기본 세션 명령 팝업이 뜬다", async () => {
    putWslConfigInStore();
    let healthy = true;
    stubFetch({
      settings: () => jsonResponse(wslSettings()),
      helperHealth: (signal) => (healthy ? jsonResponse({ ok: true, version: "1" }) : neverResolving(signal)),
    });
    renderScreen();
    await waitFor(() => expect(rowText("settings-row-helper")).toContain("Windows 도우미 설치됨"));

    healthy = false;
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "테스트로 열기" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const dialog = screen.getByTestId("helper-missing-dialog");
    expect(dialog).toHaveTextContent("helper/windows/install.ps1로 설치한 뒤 다시 시도하세요");
    expect(dialog).toHaveTextContent(WSL_DEFAULT);
  });

  it("[FR-014-AC6] 상태줄 연동 카드: 설명 · 예시 블록(서버 값 그대로, `<쓰던 상태줄 명령>` 포함) · `설정 예시 복사` → 클립보드 = 예시 → `복사됨`", async () => {
    const settings = buildSettingsFixture();
    stubFetch();
    renderScreen();

    const statusline = await screen.findByRole("region", { name: "상태줄 연동" });
    expect(statusline).toHaveAttribute("data-wf", "07-6");
    expect(
      within(statusline).getByText(
        "Claude Code 상태줄 입력에서 구독 플랜과 5시간·주간 한도를 Aoji Studio로 보냅니다. 비용 화면의 한도 값이 여기서 옵니다.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(within(statusline).getByText(/"statusLine"/)).toBeInTheDocument());
    const block = statusline.querySelector("pre");
    expect(block?.textContent).toBe(settings.statusline.settingsExample);
    expect(block).toHaveClass("bg-inset", "font-mono", "whitespace-pre-wrap");
    expect(block?.textContent).toContain("<쓰던 상태줄 명령>");
    expect(within(statusline).getByText("Claude Code 설정 파일에 직접 넣습니다 · 웹은 쓰지 않습니다")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("settings-row-statusline-previous")).getByText("<쓰던 상태줄 명령>"),
    ).toHaveClass("font-mono");
    expect(screen.getByTestId("settings-row-statusline-previous")).toHaveTextContent(
      "이미 쓰던 상태줄 명령이 있으면 <쓰던 상태줄 명령> 자리에 넣으세요. 그 명령의 출력이 그대로 상태줄에 보입니다. 없으면 이 자리를 지웁니다",
    );
    expect(
      within(statusline).getByText(
        "Claude Code CLI 세션이 돌 때만 값이 들어옵니다. 데스크톱 앱 세션에서는 상태줄이 돌지 않을 수 있습니다.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(statusline).getByRole("button", { name: "설정 예시 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(settings.statusline.settingsExample));
    expect(await within(statusline).findByRole("button", { name: "복사됨" })).toBeInTheDocument();
    // 수집 카드의 복사 버튼은 그대로다(둘은 서로 다른 값을 복사한다).
    expect(within(card("수집")).getByRole("button", { name: "설정 예시 복사" })).toBeEnabled();
  });

  it("[FR-014-AC6] 마지막 수신 `hh:mm:ss · N분 전`", async () => {
    const receivedAt = new Date(Date.now() - 3.5 * 60_000).toISOString();
    stubFetch({
      settings: () =>
        jsonResponse(buildSettingsFixture({ statusline: { ...buildSettingsFixture().statusline, lastReceivedAt: receivedAt } })),
    });
    renderScreen();

    await waitFor(() =>
      expect(rowText("settings-row-statusline-received")).toMatch(/^\d{2}:\d{2}:\d{2} · 3분 전$/),
    );
  });

  it("[FR-027-E1] 상태줄을 받은 적 없으면 `받은 적 없음`(muted)", async () => {
    stubFetch();
    renderScreen();

    await waitFor(() => expect(rowText("settings-row-statusline-received")).toBe("받은 적 없음"));
    expect(within(screen.getByTestId("settings-row-statusline-received")).getByText("받은 적 없음")).toHaveClass(
      "text-text-muted",
    );
  });

  it("전역 Claude 설정 연결 카드: 4항목 고정 순서 · 연결됨 `연결됨 · 읽기 전용` / `연결 안 됨` · 연결 방법 안내 항상", async () => {
    stubFetch({
      settings: () =>
        jsonResponse(
          buildSettingsFixture({
            globalClaude: {
              items: [
                { key: "claudeJson", connected: true },
                { key: "settings", connected: true },
                { key: "plugins", connected: false },
                { key: "projects", connected: false },
              ],
              readAt: null,
            },
          }),
        ),
    });
    renderScreen();

    const global = await screen.findByRole("region", { name: "전역 Claude 설정 연결" });
    expect(global).toHaveAttribute("data-wf", "07-7");
    expect(within(global).getByText("읽기 전용", { selector: "span" })).toBeInTheDocument();
    expect(
      within(global).getByText(
        "MCP·비용·한도를 보려고 사용자 홈의 Claude Code 파일 4개를 읽기 전용으로 연결합니다. 자격증명 파일은 연결하지 않습니다.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(within(global).getAllByText("연결됨 · 읽기 전용")).toHaveLength(2));
    expect(within(global).getAllByText("연결 안 됨")).toHaveLength(2);
    for (const label of ["항목", "쓰는 곳", "상태"]) {
      expect(within(global).getByText(label)).toBeInTheDocument();
    }
    // 항목·쓰는 곳은 정적이고 순서가 고정이다.
    const text = global.textContent ?? "";
    const order = ["~/.claude.json", "MCP 설정 · 한도 캐시", "~/.claude/settings.json", "플러그인 활성 정보", "~/.claude/plugins/", "플러그인 MCP 정의", "~/.claude/projects/", "대화 기록 토큰 수(비용)"];
    const positions = order.map((item) => text.indexOf(item));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(within(global).getAllByText("연결 안 됨")[0]).toHaveClass("text-danger");
    expect(within(global).getByText(/연결 방법 · /)).toHaveTextContent(
      "연결 방법 · .env에 홈 경로를 넣고 컨테이너를 다시 시작하면 4개 항목이 읽기 전용으로 연결됩니다. 웹은 이 파일들을 쓰지 않습니다.",
    );
    expect(within(global).getByText(".env")).toHaveClass("font-mono");
  });

  it("전역 Claude 설정 연결: 4항목 모두 연결 안 됨이어도 연결 방법 안내가 보인다(대역 상태)", async () => {
    stubFetch();
    renderScreen();

    const global = await screen.findByRole("region", { name: "전역 Claude 설정 연결" });
    await waitFor(() => expect(within(global).getAllByText("연결 안 됨")).toHaveLength(4));
    expect(within(global).queryByText("연결됨 · 읽기 전용")).not.toBeInTheDocument();
    expect(within(global).getByText(/연결 방법 · /)).toBeInTheDocument();
  });

  it("[FR-014-AC7] 07에는 입력 요소가 없고 버튼은 보조 동작뿐이다(다시 읽기·설정 예시 복사×2·테스트로 열기·명령 복사)", async () => {
    stubFetch();
    const { container } = renderScreen();

    await waitFor(() => expect(rowText("settings-row-statusline-received")).toBe("받은 적 없음"));
    expect(container.querySelectorAll("input, textarea, select, [contenteditable='true']")).toHaveLength(0);
    for (const role of ["textbox", "searchbox", "checkbox", "radio", "combobox", "switch"] as const) {
      expect(screen.queryAllByRole(role)).toHaveLength(0);
    }
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.textContent)
        .sort(),
    ).toEqual(["다시 읽기", "명령 복사", "설정 예시 복사", "설정 예시 복사", "테스트로 열기"].sort());
  });

  it("[카드 순서] 가로형 2열 DOM(폴더 → 수집 → 전역 / Claude 열기 → 상태줄) · 세로형 1열 순서(폴더 → 수집 → Claude 열기 → 상태줄 → 전역)", async () => {
    stubFetch();
    const { container } = renderScreen();
    await screen.findByRole("region", { name: "상태줄 연동" });

    const cards = Array.from(container.querySelectorAll("section[data-wf]")).filter((el) => el.getAttribute("data-wf") !== "07-2");
    const grid = cards[0]?.parentElement?.parentElement;
    expect(grid).toHaveClass("grid-cols-2", "portrait:flex-col");
    const columns = Array.from(grid?.children ?? []);
    expect(columns).toHaveLength(2);
    for (const column of columns) expect(column).toHaveClass("portrait:contents");
    // 가로형: 열별 DOM 순서.
    expect(columns.map((column) => Array.from(column.children).map((el) => el.getAttribute("data-wf")))).toEqual([
      ["07-3", "07-5", "07-7"],
      ["07-4", "07-6"],
    ]);
    // 세로형: 열 상자가 풀리고 카드의 order가 폴더 → 수집 → Claude 열기 → 상태줄 → 전역 연결이다.
    const orderOf = (wf: string) => {
      const match = /portrait:order-(\d)/.exec(container.querySelector(`[data-wf="${wf}"]`)?.className ?? "");
      return match === null ? null : Number(match[1]);
    };
    expect(["07-3", "07-5", "07-4", "07-6", "07-7"].map(orderOf)).toEqual([1, 2, 3, 4, 5]);
  });

  it("[usage-changed settings] 신호를 받으면 `GET /api/settings`를 다시 조회해 상태줄 수신 값을 갱신한다(1초 묶음)", async () => {
    usageSignalStore.reset();
    let calls = 0;
    stubFetch({
      settings: () => {
        calls += 1;
        return jsonResponse(
          buildSettingsFixture({
            statusline: {
              ...buildSettingsFixture().statusline,
              lastReceivedAt: calls === 1 ? null : new Date(Date.now() - 90_000).toISOString(),
            },
          }),
        );
      },
    });
    renderScreen();
    await waitFor(() => expect(rowText("settings-row-statusline-received")).toBe("받은 적 없음"));

    act(() => {
      usageSignalStore.signal(["settings"], null);
      usageSignalStore.signal(["settings"], null);
    });
    await waitFor(() => expect(rowText("settings-row-statusline-received")).toMatch(/1분 전$/), { timeout: 3000 });
    expect(calls).toBe(2);
    // 다른 영역 신호는 07을 다시 조회하지 않는다.
    act(() => {
      usageSignalStore.signal(["cost"], null);
    });
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(calls).toBe(2);
    usageSignalStore.reset();
  });
});
