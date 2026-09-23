import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeskSprite } from "./DeskSprite";

describe("DeskSprite", () => {
  it("[FR-006-AC10] SVG viewBox 22×22, 46px, pixel-sprites A 좌표 8개 rect, name·상태 글자 렌더", () => {
    const { container } = render(<DeskSprite name="dev-lead" status="running" isLead parentLabel={null} />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 22 22");
    expect(svg).toHaveAttribute("width", "46");
    expect(svg).toHaveAttribute("height", "46");
    expect(container.querySelectorAll("rect")).toHaveLength(8);
    expect(screen.getByText("dev-lead")).toBeInTheDocument();
    expect(screen.getByText("작업 중")).toBeInTheDocument();
    expect(screen.getByText("팀장")).toBeInTheDocument();
  });

  it("[FR-006-AC4] name 12자 초과 → 12자+… 말줄임 + title에 전체 이름", () => {
    const longName = "abcdefghijklmno";
    const { container } = render(<DeskSprite name={longName} status="idle" isLead={false} parentLabel={null} />);

    expect(screen.getByText("abcdefghijkl…")).toBeInTheDocument();
    expect(container.querySelector(`[title="${longName}"]`)).not.toBeNull();
  });

  it("[FR-006-AC1][FR-007-AC3] parentLabel 있으면 상태 글자 뒤 '· 부모 <라벨>'", () => {
    render(<DeskSprite name="sub-1" status="running" isLead={false} parentLabel="[세션 1]" />);
    expect(screen.getByText("작업 중 · 부모 [세션 1]")).toBeInTheDocument();
  });
});
