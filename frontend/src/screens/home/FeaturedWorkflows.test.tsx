import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FeaturedWorkflows } from "./FeaturedWorkflows";
import { workflowCardBorder } from "../../lib/derive/workflowCardBorder";
import type { AgentLive, Live, Registry, Status, Workflow } from "../../api/types";

function buildWorkflow(name: string, lead: string, members: string[]): Workflow {
  return {
    name,
    description: `${name} 설명`,
    filePath: `.jaystudio/teams/${name}.json`,
    lead,
    members,
    brokenRefs: [],
    rawMemberCount: members.length + 1,
  };
}

function buildRegistry(workflows: Workflow[]): Registry {
  return {
    revision: 1,
    scannedAt: "2026-09-22T10:00:00+09:00",
    agentsDirMissing: false,
    writable: true,
    agentCount: workflows.length,
    skillCount: 4,
    agents: [],
    workflows,
    formatErrors: [],
    hookConfigured: true,
  };
}

function buildAgentLive(name: string, status: Status): AgentLive {
  return {
    name,
    status,
    currentTool: null,
    sessionStartedAt: null,
    childCount: 0,
    cwd: null,
    parentLabel: null,
    lastEventAt: null,
    lastEvent: null,
  };
}

function buildLive(agents: Record<string, AgentLive>): Live {
  return { lastReceivedAt: null, everReceived: true, agents, lobby: [], undefinedSubagents: [] };
}

function renderFeatured(live: Live) {
  const registry = buildRegistry([buildWorkflow("워크플로우A", "dev-lead", ["dev-02"])]);
  return render(
    <MemoryRouter>
      <FeaturedWorkflows registry={registry} live={live} />
    </MemoryRouter>,
  );
}

describe("FeaturedWorkflows", () => {
  it("[FR-006-AC5] 대표 카드 테두리도 02와 같은 `workflowCardBorder`를 쓴다: running>0·waiting>0 → running-border", () => {
    renderFeatured(
      buildLive({
        "dev-lead": buildAgentLive("dev-lead", "running"),
        "dev-02": buildAgentLive("dev-02", "waiting"),
      }),
    );

    const card = screen.getByRole("link", { name: /워크플로우A/ });
    const expected = workflowCardBorder({ running: 1, waiting: 1, leadMissing: false });

    expect(expected).toBe("border-running-border");
    expect(card.className).toContain(expected);
    // 칩은 권한 대기를 우선하지만(문구 유지) 테두리는 running이 우선한다.
    expect(screen.getByText("권한 대기 1명")).toBeInTheDocument();
    expect(card.className).not.toContain("border-waiting");
  });

  it("[FR-006-AC5] 대표 카드 테두리: running=0·waiting>0 → waiting, 모두 대기 → border", () => {
    const waitingOnly = renderFeatured(buildLive({ "dev-02": buildAgentLive("dev-02", "waiting") }));
    expect(screen.getByRole("link", { name: /워크플로우A/ }).className).toContain(
      workflowCardBorder({ running: 0, waiting: 1, leadMissing: false }),
    );
    waitingOnly.unmount();

    renderFeatured(buildLive({}));
    expect(screen.getByRole("link", { name: /워크플로우A/ }).className).toContain(
      workflowCardBorder({ running: 0, waiting: 0, leadMissing: false }),
    );
  });
});
