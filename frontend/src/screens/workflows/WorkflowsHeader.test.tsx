import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkflowsHeader } from "./WorkflowsHeader";

describe("WorkflowsHeader", () => {
  it("[FR-013-AC3] 팀장 선택 목록·메뉴 없음, 버튼 하나", () => {
    render(<WorkflowsHeader />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Claude 열기 · 기본 세션/ })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
