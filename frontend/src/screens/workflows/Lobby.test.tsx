import { render, screen } from "@testing-library/react";
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
  it("[FR-006-AC9][FR-003-AC5] session 항목 '[세션 1] · 작업 중'", () => {
    render(<Lobby lobby={[buildEntry()]} />);
    expect(screen.getByText("[세션 1] · 작업 중")).toBeInTheDocument();
  });

  it("[FR-004-AC7] agent 항목 'name · 상태'(waiting은 '입력 대기')", () => {
    render(<Lobby lobby={[buildEntry({ kind: "agent", label: "solo-agent", status: "waiting", sessionId: "session-2" })]} />);
    expect(screen.getByText("solo-agent · 입력 대기")).toBeInTheDocument();
  });

  it("[FR-006-AC9] 빈 → '실행 중인 메인 세션 없음'", () => {
    render(<Lobby lobby={[]} />);
    expect(screen.getByText("실행 중인 메인 세션 없음")).toBeInTheDocument();
  });
});
