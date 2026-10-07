import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectorDown } from "./CollectorDown";

describe("CollectorDown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("[FR-007-E1] 띠 문구 'hook 이벤트 수신 없음 · 마지막 수신 <시각>' + 이유 한 줄, role=status·data-wf 04-4-1, 버튼 없음", () => {
    vi.useFakeTimers({ now: new Date("2026-09-22T12:00:00+09:00"), toFake: ["Date"] });
    const { container } = render(<CollectorDown lastReceivedAt="2026-09-22T10:30:05+09:00" />);

    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("data-wf", "04-4-1");
    // 오늘이면 hh:mm:ss(ADR-72)
    expect(screen.getByTestId("collector-down-message")).toHaveTextContent("hook 이벤트 수신 없음 · 마지막 수신 10:30:05");
    expect(screen.getByText("Claude Code가 꺼졌거나 hook 설정이 없으면 캐릭터를 모두 대기로 표시합니다")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("[FR-007-E1] 오늘이 아니면 'yyyy-mm-dd hh:mm'(ADR-72)", () => {
    vi.useFakeTimers({ now: new Date("2026-09-25T12:00:00+09:00"), toFake: ["Date"] });
    render(<CollectorDown lastReceivedAt="2026-09-22T10:30:05+09:00" />);

    expect(screen.getByTestId("collector-down-message")).toHaveTextContent(
      "hook 이벤트 수신 없음 · 마지막 수신 2026-09-22 10:30",
    );
  });

  it("[FR-007-E1] 수신 이력이 없으면 '마지막 수신 없음'", () => {
    render(<CollectorDown lastReceivedAt={null} />);

    expect(screen.getByTestId("collector-down-message")).toHaveTextContent("hook 이벤트 수신 없음 · 마지막 수신 없음");
  });
});
