import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FloorSelect } from "./FloorSelect";
import type { Workflow } from "../../api/types";

function buildWorkflow(name: string): Workflow {
  return {
    name,
    description: "",
    filePath: `.jaystudio/teams/${name}.json`,
    lead: null,
    members: [],
    brokenRefs: [],
    rawMemberCount: 0,
  };
}

describe("FloorSelect", () => {
  it("[FR-006-AC7] '전체 층 (N개)' + 이름 목록, 선택 시 해당 층만", () => {
    const workflows = [buildWorkflow("워크플로우A"), buildWorkflow("워크플로우B")];
    const handleChange = vi.fn();

    render(<FloorSelect workflows={workflows} value="" onChange={handleChange} />);

    expect(screen.getByRole("option", { name: "전체 층 (2개)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "워크플로우A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "워크플로우B" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "워크플로우A" } });
    expect(handleChange).toHaveBeenCalledWith("워크플로우A");
  });

  it("[FR-006-AC7] 워크플로우 0개 → '전체 층 (0개)'만", () => {
    render(<FloorSelect workflows={[]} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "전체 층 (0개)" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});
