import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FloorSelect } from "./FloorSelect";
import type { Workflow } from "../../api/types";

function buildWorkflow(name: string): Workflow {
  return {
    name,
    description: "",
    filePath: `.aojistudio/teams/${name}.json`,
    lead: null,
    members: [],
    brokenRefs: [],
    rawMemberCount: 0,
    rawLead: null,
    rawMembers: [],
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

  it("[FR-006-AC7] 층 30개에서도 한 줄·폭 220 유지: 선택 글자는 한 줄 말줄임(truncate), 폭은 목록 길이와 무관", () => {
    const workflows = Array.from({ length: 30 }, (_, index) => buildWorkflow(`아주 긴 워크플로우 이름 ${index + 1} `.repeat(3)));
    render(<FloorSelect workflows={workflows} value={workflows[29]!.name} onChange={vi.fn()} />);

    expect(screen.getAllByRole("option")).toHaveLength(31);
    expect(screen.getByRole("option", { name: "전체 층 (30개)" })).toBeInTheDocument();
    const select = screen.getByRole("combobox");
    expect(select.className).toContain("truncate");
    expect(select.className).toContain("w-full");
    expect(screen.getByTestId("floor-select").className).toBe("floor-select");
  });
});
