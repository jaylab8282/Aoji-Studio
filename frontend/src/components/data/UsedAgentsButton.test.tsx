import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UsedAgentsButton } from "./UsedAgentsButton";

describe("UsedAgentsButton (ui-spec §공통)", () => {
  it("[NFR-12] `사용 에이전트 N명` 링크 모양 버튼: aria-expanded, 누르면 onToggle", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<UsedAgentsButton count={2} expanded={false} onToggle={onToggle} controls="detail-1" />);

    const button = screen.getByRole("button", { name: "사용 에이전트 2명" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "detail-1");
    expect(button).toHaveClass("text-link", "underline", "font-semibold");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<UsedAgentsButton count={2} expanded onToggle={onToggle} controls="detail-1" />);
    expect(screen.getByRole("button", { name: "사용 에이전트 2명" })).toHaveAttribute("aria-expanded", "true");
  });

  it("[NFR-12] N = 0이면 text-muted 400 밑줄 없음이지만 그 행을 펼치고 접는 버튼은 그대로다", () => {
    const onToggle = vi.fn();
    render(<UsedAgentsButton count={0} expanded={false} onToggle={onToggle} />);

    const button = screen.getByRole("button", { name: "사용 에이전트 0명" });
    expect(button).toHaveClass("text-text-muted", "font-normal", "no-underline");
    expect(button).not.toHaveClass("text-link");
    expect(button).toHaveAttribute("data-zero");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
