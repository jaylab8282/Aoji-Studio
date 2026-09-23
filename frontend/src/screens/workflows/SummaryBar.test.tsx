import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SummaryBar } from "./SummaryBar";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import type { AgentDef, Registry } from "../../api/types";

function buildAgent(name: string, workflow: string | null): AgentDef {
  return {
    name,
    description: "",
    filePath: `.claude/agents/${name}.md`,
    workflow,
    role: workflow === null ? null : "member",
    duplicateWorkflows: [],
  };
}

function renderSummaryBar(registryOverrides: Partial<Registry> = {}) {
  const fixture = buildSnapshotFixture();
  render(
    <MemoryRouter>
      <SummaryBar registry={{ ...fixture.registry, ...registryOverrides }} live={fixture.live} />
    </MemoryRouter>,
  );
}

describe("SummaryBar", () => {
  it("[FR-001-E2] writable=false → '+ 에이전트 만들기' 비활성 + '쓰기 권한 없음'", () => {
    renderSummaryBar({ writable: false });

    expect(screen.getByRole("button", { name: "+ 에이전트 만들기" })).toBeDisabled();
    expect(screen.getByText("쓰기 권한 없음")).toBeInTheDocument();
  });

  it("[FR-001-E2] writable=true → '+ 에이전트 만들기' 활성", () => {
    renderSummaryBar({ writable: true });

    expect(screen.getByRole("button", { name: "+ 에이전트 만들기" })).toBeEnabled();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
  });

  it("[FR-004-AC7] 워크플로우 밖 에이전트 N>0 → '워크플로우 밖 에이전트 N · 가져오기' 활성", () => {
    renderSummaryBar({ agents: [buildAgent("solo-agent", null), buildAgent("dev-02", "워크플로우A")], agentCount: 2 });

    const link = screen.getByRole("button", { name: "워크플로우 밖 에이전트 1 · 가져오기" });
    expect(link).toBeEnabled();
  });

  it("[FR-004-AC7] 워크플로우 밖 에이전트 0 → '워크플로우 밖 에이전트 0' 비활성('· 가져오기' 없음)", () => {
    renderSummaryBar({ agents: [buildAgent("dev-02", "워크플로우A")], agentCount: 1 });

    const link = screen.getByRole("button", { name: "워크플로우 밖 에이전트 0" });
    expect(link).toBeDisabled();
    expect(screen.queryByText(/가져오기/)).not.toBeInTheDocument();
  });
});
