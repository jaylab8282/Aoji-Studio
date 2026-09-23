import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Header } from "./Header";
import type { AgentLive, Status, Workflow } from "../../api/types";

function buildWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "개발부서",
    description: "",
    filePath: ".jaystudio/teams/dev.json",
    lead: "dev-lead",
    members: ["dev-01", "dev-02"],
    brokenRefs: [],
    rawMemberCount: 3,
    ...overrides,
  };
}

function buildLive(statuses: Record<string, Status>): Record<string, AgentLive> {
  return Object.fromEntries(
    Object.entries(statuses).map(([name, status]) => [
      name,
      {
        name,
        status,
        currentTool: null,
        sessionStartedAt: null,
        childCount: 0,
        cwd: null,
        parentLabel: null,
        lastEventAt: null,
        lastEvent: null,
      } satisfies AgentLive,
    ]),
  );
}

function renderHeader(workflow: Workflow, liveAgents: Record<string, AgentLive> = {}) {
  return render(
    <MemoryRouter>
      <Header workflow={workflow} skillCount={4} liveAgents={liveAgents} />
    </MemoryRouter>,
  );
}

describe("Header", () => {
  it("[FR-007-AC9] 칩 렌더", () => {
    renderHeader(buildWorkflow(), buildLive({ "dev-lead": "running", "dev-01": "running", "dev-02": "idle" }));

    expect(screen.getByText("실행 중 2명")).toBeInTheDocument();
  });

  it("[FR-007-AC9] 권한 대기가 있으면 권한 대기 칩이 우선한다", () => {
    renderHeader(buildWorkflow(), buildLive({ "dev-lead": "running", "dev-01": "waiting", "dev-02": "idle" }));

    expect(screen.getByText("권한 대기 1명")).toBeInTheDocument();
    expect(screen.queryByText("실행 중 1명")).not.toBeInTheDocument();
  });

  it("[FR-007-AC9] 모두 대기면 모두 대기 칩", () => {
    renderHeader(buildWorkflow(), buildLive({ "dev-lead": "idle" }));

    expect(screen.getByText("모두 대기")).toBeInTheDocument();
  });

  it("[FR-007-AC8][FR-013-AC4] lead null → 팀장 호출 비활성 + '팀장 없음'", () => {
    renderHeader(buildWorkflow({ lead: null, members: ["dev-01"], rawMemberCount: 1 }));

    const button = screen.getByRole("button", { name: /팀장 호출 · 터미널 열기/ });
    expect(button).toBeDisabled();
    expect(screen.getAllByText("팀장 없음").length).toBeGreaterThan(0);
  });

  it("[FR-007-AC8] lead가 있으면 팀장 호출 버튼이 활성이고 팀장 name을 보여준다", () => {
    renderHeader(buildWorkflow());

    expect(screen.getByRole("button", { name: /팀장 호출 · 터미널 열기/ })).toBeEnabled();
    expect(screen.getByText("dev-lead")).toBeInTheDocument();
    expect(screen.queryByText("팀장 없음")).not.toBeInTheDocument();
  });

  it("[FR-007-AC9] 이름·에이전트 수·스킬 수·되돌아가기 버튼 렌더", () => {
    renderHeader(buildWorkflow());

    expect(screen.getByRole("heading", { name: "개발부서" })).toBeInTheDocument();
    expect(screen.getByText("에이전트 3 · 스킬 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "에이전트 워크플로우로" })).toBeInTheDocument();
  });
});
