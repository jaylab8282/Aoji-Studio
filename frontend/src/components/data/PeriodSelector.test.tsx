import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PeriodSelector } from "./PeriodSelector";

describe("PeriodSelector (ui-spec §공통, ADR-86)", () => {
  it("[NFR-12] 라벨 `기간`이 group의 이름이고, 7일·30일·전체 버튼은 aria-pressed로 선택을 알린다", () => {
    render(<PeriodSelector value="7d" onChange={() => {}} range={{ from: "2026-10-09", to: "2026-10-15" }} />);

    const group = screen.getByRole("group", { name: "기간" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["7일", "30일", "전체"]);
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    expect(buttons[0]).toHaveClass("bg-action-soft", "text-link", "seg-selected");
    expect(buttons[1]).not.toHaveClass("bg-action-soft");
  });

  it("[NFR-12] 눌린 칸이 바뀌면 onChange(period)로 알리고, 이미 선택한 칸을 다시 눌러도 같은 값을 알린다", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodSelector value="7d" onChange={onChange} range={null} />);

    fireEvent.click(screen.getByRole("button", { name: "30일" }));
    expect(onChange).toHaveBeenLastCalledWith("30d");
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(onChange).toHaveBeenLastCalledWith("all");

    rerender(<PeriodSelector value="all" onChange={onChange} range={null} />);
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "7일" })).toHaveAttribute("aria-pressed", "false");
  });

  it("날짜 범위는 `MM-DD ~ MM-DD`, from이 null이면 `-`, 첫 응답 전(range null)에는 스켈레톤", () => {
    const { rerender } = render(<PeriodSelector value="7d" onChange={() => {}} range={{ from: "2026-10-09", to: "2026-10-15" }} />);
    expect(screen.getByTestId("period-range")).toHaveTextContent("10-09 ~ 10-15");
    expect(screen.getByTestId("period-range")).toHaveClass("font-mono", "text-text-muted");

    rerender(<PeriodSelector value="all" onChange={() => {}} range={{ from: null, to: "2026-10-15" }} />);
    expect(screen.getByTestId("period-range")).toHaveTextContent(/^-$/);

    rerender(<PeriodSelector value="7d" onChange={() => {}} range={null} />);
    expect(screen.queryByTestId("period-range")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "날짜 범위 로딩 중" })).toBeInTheDocument();
    // 로딩 중에도 세 칸은 활성이다.
    for (const button of screen.getAllByRole("button")) expect(button).toBeEnabled();
  });
});
