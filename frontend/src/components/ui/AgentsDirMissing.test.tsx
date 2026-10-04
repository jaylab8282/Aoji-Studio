import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentsDirMissing } from "./AgentsDirMissing";
// ADR-42 정적 단언용: 컴포넌트 소스를 문자열로 읽는다(conventions.md §7 MUST).
import agentsDirMissingSource from "./AgentsDirMissing.tsx?raw";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("AgentsDirMissing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    snapshotStore.reset();
    vi.unstubAllGlobals();
  });

  it("[SCR-04-5][FR-001-E1] 경로·안내 문구 렌더", () => {
    render(
      <MemoryRouter>
        <AgentsDirMissing hostPath="/Users/jaybee/Desktop/AojiStudio" />
      </MemoryRouter>,
    );

    expect(screen.getByText("에이전트 폴더를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText("/Users/jaybee/Desktop/AojiStudio/.claude/agents")).toBeInTheDocument();
  });

  it("[FR-001-AC4] '다시 읽기' 클릭 → rescan 성공 시 snapshotStore.registry 갱신", async () => {
    snapshotStore.replace(buildSnapshotFixture());
    const newRegistry = { ...buildSnapshotFixture().registry, agentsDirMissing: false, revision: 2 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) {
          return jsonResponse({ token: "a".repeat(64) });
        }
        if (url.includes("/api/registry/rescan")) {
          return jsonResponse(newRegistry);
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(
      <MemoryRouter>
        <AgentsDirMissing hostPath="/Users/jaybee/Desktop/AojiStudio" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));

    await waitFor(() => {
      expect(snapshotStore.getSnapshot().registry?.agentsDirMissing).toBe(false);
    });
  });

  it("[FR-001-AC4] '다시 읽기' 실패 → '다시 읽지 못했습니다 · <message>'", async () => {
    snapshotStore.replace(buildSnapshotFixture());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) {
          return jsonResponse({ token: "a".repeat(64) });
        }
        if (url.includes("/api/registry/rescan")) {
          return jsonResponse({ code: "IO_FAILED", message: "다시 읽을 수 없습니다" }, 500);
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(
      <MemoryRouter>
        <AgentsDirMissing hostPath="/Users/jaybee/Desktop/AojiStudio" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));

    expect(await screen.findByText("다시 읽지 못했습니다 · 다시 읽을 수 없습니다")).toBeInTheDocument();
  });

  it("[conventions §4] 알 수 없는 오류 → 공통 문구(내부 오류 표현 노출 없음)", async () => {
    snapshotStore.replace(buildSnapshotFixture());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) {
          return jsonResponse({ token: "a".repeat(64) });
        }
        throw new TypeError("Failed to fetch");
      }),
    );

    render(
      <MemoryRouter>
        <AgentsDirMissing hostPath="/Users/jaybee/Desktop/AojiStudio" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));

    const message = await screen.findByText(
      "다시 읽지 못했습니다 · 서버에 연결할 수 없습니다 · 다시 시도하세요",
    );
    expect(message.textContent).not.toMatch(/TypeError|Failed to fetch/);
  });

  it("[ADR-42] 기본값 → '설정 열기' 표시, 누르면 /settings로 이동", () => {
    // 01·02는 prop을 넘기지 않는다(기본값 = 표시). 이 테스트가 01·02 동작 회귀를 막는다.
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<AgentsDirMissing hostPath="/Users/jaybee/Desktop/AojiStudio" />} />
          <Route path="/settings" element={<p>설정 화면 도착</p>} />
        </Routes>
      </MemoryRouter>,
    );

    const openSettings = screen.getByRole("button", { name: "설정 열기" });
    fireEvent.click(openSettings);

    expect(screen.getByText("설정 화면 도착")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "설정 열기" })).not.toBeInTheDocument();
  });

  it("[ADR-42] 숨김 prop → '설정 열기'가 문서에 없고 '다시 읽기'는 남는다", () => {
    render(
      <MemoryRouter>
        <AgentsDirMissing hostPath="/Users/jaybee/Desktop/AojiStudio" showOpenSettings={false} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "설정 열기" })).not.toBeInTheDocument();
    expect(screen.queryByText("설정 열기")).not.toBeInTheDocument();
    // 07에서도 뜻이 있는 복구 버튼은 남는다(ADR-42). 버튼은 `다시 읽기` 하나뿐이다.
    expect(screen.getByRole("button", { name: "다시 읽기" })).toBeEnabled();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    // 나머지 요소(제목·경로·본문)는 01·02와 같다(ui-spec SCR-04-5).
    expect(screen.getByText("에이전트 폴더를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText("/Users/jaybee/Desktop/AojiStudio/.claude/agents")).toBeInTheDocument();
  });

  it("[ADR-42][conventions §7] 정적 단언 — AgentsDirMissing.tsx가 라우트를 스스로 읽지 않는다", () => {
    // 표시 여부는 화면이 prop으로 알려준다. 공용 컴포넌트가 현재 경로를 판정하면 안 된다.
    expect(agentsDirMissingSource).not.toMatch(/useLocation/);
    expect(agentsDirMissingSource).not.toMatch(/useMatch/);
    expect(agentsDirMissingSource).not.toMatch(/useResolvedPath|useSearchParams|useParams/);
    // `useHref`·`useNavigationType`도 현재 위치를 읽는 수단이다(T-FIX-08 리뷰 probe M7:
    // `useHref(".").includes("settings")`가 위 목록만으로는 통과했다).
    expect(agentsDirMissingSource).not.toMatch(/useHref|useNavigationType/);
    // 주석에도 `window.location`이 없도록 이 단언은 소스 전체를 본다.
    expect(agentsDirMissingSource).not.toMatch(/window\.location|document\.location/);
    // 라우트 경로 문자열과의 비교(`=== "/settings"` 등)가 없다. 좌우 어느 쪽에 문자열이 와도 잡는다
    // (probe M5: `"/settings" === x`는 한쪽 방향만 보는 정규식을 빠져나갔다).
    expect(agentsDirMissingSource).not.toMatch(/[=!]==?\s*["'`]\//);
    expect(agentsDirMissingSource).not.toMatch(/["'`]\/[^"'`]*["'`]\s*[=!]==?/);
    expect(agentsDirMissingSource).not.toMatch(/(startsWith|includes|match)\s*\(\s*["'`]\//);
    // 위 이름 목록은 새 라우터 훅이 생기면 뒤처진다 → react-router-dom에서 가져오는 것 자체를
    // `useNavigate`(이동 수단) 하나로 고정한다. 경로를 읽는 어떤 훅을 들여와도 여기서 걸린다.
    const routerImport = /import\s*\{([^}]*)\}\s*from\s*"react-router-dom"/.exec(agentsDirMissingSource);
    expect(routerImport, "react-router-dom import 구문을 찾지 못했다").not.toBeNull();
    const importedRouterNames = (routerImport?.[1] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== "");
    expect(importedRouterNames).toEqual(["useNavigate"]);
    // prop 방식이라는 근거: 시그니처에 기본값 true인 showOpenSettings가 있다.
    expect(agentsDirMissingSource).toMatch(/showOpenSettings\s*=\s*true/);
  });
});
