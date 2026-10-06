import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Bubble } from "./Bubble";

describe("Bubble", () => {
  it("[FR-007-AC2] 작업 중 = live-soft 바탕 + live 글자, 높이 22, 11px 600", () => {
    render(<Bubble tone="running">타이핑 · Edit</Bubble>);
    const el = screen.getByText("타이핑 · Edit");
    for (const c of ["bg-live-soft", "text-live", "font-semibold", "text-min", "h-bubble", "rounded-chip"]) {
      expect(el).toHaveClass(c);
    }
    expect(el).not.toHaveClass("h-bubble-legend");
  });

  it("[FR-007-AC2] 권한 요청 = 주황 채움(bg-waiting + text-page)", () => {
    render(<Bubble tone="waiting">권한 요청</Bubble>);
    const el = screen.getByText("권한 요청");
    expect(el).toHaveClass("bg-waiting", "text-page", "font-semibold");
  });

  it("[FR-007-AC2] 대기 = 점선 테두리 + text-muted 400, 바탕 없음", () => {
    render(<Bubble tone="idle">대기</Bubble>);
    const el = screen.getByText("대기");
    expect(el).toHaveClass("border", "border-dashed", "border-border-dashed", "bg-transparent", "text-text-muted", "font-normal");
    expect(el).not.toHaveClass("font-semibold");
  });

  it("[FR-007-AC2] 범례 견본은 높이 20, 한 줄 말줄임 + title 전체 문구", () => {
    render(
      <Bubble tone="running" legend>
        타이핑 · Edit
      </Bubble>,
    );
    const el = screen.getByText("타이핑 · Edit");
    expect(el).toHaveClass("h-bubble-legend", "overflow-hidden", "whitespace-nowrap", "text-ellipsis", "max-w-full");
    expect(el).toHaveAttribute("title", "타이핑 · Edit");
    expect(el).not.toHaveClass("h-bubble");
  });
});
