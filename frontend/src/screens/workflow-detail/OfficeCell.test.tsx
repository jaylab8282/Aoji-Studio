import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentLive, Live, Status, UndefinedSubagent } from "../../api/types";
import type { Seat } from "../../lib/derive/officeSeats";
import { OfficeCell } from "./OfficeCell";

function agentLive(name: string, overrides: Partial<AgentLive> = {}): AgentLive {
  return {
    name,
    status: "idle",
    currentTool: null,
    sessionStartedAt: null,
    childCount: 0,
    cwd: null,
    parentLabel: null,
    lastEventAt: null,
    lastEvent: null,
    ...overrides,
  };
}

function liveOf(agents: AgentLive[]): Live {
  return {
    lastReceivedAt: "2026-09-22T10:00:00+09:00",
    everReceived: true,
    agents: Object.fromEntries(agents.map((agent) => [agent.name, agent])),
    lobby: [],
    undefinedSubagents: [],
  };
}

function subagent(status: Status = "running", overrides: Partial<UndefinedSubagent> = {}): UndefinedSubagent {
  return {
    agentId: "sub-1",
    agentType: "doc-writer",
    sessionId: "s-1",
    status,
    currentTool: { name: "Grep", target: "docs" },
    parentAgentName: "dev-lead",
    parentLabel: "dev-lead",
    startedAt: "2026-09-22T10:00:00+09:00",
    ...overrides,
  };
}

const agentSeat = (name: string, isLead = false): Seat => ({ kind: "agent", key: `agent:${name}`, name, isLead });

interface RenderOptions {
  seat: Seat;
  live?: Live;
  collectorDown?: boolean;
  selectedName?: string | null;
  onSelect?: (name: string) => void;
}

function renderCell({ seat, live = liveOf([]), collectorDown = false, selectedName = null, onSelect = () => {} }: RenderOptions) {
  return render(
    <OfficeCell seat={seat} live={live} collectorDown={collectorDown} selectedName={selectedName} onSelect={onSelect} />,
  );
}

describe("OfficeCell", () => {
  it("[FR-007-AC1][FR-007-AC2] 캐릭터 칸 = 팀장 배지 + 말풍선 + PixelChar office(88) + name + 상태 줄, 칸 aria-label·title = '<name> · <상태 줄>'", () => {
    const { container } = renderCell({
      seat: agentSeat("dev-lead", true),
      live: liveOf([agentLive("dev-lead", { status: "running", currentTool: { name: "Edit", target: "Office.tsx" } })]),
    });

    const svg = container.querySelector("svg[data-testid='pixel-char']");
    expect(svg).toHaveAttribute("data-size", "office");
    expect(svg).toHaveAttribute("width", "88");
    expect(svg).toHaveAttribute("data-state", "running");
    expect(screen.getByText("타이핑 · Edit")).toHaveAttribute("data-tone", "running");
    expect(screen.getByText("dev-lead")).toBeInTheDocument();
    expect(screen.getByText("작업 중")).toBeInTheDocument();
    expect(screen.getByText("팀장")).toBeInTheDocument();
    const cell = screen.getByRole("button", { name: "dev-lead · 작업 중" });
    expect(cell).toHaveAttribute("title", "dev-lead · 작업 중");
    expect(cell).toHaveAttribute("data-wf", "03-4");
    expect(cell).toHaveAttribute("data-agent-name", "dev-lead");
  });

  it("[FR-007-AC3] 정의 없는 서브에이전트 칸 = PixelChar sub(66), '작업 중 · 부모 <name>', 선택 불가·hover 없음", () => {
    const onSelect = vi.fn();
    const { container } = renderCell({
      seat: { kind: "subagent", key: "subagent:sub-1", subagent: subagent() },
      onSelect,
    });

    const svg = container.querySelector("svg[data-testid='pixel-char']");
    expect(svg).toHaveAttribute("data-size", "sub");
    expect(svg).toHaveAttribute("width", "66");
    expect(svg).toHaveAttribute("data-state", "running");
    expect(screen.getByText("작업 중 · 부모 dev-lead")).toBeInTheDocument();
    expect(screen.getByText("읽기 · Grep")).toBeInTheDocument();
    const cell = screen.getByRole("group", { name: "doc-writer · 작업 중 · 부모 dev-lead" });
    expect(cell).toHaveAttribute("data-wf", "03-5");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(cell.className).toContain("cursor-default");
    expect(cell.className).not.toMatch(/hover:/);
    fireEvent.click(cell);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("[FR-007-E1][FR-007-AC3] 수집 중단이면 캐릭터 칸·서브에이전트 칸 모두 idle 색 + 점선 말풍선 '대기', 부모 접미 없음", () => {
    const { container } = render(
      <>
        <OfficeCell
          seat={agentSeat("dev-01")}
          live={liveOf([agentLive("dev-01", { status: "running", parentLabel: "[세션 1]" })])}
          collectorDown
          selectedName={null}
          onSelect={() => {}}
        />
        <OfficeCell
          seat={{ kind: "subagent", key: "subagent:sub-1", subagent: subagent("waiting") }}
          live={liveOf([])}
          collectorDown
          selectedName={null}
          onSelect={() => {}}
        />
      </>,
    );

    const states = Array.from(container.querySelectorAll("svg[data-testid='pixel-char']")).map((el) => el.getAttribute("data-state"));
    expect(states).toEqual(["idle", "idle"]);
    expect(screen.getAllByText("대기", { selector: "[data-testid='bubble']" })).toHaveLength(2);
    expect(screen.queryByText(/부모/)).not.toBeInTheDocument();
  });

  it("[FR-007-AC4] 칸을 누르면 onSelect(name), 선택 칸은 aria-pressed·brand-blue 테두리·action-soft 면, 비선택 칸은 hover 테두리 border-dashed", () => {
    const onSelect = vi.fn();
    const { rerender } = renderCell({ seat: agentSeat("dev-01"), onSelect });

    const idle = screen.getByRole("button", { name: "dev-01 · 대기" });
    expect(idle).toHaveAttribute("aria-pressed", "false");
    expect(idle.className).toContain("hover:border-border-dashed");
    fireEvent.click(idle);
    expect(onSelect).toHaveBeenCalledWith("dev-01");

    rerender(
      <OfficeCell seat={agentSeat("dev-01")} live={liveOf([])} collectorDown={false} selectedName="dev-01" onSelect={onSelect} />,
    );
    const selected = screen.getByRole("button", { name: "dev-01 · 대기" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected.className).toContain("border-brand-blue");
    expect(selected.className).toContain("bg-action-soft");
    expect(selected.className).toContain("office-cell-selected");
    expect(selected.className).not.toContain("hover:");
  });

  it("[FR-007-AC1] 빈 자리 칸 = 점선·바탕 없음·클릭 없음·hover 없음", () => {
    renderCell({ seat: { kind: "empty", key: "empty:0" } });

    const empty = screen.getByText("빈 자리");
    expect(empty).toHaveAttribute("data-wf", "03-6");
    expect(empty.className).toContain("border-dashed");
    expect(empty.className).not.toMatch(/bg-|hover:|cursor-pointer/);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("[FR-006-AC4] 긴 name은 CSS 말줄임(truncate) + title에 전체 이름, 상태 줄도 title(clamp)", () => {
    const longName = "abcdefghijklmnopqrstuvwxyz";
    renderCell({
      seat: agentSeat(longName),
      live: liveOf([agentLive(longName, { status: "running", parentLabel: "[세션 1]" })]),
    });

    const name = screen.getByText(longName);
    expect(name).toHaveAttribute("title", longName);
    expect(name.className).toContain("truncate");
    const status = screen.getByTitle("작업 중 · 부모 [세션 1]");
    expect(status).toHaveAttribute("data-clamp");
    expect(status.className).toContain("truncate");
  });
});
