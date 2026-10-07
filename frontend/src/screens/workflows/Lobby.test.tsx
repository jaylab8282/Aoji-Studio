import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Lobby } from "./Lobby";
import type { LobbyEntry } from "../../api/types";

function buildEntry(overrides: Partial<LobbyEntry> = {}): LobbyEntry {
  return {
    kind: "session",
    label: "[세션 1]",
    status: "running",
    sessionId: "session-1",
    currentTool: null,
    ...overrides,
  };
}

describe("Lobby", () => {
  it("[FR-006-AC9][FR-003-AC5] session 항목 칩 '[세션 1] · 작업 중'(시안 칩 + 상태 사각형)", () => {
    render(<Lobby lobby={[buildEntry()]} />);

    const chip = screen.getByTestId("lobby-chip");
    expect(chip.textContent).toBe("[세션 1] · 작업 중");
    expect(chip.className).toContain("text-live");
    expect(chip.querySelector("span.bg-live")).not.toBeNull();
  });

  it("[FR-004-AC7] agent 항목 칩 'name · 상태'(waiting은 '입력 대기', 주황 칩)", () => {
    render(
      <Lobby lobby={[buildEntry({ kind: "agent", label: "solo-agent", status: "waiting", sessionId: "session-2" })]} />,
    );

    const chip = screen.getByTestId("lobby-chip");
    expect(chip.textContent).toBe("solo-agent · 입력 대기");
    expect(chip.className).toContain("text-waiting");
    expect(within(chip).getByText("solo-agent")).toHaveClass("font-mono");
  });

  it("[FR-006-AC9] idle 항목은 중립 칩 '… · 대기'", () => {
    render(<Lobby lobby={[buildEntry({ status: "idle" })]} />);
    const chip = screen.getByTestId("lobby-chip");
    expect(chip.textContent).toBe("[세션 1] · 대기");
    expect(chip.className).toContain("text-text-muted");
  });

  it("[FR-006-AC9] 제목 '로비 · 메인 세션' + 설명(말줄임) + 칩이 한 카드 한 줄에 있다 (data-wf 02-4)", () => {
    render(<Lobby lobby={[buildEntry(), buildEntry({ sessionId: "s2", label: "[세션 2]", status: "idle" })]} />);
    const section = screen.getByRole("region", { name: "로비" });
    expect(section).toHaveAttribute("data-wf", "02-4");
    expect(within(section).getByRole("heading", { name: "로비 · 메인 세션" })).toBeInTheDocument();
    expect(within(section).getByText("에이전트 지정 없이 실행 중인 세션 · 워크플로우 밖 에이전트")).toHaveClass("truncate");
    expect(within(section).getAllByTestId("lobby-chip")).toHaveLength(2);
  });

  it("[FR-006-AC9] 빈 → '실행 중인 메인 세션 없음'(칩 없음)", () => {
    render(<Lobby lobby={[]} />);
    expect(screen.getByText("실행 중인 메인 세션 없음")).toBeInTheDocument();
    expect(screen.queryByTestId("lobby-chip")).not.toBeInTheDocument();
  });
});
