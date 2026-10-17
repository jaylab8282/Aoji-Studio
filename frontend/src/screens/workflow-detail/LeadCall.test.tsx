import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";
import type { AgentDef, HostOs, Workflow } from "../../api/types";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import { leadSessionCommand } from "../../lib/text";

/** 03 `팀장 호출 · 터미널 열기`의 명령 = `config.defaultSessionCommand + " --agent " + lead`(FR-013-AC2, ADR-77 결정 3). */
const MACOS_DEFAULT = 'cd "/Users/jaybee/Desktop/AojiStudio" && claude';
const WSL_DEFAULT = "wsl -d Ubuntu-24.04 --cd /home/jaybee/AojiStudio -- bash -lic 'exec claude \"$@\"' claude";
const writeText = vi.fn<(text: string) => Promise<void>>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface OpenCall {
  url: string;
  body: string | null;
}

/** 도우미 `POST /open`은 끝없이 기다려 2초 타임아웃(무응답)이 되게 하고, 서버 토큰 두 개만 응답한다. */
function stubFetch(): OpenCall[] {
  const opens: OpenCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/browser-token")) return jsonResponse({ token: "a".repeat(64) });
      if (url.includes("/api/helper/token")) return jsonResponse({ token: "b".repeat(64) });
      if (url.endsWith("/open")) {
        opens.push({ url, body: typeof init?.body === "string" ? init.body : null });
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  return opens;
}

const workflow: Workflow = {
  name: "개발부서",
  description: "",
  filePath: ".aojistudio/teams/dev.json",
  lead: "dev-lead",
  members: ["dev-01"],
  brokenRefs: [],
  rawMemberCount: 2,
  rawLead: "dev-lead",
  rawMembers: ["dev-01"],
};

const agents: AgentDef[] = ["dev-lead", "dev-01"].map((name) => ({
  name,
  description: "",
  filePath: `.claude/agents/${name}.md`,
  workflow: "개발부서",
  role: name === "dev-lead" ? "lead" : "member",
  duplicateWorkflows: [],
}));

function openMissingDialog(hostOs: HostOs, defaultSessionCommand: string, wslDistro: string | null) {
  const base = buildSnapshotFixture();
  snapshotStore.replace({
    ...base,
    config: { ...base.config, defaultSessionCommand, hostOs, wslDistro },
  });
  render(
    <MemoryRouter>
      <Header
        workflow={workflow}
        skillCount={0}
        liveAgents={{}}
        registryAgents={agents}
        defaultSessionCommand={defaultSessionCommand}
        collectorDown={false}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /팀장 호출 · 터미널 열기/ }));
}

describe("LeadCall (03 팀장 호출 명령)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    snapshotStore.reset();
  });

  it("[FR-013-AC2] 조립 규칙: 명령 = defaultSessionCommand + ' --agent ' + 팀장 name (실행 환경 두 가지)", () => {
    expect(leadSessionCommand(MACOS_DEFAULT, "dev-lead")).toBe('cd "/Users/jaybee/Desktop/AojiStudio" && claude --agent dev-lead');
    expect(leadSessionCommand(WSL_DEFAULT, "dev-lead")).toBe(
      "wsl -d Ubuntu-24.04 --cd /home/jaybee/AojiStudio -- bash -lic 'exec claude \"$@\"' claude --agent dev-lead",
    );
  });

  it("[FR-013-AC2] macos: 도우미 무응답 팝업에 `cd \"<hostPath>\" && claude --agent <팀장>` 표시, 복사도 같은 글자", async () => {
    const opens = stubFetch();
    openMissingDialog("macos", MACOS_DEFAULT, null);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    const expected = 'cd "/Users/jaybee/Desktop/AojiStudio" && claude --agent dev-lead';
    expect(screen.getByText(expected)).toBeInTheDocument();
    // 도우미에는 명령 문자열이 아니라 target과 leadName만 간다(FR-013-AC6).
    expect(JSON.parse(opens[0]?.body ?? "{}")).toEqual({ target: "lead", leadName: "dev-lead" });

    fireEvent.click(screen.getByRole("button", { name: "명령 복사" }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(screen.getByText("helper/install.sh로 설치한 뒤 다시 시도하세요")).toBeInTheDocument();
  });

  it("[FR-013-AC2] wsl: 팝업에 `wsl -d <배포판> --cd <hostPath> -- bash -lic 'exec claude \"$@\"' claude --agent <팀장>` 표시, 설치 안내는 helper/windows/install.ps1", async () => {
    const opens = stubFetch();
    openMissingDialog("wsl", WSL_DEFAULT, "Ubuntu-24.04");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    const expected = "wsl -d Ubuntu-24.04 --cd /home/jaybee/AojiStudio -- bash -lic 'exec claude \"$@\"' claude --agent dev-lead";
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(JSON.parse(opens[0]?.body ?? "{}")).toEqual({ target: "lead", leadName: "dev-lead" });
    expect(screen.getByText("helper/windows/install.ps1로 설치한 뒤 다시 시도하세요")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "명령 복사" }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith(expected);
  });
});
