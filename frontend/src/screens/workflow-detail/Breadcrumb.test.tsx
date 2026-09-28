import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkflowBreadcrumb } from "./Breadcrumb";
import { BREADCRUMB_SEPARATOR } from "../../lib/text";

describe("WorkflowBreadcrumb", () => {
  it("[T-016] ui-spec SCR-03 브레드크럼: 홈 → /, 에이전트 워크플로우 → /workflows, 마지막은 워크플로우 이름", () => {
    render(
      <MemoryRouter>
        <WorkflowBreadcrumb name="개발부서" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "홈" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "에이전트 워크플로우" })).toHaveAttribute("href", "/workflows");
    expect(screen.getByText("개발부서")).toBeInTheDocument();
  });

  it("[ADR-49] 홈·에이전트 워크플로우 링크에 hover:underline과 focus-visible:underline이 함께 있고, 글자색 클래스(text-text-secondary)와 href가 그대로다", () => {
    render(
      <MemoryRouter>
        <WorkflowBreadcrumb name="개발부서" />
      </MemoryRouter>,
    );

    for (const [name, href] of [
      ["홈", "/"],
      ["에이전트 워크플로우", "/workflows"],
    ] as const) {
      const link = screen.getByRole("link", { name });
      expect(link, name).toHaveAttribute("href", href);
      expect(link, name).toHaveClass("hover:underline");
      expect(link, name).toHaveClass("focus-visible:underline");
      // 글자색은 바꾸지 않는다(ui-spec §공통 표 ④ — 표현은 밑줄뿐이다).
      expect(link, name).toHaveClass("text-text-secondary");
      expect(link.className, name).not.toMatch(/(?:hover|focus-visible):(?!underline)/);
    }
  });

  it("[ADR-49] 현재 위치(워크플로우 이름)와 구분자에는 hover·focus 클래스가 없다", () => {
    render(
      <MemoryRouter>
        <WorkflowBreadcrumb name="개발부서" />
      </MemoryRouter>,
    );

    const current = screen.getByText("개발부서");
    expect(current.tagName).toBe("SPAN");
    expect(current.className).not.toMatch(/hover:|focus-visible:/);

    const separators = screen.getAllByText(BREADCRUMB_SEPARATOR);
    expect(separators).toHaveLength(2);
    for (const separator of separators) {
      expect(separator.className).not.toMatch(/hover:|focus-visible:/);
    }
  });
});
