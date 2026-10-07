import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MINIMAP_LABEL } from "../../lib/text";
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

/** 미니맵 안의 뷰포트 테두리(`minimap-viewport`)에 적용된 top·height(%). */
function viewportPercent(): { top: number; height: number } {
  const viewport = screen.getByTestId("minimap-viewport");
  expect(viewport).not.toBeNull();
  const style = (viewport as HTMLElement).style;
  expect(style.top).toMatch(/%$/);
  expect(style.height).toMatch(/%$/);
  return { top: Number.parseFloat(style.top), height: Number.parseFloat(style.height) };
}

describe("Minimap", () => {
  it("[FR-006-AC5] 워크플로우 단위 상태를 색으로 표시하지 않는다(블록은 중립색)", () => {
    renderMinimap([buildWorkflow("워크플로우A", 11), buildWorkflow("워크플로우B", 3)]);

    const blocks = Array.from(screen.getByRole("button", { name: MINIMAP_LABEL }).querySelectorAll("[data-block]"));

    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.className).toContain("bg-selected");
      expect(block.className).not.toMatch(/bg-(running|live|waiting|idle)/);
    }
  });

  it("[FR-006-AC2] 블록이 층 그리드 비율(3열·인원 7 이상은 3칸)을 따른다", () => {
    renderMinimap([buildWorkflow("워크플로우A", 11), buildWorkflow("워크플로우B", 3)]);

    const minimap = screen.getByRole("button", { name: MINIMAP_LABEL });
    const blocks = Array.from(minimap.querySelectorAll("[data-block]"));

    expect(minimap.querySelector(".minimap-grid")).not.toBeNull();
    expect(blocks[0]?.className).toContain("minimap-block-wide");
    expect(blocks[1]?.className).not.toContain("minimap-block-wide");
  });

  it("워크플로우 0개 → 미니맵 숨김", () => {
    renderMinimap([]);
    expect(screen.queryByRole("button", { name: MINIMAP_LABEL })).not.toBeInTheDocument();
  });

  it("[FR-006-AC2][FR-006-AC3] 팀장 없는 층은 점선 사각형(bg-selected 채움 없음), 팀장 있는 층은 bg-selected", () => {
    renderMinimap([{ ...buildWorkflow("무팀장", 2), lead: null }, buildWorkflow("유팀장", 2)]);

    const noLead = document.querySelector("[data-block='무팀장']") as HTMLElement;
    const withLead = document.querySelector("[data-block='유팀장']") as HTMLElement;
    expect(noLead.className).toContain("border-dashed");
    expect(noLead.className).not.toContain("bg-selected");
    expect(withLead.className).toContain("bg-selected");
  });

  it("[FR-006-AC6] 떠 있는 배치·세 크기·접근 이름: 캔버스 오른쪽 아래 16px, 토큰 크기, 보이는 영역 brand-blue 2px", () => {
    renderMinimap([buildWorkflow("워크플로우A", 3)]);

    const minimap = screen.getByRole("button", { name: MINIMAP_LABEL });
    expect(minimap).toHaveAttribute("title", MINIMAP_LABEL);
    expect(minimap).toHaveAttribute("data-wf", "02-10");
    for (const cls of ["absolute", "right-4", "bottom-4", "w-minimap-w", "h-minimap-h", "bg-chrome", "border-border-strong", "p-2"]) {
      expect(minimap.className.split(/\s+/), cls).toContain(cls);
    }
    expect(screen.getByTestId("minimap-viewport").className).toContain("border-brand-blue");
    expect(screen.getByTestId("minimap-viewport").className).toContain("border-2");
  });

  it("[FR-006-AC6] 재측정 시점 ①마운트 ②캔버스 scroll ③window resize ⑤zoom — 각각 새 scrollTop·scrollHeight를 읽는다", () => {
    const metrics: ScrollMetrics = { scrollTop: 0, clientHeight: 600, scrollHeight: 3000 };
    const scrollRef = { current: createScrollArea(metrics) };
    const workflows = [buildWorkflow("워크플로우A", 3)];

    const { rerender } = render(<Minimap workflows={workflows} scrollRef={scrollRef} zoom={100} />);
    expect(viewportPercent().top).toBe(0); // ① 마운트

    metrics.scrollTop = 600;
    act(() => {
      scrollRef.current.dispatchEvent(new Event("scroll"));
    });
    expect(viewportPercent().top).toBeCloseTo(20, 2); // ② scroll

    metrics.scrollTop = 1500;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(viewportPercent().top).toBeCloseTo(50, 2); // ③ resize

    metrics.scrollHeight = 6000;
    rerender(<Minimap workflows={workflows} scrollRef={scrollRef} zoom={200} />);
    expect(viewportPercent().top).toBeCloseTo(25, 2); // ⑤ zoom
  });

  it("[FR-006-AC6] 재측정 시점 ④ registry.workflows 변경은 다시 재고, 같은 workflows면(검색·층 선택·로비 변화) 다시 재지 않는다", () => {
    const metrics: ScrollMetrics = { scrollTop: 0, clientHeight: 600, scrollHeight: 3000 };
    const scrollRef = { current: createScrollArea(metrics) };
    const workflows = [buildWorkflow("워크플로우A", 3)];

    const { rerender } = render(<Minimap workflows={workflows} scrollRef={scrollRef} zoom={100} />);
    expect(viewportPercent().height).toBeCloseTo(20, 2);

    // 같은 workflows·zoom으로 다시 그려도(= 검색·필터·로비만 바뀐 경우) 값은 그대로다.
    metrics.scrollHeight = 1200;
    rerender(<Minimap workflows={workflows} scrollRef={scrollRef} zoom={100} />);
    expect(viewportPercent().height).toBeCloseTo(20, 2);

    // ④ workflows 배열이 바뀌면 다시 잰다.
    rerender(<Minimap workflows={[...workflows, buildWorkflow("워크플로우B", 1)]} scrollRef={scrollRef} zoom={100} />);
    expect(viewportPercent().height).toBeCloseTo(50, 2);
  });

  it("[FR-006-AC6] 누른 위치로 캔버스를 스크롤한다(누른 높이 비율 × scrollHeight − clientHeight/2)", () => {
    const metrics: ScrollMetrics = { scrollTop: 0, clientHeight: 600, scrollHeight: 3000 };
    const area = createScrollArea(metrics);
    const scrollTo = vi.fn();
    area.scrollTo = scrollTo as unknown as typeof area.scrollTo;
    render(<Minimap workflows={[buildWorkflow("워크플로우A", 3)]} scrollRef={{ current: area }} zoom={100} />);

    const minimap = screen.getByRole("button", { name: MINIMAP_LABEL });
    minimap.getBoundingClientRect = () => ({ top: 100, height: 200, left: 0, width: 100, right: 100, bottom: 300, x: 0, y: 100, toJSON: () => ({}) });
    fireEvent.click(minimap, { clientY: 200 });

    expect(scrollTo).toHaveBeenCalledWith({ top: 0.5 * 3000 - 300, behavior: "smooth" });
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
