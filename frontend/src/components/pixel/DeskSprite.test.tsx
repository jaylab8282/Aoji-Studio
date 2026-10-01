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

  it("[FR-006-AC10][ADR-50 B] 부모 접미가 있는 상태 줄 — 한 줄 clamp가 걸리고 전체 문구가 title로 나오며 DOM 텍스트는 '작업 중 · 부모 [세션 1]' 그대로", () => {
    render(<DeskSprite name="sub-1" status="running" isLead={false} parentLabel="[세션 1]" />);

    // DOM 텍스트는 자르지 않는다 — `agentStatusWithParent()` 결과가 그대로 있어야
    // `e2e-04`·`e2e-13`의 `exact: true` 단언이 통과한다(ADR-50 B).
    const statusLine = screen.getByText("작업 중 · 부모 [세션 1]");
    expect(statusLine.textContent).toBe("작업 중 · 부모 [세션 1]");
    // 칸 폭에서 CSS 한 줄 clamp (conventions.md §7 MUST).
    const classes = statusLine.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("truncate");
    expect(classes).toContain("w-full");
    expect(classes).toContain("min-w-0");
    // 전체 문구는 같은 요소의 네이티브 title로 준다(폭 제약 없는 래퍼를 끼우지 않는다).
    expect(statusLine).toHaveAttribute("title", "작업 중 · 부모 [세션 1]");
    expect(statusLine.tagName).toBe("SPAN");
    expect(statusLine.firstElementChild).toBeNull();
  });

  it("[FR-006-AC10][ADR-50 B] 접미 없는 상태 줄에는 title이 없다 — 책상 안 title 요소는 이름 칩 하나뿐이다", () => {
    const { container } = render(
      <DeskSprite name="dev-lead" status="running" isLead parentLabel={null} />,
    );

    const statusLine = screen.getByText("작업 중");
    expect(statusLine).not.toHaveAttribute("title");
    expect(statusLine.className).toContain("truncate");
    // 접미가 없는 상태에서 책상 안 `[title]` 요소는 이름 칩 래퍼 하나다(e2e-13 선택자 전제).
    expect(container.querySelectorAll("span[title]")).toHaveLength(1);
  });

  it("[ADR-50 B] 루트가 칸 폭을 받는다 — w-full·min-w-0이 있고 w-fit이 없다", () => {
    const { container } = render(
      <DeskSprite name="dev-lead" status="running" isLead={false} parentLabel={null} />,
    );

    const root = container.firstElementChild as HTMLElement;
    const classes = root.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("w-full");
    expect(classes).toContain("min-w-0");
    expect(classes).not.toContain("w-fit");
    // 스프라이트 좌우 위치는 변하지 않는다(ADR-46 A·ADR-49 회귀 0).
    expect(classes).toContain("items-center");
  });

  it("[FR-006-AC4][ADR-50 B] 이름 칩 줄도 칸 폭에서 한 줄 clamp된다 — 12자 말줄임은 ellipsis.ts가 그대로 담당한다", () => {
    const { container } = render(
      <DeskSprite name="abcdefghijklmno" status="idle" isLead={false} parentLabel={null} />,
    );

    const nameChip = screen.getByText("abcdefghijkl…");
    // clamp는 **줄 요소**(글자 span을 담은 블록)에 있다 — `Tooltip`이 만드는 span은 inline이라
    // overflow clamp가 걸리지 않고 칸 폭도 내려주지 못한다(ADR-50 B 실측 근거).
    const chipLine = nameChip.parentElement?.parentElement as HTMLElement;
    const classes = chipLine.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("truncate");
    expect(classes).toContain("w-full");
    expect(classes).toContain("min-w-0");
    // 이름 칩의 전체 이름은 기존 `Tooltip`(문자열 말줄임 방식)이 계속 담당한다.
    expect(container.querySelector('[title="abcdefghijklmno"]')).not.toBeNull();
    expect(nameChip.parentElement).toHaveAttribute("title", "abcdefghijklmno");
  });
});
