import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentsDirMissing } from "./AgentsDirMissing";
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
        <AgentsDirMissing hostPath="/Users/jaybee/Desktop/JayStudio" />
      </MemoryRouter>,
    );

    expect(screen.getByText("에이전트 폴더를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText("/Users/jaybee/Desktop/JayStudio/.claude/agents")).toBeInTheDocument();
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
        <AgentsDirMissing hostPath="/Users/jaybee/Desktop/JayStudio" />
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
        <AgentsDirMissing hostPath="/Users/jaybee/Desktop/JayStudio" />
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
        <AgentsDirMissing hostPath="/Users/jaybee/Desktop/JayStudio" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));

    const message = await screen.findByText(
      "다시 읽지 못했습니다 · 서버에 연결할 수 없습니다 · 다시 시도하세요",
    );
    expect(message.textContent).not.toMatch(/TypeError|Failed to fetch/);
  });
});
