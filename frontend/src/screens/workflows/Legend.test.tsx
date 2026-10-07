import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Legend } from "./Legend";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import type { AgentLive } from "../../api/types";

function liveAgent(name: string, status: AgentLive["status"]): AgentLive {
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

describe("Legend", () => {
  it("[FR-006-AC5] 범례 '작업 중 N · 권한·입력 대기 N · 대기 N' — 상태 사각형 + 상태색 글자 + 고정폭 수", () => {
    const fixture = buildSnapshotFixture();
    const names = ["a-run", "b-wait", "c-idle", "d-idle"];
    const registry = {
      ...fixture.registry,
      agents: names.map((name) => ({
        name,
        description: "",
        filePath: `.claude/agents/${name}.md`,
        workflow: null,
        role: null,
        duplicateWorkflows: [],
      })),
    };
    const agents: Record<string, AgentLive> = {
      "a-run": liveAgent("a-run", "running"),
      "b-wait": liveAgent("b-wait", "waiting"),
    };
    render(<Legend registry={registry} live={{ ...fixture.live, agents }} />);

    const group = screen.getByRole("group", { name: "상태 범례" });
    const items = Array.from(group.querySelectorAll("[data-status]"));
    expect(items.map((item) => item.getAttribute("data-status"))).toEqual(["running", "waiting", "idle"]);
    expect(items.map((item) => item.firstElementChild?.className.includes("rounded-dot"))).toEqual([true, true, true]);
    expect(within(group).getByText(/^작업 중/)).toHaveClass("text-live");
    expect(within(group).getByText(/^권한·입력 대기/)).toHaveClass("text-waiting");
    expect(within(group).getByText(/^대기/)).toHaveClass("text-text-muted");
    const counts = Array.from(group.querySelectorAll("b")).map((b) => b.textContent);
    expect(counts).toEqual(["1", "1", "2"]);
    for (const b of group.querySelectorAll("b")) expect(b).toHaveClass("font-mono");
  });
});
