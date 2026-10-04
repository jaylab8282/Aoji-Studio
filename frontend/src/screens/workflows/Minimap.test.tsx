import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Minimap } from "./Minimap";
import type { Workflow } from "../../api/types";

function buildWorkflow(name: string, memberCount: number): Workflow {
  return {
    name,
    description: "",
    filePath: `.aojistudio/teams/${name}.json`,
    lead: "lead",
    members: Array.from({ length: memberCount }, (_, index) => `${name}-${index}`),
    brokenRefs: [],
    rawMemberCount: memberCount + 1,
  };
}

function renderMinimap(workflows: Workflow[]) {
  return render(<Minimap workflows={workflows} scrollRef={createRef<HTMLDivElement>()} zoom={100} />);
}

interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/**
 * jsdom은 레이아웃을 계산하지 않으므로 층 스크롤 영역의 스크롤 수치를 직접 심는다. getter가 같은
 * `metrics` 객체를 읽으므로, 값을 바꾸면 줌 변경으로 `scrollHeight`가 달라진 상황을 그대로 재현한다
 * (02는 층 영역에 `transform: scale`을 걸어 줌을 구현한다 → `scrollHeight`만 변하고 `clientHeight`는
 * 스크롤 컨테이너 자신의 크기라 그대로다).
 */
function createScrollArea(metrics: ScrollMetrics): HTMLDivElement {
  const element = document.createElement("div");
  for (const key of ["scrollTop", "clientHeight", "scrollHeight"] as const) {
    Object.defineProperty(element, key, { configurable: true, get: () => metrics[key] });
  }
  return element;
}

/** 미니맵 안의 뷰포트 테두리(`absolute inset-x-1` 사각형)에 적용된 top·height(%). */
function viewportPercent(): { top: number; height: number } {
  const viewport = screen.getByRole("img", { name: "미니맵" }).querySelector<HTMLElement>("div.absolute");
  expect(viewport).not.toBeNull();
  const style = (viewport as HTMLElement).style;
  expect(style.top).toMatch(/%$/);
  expect(style.height).toMatch(/%$/);
  return { top: Number.parseFloat(style.top), height: Number.parseFloat(style.height) };
}

describe("Minimap", () => {
  it("[FR-006-AC5] 워크플로우 단위 상태를 색으로 표시하지 않는다(블록은 중립색)", () => {
    renderMinimap([buildWorkflow("워크플로우A", 11), buildWorkflow("워크플로우B", 3)]);

    const blocks = Array.from(screen.getByRole("img", { name: "미니맵" }).querySelectorAll("span"));

    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.className).toContain("bg-selected");
      expect(block.className).not.toMatch(/bg-(running|waiting|idle)/);
    }
  });

  it("[FR-006-AC2] 블록이 층 그리드 비율(3열·인원 7 이상은 3칸)을 따른다", () => {
    renderMinimap([buildWorkflow("워크플로우A", 11), buildWorkflow("워크플로우B", 3)]);

    const minimap = screen.getByRole("img", { name: "미니맵" });
    const blocks = Array.from(minimap.querySelectorAll("span"));

    expect(minimap.querySelector(".grid-cols-3")).not.toBeNull();
    expect(blocks[0]?.className).toContain("col-span-3");
    expect(blocks[1]?.className).toContain("col-span-1");
  });

  it("워크플로우 0개 → 미니맵 숨김", () => {
    renderMinimap([]);
    expect(screen.queryByRole("img", { name: "미니맵" })).not.toBeInTheDocument();
  });

  it("[FR-006-AC6] 줌을 올리면 뷰포트 높이를 새 배율의 clientHeight/scrollHeight로 다시 계산한다(스크롤 이벤트 없이)", () => {
    // T-024 E2E 실측치: 100% → 150%에서 층 스크롤 영역 scrollHeight 3351px → 5002px(clientHeight 628px 고정).
    const metrics: ScrollMetrics = { scrollTop: 0, clientHeight: 628, scrollHeight: 3351 };
    const scrollRef = { current: createScrollArea(metrics) };
    const workflows = [buildWorkflow("워크플로우A", 11), buildWorkflow("워크플로우B", 3)];

    const { rerender } = render(<Minimap workflows={workflows} scrollRef={scrollRef} zoom={100} />);
    const before = viewportPercent();
    expect(before.height).toBeCloseTo((628 / 3351) * 100, 2);

    metrics.scrollHeight = 5002;
    rerender(<Minimap workflows={workflows} scrollRef={scrollRef} zoom={150} />);

    const after = viewportPercent();
    // 기대값 12.55% (= 628 / 5002). 옛 결함은 18.74%(3351 기준)를 그대로 들고 있었다.
    expect(after.height).toBeCloseTo((628 / 5002) * 100, 2);
    expect(after.height).toBeLessThan(before.height);
  });

  it("[FR-006-AC6] 줌을 바꾸면 뷰포트 위치도 새 scrollHeight 기준으로 다시 계산한다", () => {
    // 브라우저는 줌 인에서 scrollTop을 유지하므로 같은 scrollTop이 더 커진 scrollHeight에서 위쪽 비율이 된다.
    const metrics: ScrollMetrics = { scrollTop: 1500, clientHeight: 628, scrollHeight: 3351 };
    const scrollRef = { current: createScrollArea(metrics) };
    const workflows = [buildWorkflow("워크플로우A", 3)];

    const { rerender } = render(<Minimap workflows={workflows} scrollRef={scrollRef} zoom={100} />);
    expect(viewportPercent().top).toBeCloseTo((1500 / 3351) * 100, 2);

    metrics.scrollHeight = 5002;
    rerender(<Minimap workflows={workflows} scrollRef={scrollRef} zoom={150} />);

    expect(viewportPercent().top).toBeCloseTo((1500 / 5002) * 100, 2);
  });

  it("[FR-006-AC6] 줌으로 scrollHeight가 커져도 뷰포트 높이는 최소 4%를 유지한다", () => {
    const metrics: ScrollMetrics = { scrollTop: 0, clientHeight: 628, scrollHeight: 6000 };
    const scrollRef = { current: createScrollArea(metrics) };
    const workflows = [buildWorkflow("워크플로우A", 11)];

    const { rerender } = render(<Minimap workflows={workflows} scrollRef={scrollRef} zoom={100} />);
    expect(viewportPercent().height).toBeCloseTo((628 / 6000) * 100, 2);

    // 200%에서 비율만 따르면 3.14%로 테두리가 사라질 만큼 얇아진다 → 하한 4%.
    metrics.scrollHeight = 20000;
    rerender(<Minimap workflows={workflows} scrollRef={scrollRef} zoom={200} />);

    expect(viewportPercent().height).toBe(4);
  });
});
