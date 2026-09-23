import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkflowBreadcrumb } from "./Breadcrumb";

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
});
