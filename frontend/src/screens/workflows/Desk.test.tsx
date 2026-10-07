import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Desk } from "./Desk";

function renderDesk(overrides: Partial<Parameters<typeof Desk>[0]> = {}) {
  const onOpen = vi.fn();
  const view = render(
    <Desk name="dev-lead" status="running" isLead={false} parentLabel={null} onOpen={onOpen} {...overrides} />,
  );
  return { ...view, onOpen };
}

describe("Desk", () => {
  it("[FR-006-AC10] PixelChar desk(66) rect 12개, name·상태 글자·data-agent-name 렌더, 팀장 배지는 isLead일 때만", () => {
    const { container } = renderDesk({ isLead: true });

    const svg = container.querySelector("svg[data-testid='pixel-char']");
    expect(svg).toHaveAttribute("viewBox", "0 0 22 22");
    expect(svg).toHaveAttribute("width", "66");
    expect(svg).toHaveAttribute("height", "66");
    expect(svg).toHaveAttribute("data-size", "desk");
    expect(svg).toHaveAttribute("data-state", "running");
    expect(container.querySelectorAll("rect")).toHaveLength(12);
    // E2E 선택자 전제: `[data-agent-name] > svg`
    expect(container.querySelector("[data-agent-name='dev-lead'] > svg[data-testid='pixel-char']")).not.toBeNull();
    expect(screen.getByText("dev-lead")).toBeInTheDocument();
    expect(screen.getByText("작업 중")).toBeInTheDocument();
    expect(screen.getByText("팀장")).toBeInTheDocument();
  });

  it("[FR-006-AC1] 팀장이 아니면 배지가 없다", () => {
    renderDesk({ isLead: false });
    expect(screen.queryByText("팀장")).not.toBeInTheDocument();
  });

  it("[FR-006-AC4][FR-006-AC10] name 12자 초과 → 12자 + … 말줄임, title에 전체 이름, 상태 글자도 함께", () => {
    const longName = "abcdefghijklmno";
    const { container } = renderDesk({ name: longName, status: "idle" });

    expect(screen.getByText("abcdefghijkl…")).toBeInTheDocument();
    expect(container.querySelector(`[title="${longName}"]`)).not.toBeNull();
    expect(screen.getByText("대기")).toBeInTheDocument();
  });

  it("[FR-006-AC4] 12자 이하 name은 그대로이고 title도 같은 이름이다", () => {
    const { container } = renderDesk({ name: "abcdefghijkl", status: "idle" });
    expect(screen.getByText("abcdefghijkl")).toHaveAttribute("title", "abcdefghijkl");
    expect(container.textContent).not.toContain("…");
  });

  it("[FR-006-AC1][FR-007-AC3] parentLabel 있으면 상태 글자 뒤 '· 부모 <라벨>'", () => {
    renderDesk({ name: "sub-1", parentLabel: "[세션 1]" });
    expect(screen.getByText("작업 중 · 부모 [세션 1]")).toBeInTheDocument();
  });

  it("[FR-006-AC10] 부모 접미가 있는 상태 줄 — 한 줄 clamp + 전체 문구 title + data-clamp, DOM 텍스트는 그대로", () => {
    renderDesk({ name: "sub-1", parentLabel: "[세션 1]" });

    // DOM 텍스트는 자르지 않는다 — `agentStatusWithParent()` 결과가 그대로 있어야 E2E `exact: true` 단언이 통과한다.
    const statusLine = screen.getByText("작업 중 · 부모 [세션 1]");
    expect(statusLine.textContent).toBe("작업 중 · 부모 [세션 1]");
    const classes = statusLine.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("truncate");
    expect(classes).toContain("max-w-desk-status");
    // 전체 문구는 같은 요소의 네이티브 title로 준다(폭 제약 없는 래퍼를 끼우지 않는다).
    expect(statusLine).toHaveAttribute("title", "작업 중 · 부모 [세션 1]");
    expect(statusLine).toHaveAttribute("data-clamp");
    expect(statusLine.tagName).toBe("SPAN");
  });

  it("[FR-006-AC10] 접미 없는 상태 줄에는 title이 없다 — 책상 안 title 요소는 이름 줄 하나뿐이다", () => {
    const { container } = renderDesk({ isLead: true });

    const statusLine = screen.getByText("작업 중");
    expect(statusLine).not.toHaveAttribute("title");
    expect(statusLine.className).toContain("truncate");
    expect(container.querySelectorAll("span[title]")).toHaveLength(1);
  });

  it("[FR-006-AC4][FR-006-AC10] 이름 줄은 칸 폭(100px) 안에서 한 줄 clamp, 12자 말줄임은 ellipsis.ts가 담당한다", () => {
    renderDesk({ name: "abcdefghijklmno", status: "idle" });

    const nameLine = screen.getByText("abcdefghijkl…");
    const classes = nameLine.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("truncate");
    expect(classes).toContain("max-w-desk");
    expect(classes).toContain("font-mono");
    expect(nameLine).toHaveAttribute("title", "abcdefghijklmno");
  });

  it("[FR-006-AC10] 칸 폭은 100px 고정 w-desk, 가운데 정렬 유지", () => {
    renderDesk();
    const classes = screen.getByRole("button").className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("w-desk");
    expect(classes).toContain("items-center");
  });

  it("[ADR-69] 책상 hover는 bg-soft 하나이고 상태 글자 앞에 상태 사각형이 있다", () => {
    renderDesk({ status: "waiting" });
    const desk = screen.getByRole("button");
    const classes = desk.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("hover:bg-soft");
    expect(classes.filter((c) => c.startsWith("hover:"))).toEqual(["hover:bg-soft"]);
    expect(screen.getByText("권한 대기").querySelector("span.bg-waiting")).not.toBeNull();
  });

  it("[FR-006-AC1] 눌러도 이동 콜백이 한 번 불리고, 접근 가능한 이름에 전체 name·상태가 들어 있다", () => {
    const { onOpen } = renderDesk({ name: "abcdefghijklmno", isLead: true });
    const desk = screen.getByRole("button", { name: "abcdefghijklmno · 작업 중 · 팀장 · 상세에서 보기" });
    fireEvent.click(desk);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
