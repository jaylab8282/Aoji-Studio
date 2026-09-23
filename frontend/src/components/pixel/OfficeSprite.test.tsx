import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfficeSprite } from "./OfficeSprite";
import { actionLabel } from "../../lib/derive/actionLabel";
import { screen as screenColor, shirt } from "./palette";

/** pixel-sprites.md "B. 오피스용 — 16×20 격자" 표 그대로(순서는 그리는 순서). */
const B_GRID_RECTS = [
  { x: "1", y: "1", width: "9", height: "6" }, // 모니터 화면
  { x: "4", y: "7", width: "3", height: "1" }, // 모니터 받침
  { x: "5", y: "2", width: "6", height: "6" }, // 얼굴
  { x: "5", y: "2", width: "6", height: "2" }, // 머리카락
  { x: "4", y: "8", width: "8", height: "6" }, // 몸통(셔츠)
  { x: "0", y: "13", width: "16", height: "3" }, // 책상
  { x: "5", y: "16", width: "2", height: "4" }, // 다리 1
  { x: "9", y: "16", width: "2", height: "4" }, // 다리 2
];

function rectAttributes(container: HTMLElement) {
  return Array.from(container.querySelectorAll("rect")).map((rect) => ({
    x: rect.getAttribute("x"),
    y: rect.getAttribute("y"),
    width: rect.getAttribute("width"),
    height: rect.getAttribute("height"),
  }));
}

describe("OfficeSprite", () => {
  it("[FR-007-AC1] SVG viewBox 16×20, 66×82px, pixel-sprites B 좌표 8개 rect, 말풍선·name·상태 글자", () => {
    const { container } = render(
      <OfficeSprite
        name="dev-lead"
        status="running"
        action={actionLabel("running", { name: "Edit", target: "Office.tsx" })}
        statusText="작업 중"
        isLead
      />,
    );

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 16 20");
    expect(svg).toHaveAttribute("width", "66");
    expect(svg).toHaveAttribute("height", "82");
    expect(rectAttributes(container)).toEqual(B_GRID_RECTS);
    expect(screen.getByText("타이핑 · Edit")).toBeInTheDocument();
    expect(screen.getByText("dev-lead")).toBeInTheDocument();
    expect(screen.getByText("작업 중")).toBeInTheDocument();
    expect(screen.getByText("팀장")).toBeInTheDocument();
  });

  it("[FR-007-AC3] small 변형 = 48×60px, 같은 격자, 셔츠는 서브에이전트 색", () => {
    const { container } = render(
      <OfficeSprite
        small
        name="doc-writer"
        status="running"
        action={actionLabel("running", { name: "Grep", target: "docs" })}
        statusText="작업 중 · 부모 dev-lead"
      />,
    );

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 16 20");
    expect(svg).toHaveAttribute("width", "48");
    expect(svg).toHaveAttribute("height", "60");
    expect(rectAttributes(container)).toEqual(B_GRID_RECTS);
    expect(container.querySelectorAll("rect")[4]?.getAttribute("fill")).toBe(shirt.sub);
    expect(screen.getByText("작업 중 · 부모 dev-lead")).toBeInTheDocument();
  });

  it("[FR-007-E1] 대기 상태면 셔츠·모니터가 대기색이다(작은 캐릭터 포함)", () => {
    const { container } = render(
      <>
        <OfficeSprite name="dev-01" status="idle" action={actionLabel("idle", null)} statusText="대기" />
        <OfficeSprite small name="doc-writer" status="idle" action={actionLabel("idle", null)} statusText="대기" />
      </>,
    );

    const rects = Array.from(container.querySelectorAll("svg")).map((svg) => svg.querySelectorAll("rect"));
    for (const svgRects of rects) {
      expect(svgRects[0]?.getAttribute("fill")).toBe(screenColor.idle);
      expect(svgRects[4]?.getAttribute("fill")).toBe(shirt.idle);
    }
  });

  it("[FR-006-AC4] name 12자 초과 → 12자+… 말줄임 + title에 전체 이름", () => {
    const longName = "abcdefghijklmno";
    const { container } = render(
      <OfficeSprite name={longName} status="idle" action={actionLabel("idle", null)} statusText="대기" />,
    );

    expect(screen.getByText("abcdefghijkl…")).toBeInTheDocument();
    expect(container.querySelector(`[title="${longName}"]`)).not.toBeNull();
  });
});
