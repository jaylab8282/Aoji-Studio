import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Minimap } from "./Minimap";
import type { Workflow } from "../../api/types";

function buildWorkflow(name: string, memberCount: number): Workflow {
  return {
    name,
    description: "",
    filePath: `.jaystudio/teams/${name}.json`,
    lead: "lead",
    members: Array.from({ length: memberCount }, (_, index) => `${name}-${index}`),
    brokenRefs: [],
    rawMemberCount: memberCount + 1,
  };
}

function renderMinimap(workflows: Workflow[]) {
  return render(<Minimap workflows={workflows} scrollRef={createRef<HTMLDivElement>()} />);
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
});
