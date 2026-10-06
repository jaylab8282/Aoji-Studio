import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeatFigure } from "./SeatFigure";
import { actionLabel } from "../../lib/derive/actionLabel";

describe("SeatFigure", () => {
  it("[FR-007-AC1] PixelChar office(88) + 말풍선·name·상태 글자·팀장 배지, 칸에 data-agent-name", () => {
    const { container } = render(
      <SeatFigure
        name="dev-lead"
        status="running"
        action={actionLabel("running", { name: "Edit", target: "Office.tsx" })}
        statusText="작업 중"
        isLead
      />,
    );

    const svg = container.querySelector("svg[data-testid='pixel-char']");
    expect(svg).toHaveAttribute("data-size", "office");
    expect(svg).toHaveAttribute("width", "88");
    expect(svg).toHaveAttribute("data-state", "running");
    expect(screen.getByText("타이핑 · Edit")).toHaveAttribute("data-tone", "running");
    expect(screen.getByText("dev-lead")).toBeInTheDocument();
    expect(screen.getByText("작업 중")).toBeInTheDocument();
    expect(screen.getByText("팀장")).toBeInTheDocument();
    expect(container.querySelector("[data-agent-name='dev-lead']")).not.toBeNull();
  });

  it("[FR-007-AC3] small = PixelChar sub(66), 부모 접미 상태 글자, 같은 상태 색 규칙", () => {
    const { container } = render(
      <SeatFigure
        small
        name="doc-writer"
        status="running"
        action={actionLabel("running", { name: "Grep", target: "docs" })}
        statusText="작업 중 · 부모 dev-lead"
      />,
    );

    const svg = container.querySelector("svg[data-testid='pixel-char']");
    expect(svg).toHaveAttribute("data-size", "sub");
    expect(svg).toHaveAttribute("width", "66");
    expect(svg).toHaveAttribute("data-state", "running");
    expect(screen.getByText("작업 중 · 부모 dev-lead")).toBeInTheDocument();
  });

  it("[FR-007-E1][FR-007-AC3] 대기 상태면 작은 캐릭터 포함 모두 idle 색 + 점선 말풍선", () => {
    const { container } = render(
      <>
        <SeatFigure name="dev-01" status="idle" action={actionLabel("idle", null)} statusText="대기" />
        <SeatFigure small name="doc-writer" status="idle" action={actionLabel("idle", null)} statusText="대기" />
      </>,
    );

    const states = Array.from(container.querySelectorAll("svg[data-testid='pixel-char']")).map((s) => s.getAttribute("data-state"));
    expect(states).toEqual(["idle", "idle"]);
    expect(screen.getAllByText("대기", { selector: "[data-testid='bubble']" })).toHaveLength(2);
  });

  it("[FR-006-AC4] name 12자 초과 → 12자+… 말줄임 + title에 전체 이름", () => {
    const longName = "abcdefghijklmno";
    const { container } = render(
      <SeatFigure name={longName} status="idle" action={actionLabel("idle", null)} statusText="대기" />,
    );

    expect(screen.getByText("abcdefghijkl…")).toBeInTheDocument();
    expect(container.querySelector(`[title="${longName}"]`)).not.toBeNull();
  });
});
