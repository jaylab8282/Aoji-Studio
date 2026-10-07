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
      <SummaryBar registry={{ ...fixture.registry, ...registryOverrides }} />
    </MemoryRouter>,
  );
}

describe("SummaryBar", () => {
  it("[FR-006-AC1] 요약 줄 'AojiStudio .claude | 에이전트 N · 스킬 N · 워크플로우 N'(수는 고정폭 b)", () => {
    renderSummaryBar({ agentCount: 21, skillCount: 12 });

    expect(screen.getByRole("heading", { name: "AojiStudio" })).toBeInTheDocument();
    expect(screen.getByText(".claude")).toHaveClass("font-mono");
    const counts = screen.getByTestId("workflows-counts");
    expect(counts.textContent).toMatch(/^에이전트 21 · 스킬 12 · 워크플로우 \d+$/);
    const values = Array.from(counts.querySelectorAll("b"));
    expect(values).toHaveLength(3);
    for (const value of values) expect(value).toHaveClass("font-mono");
  });

  it("[FR-001-E1] agentsDirMissing → 에이전트 수 '-', 링크 '워크플로우 밖 에이전트 - · 가져오기'(활성)", () => {
    renderSummaryBar({ agentsDirMissing: true, agentCount: null, agents: [] });

    expect(screen.getByTestId("workflows-counts").textContent).toMatch(/^에이전트 - · /);
    expect(screen.getByRole("button", { name: "워크플로우 밖 에이전트 - · 가져오기" })).toBeEnabled();
  });

  it("[FR-001-E2] writable=false → '에이전트 만들기' 비활성 + '쓰기 권한 없음'", () => {
    renderSummaryBar({ writable: false });

    expect(screen.getByRole("button", { name: "에이전트 만들기" })).toBeDisabled();
    expect(screen.getByText("쓰기 권한 없음")).toBeInTheDocument();
  });

  it("[FR-001-E2] writable=true → '에이전트 만들기' 활성", () => {
    renderSummaryBar({ writable: true });

    expect(screen.getByRole("button", { name: "에이전트 만들기" })).toBeEnabled();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
  });

  it("[FR-004-AC7] 워크플로우 밖 에이전트 N>0 → '워크플로우 밖 에이전트 N · 가져오기' 활성", () => {
    renderSummaryBar({ agents: [buildAgent("solo-agent", null), buildAgent("dev-02", "워크플로우A")], agentCount: 2 });

    const link = screen.getByRole("button", { name: "워크플로우 밖 에이전트 1 · 가져오기" });
    expect(link).toBeEnabled();
    expect(link.className).toContain("text-link");
  });

  it("[FR-004-AC7][FR-009-AC6] 워크플로우 밖 에이전트 0 → '워크플로우 밖 에이전트 0 · 가져오기' 링크가 그대로 활성(05-R 빈 상태로 연다)", () => {
    renderSummaryBar({ agents: [buildAgent("dev-02", "워크플로우A")], agentCount: 1 });

    const link = screen.getByRole("button", { name: "워크플로우 밖 에이전트 0 · 가져오기" });
    expect(link).toBeEnabled();
    expect(link.className).toContain("text-link");
  });

  it("[FR-004-AC7] 에이전트 만들기는 plus 아이콘 + 글자(추가 버튼, 점선)", () => {
    renderSummaryBar({});
    const button = screen.getByRole("button", { name: "에이전트 만들기" });
    expect(button.querySelector("svg.lucide-plus")).not.toBeNull();
    expect(button.className).toContain("border-dashed");
  });
});
