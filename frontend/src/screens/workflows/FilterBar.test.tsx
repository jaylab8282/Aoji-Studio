import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "./FilterBar";

function renderFilterBar(writable: boolean) {
  render(
    <MemoryRouter>
      <FilterBar
        workflows={[]}
        search=""
        onSearchChange={vi.fn()}
        selectedFloor=""
        onSelectedFloorChange={vi.fn()}
        writable={writable}
      />
    </MemoryRouter>,
  );
}

describe("FilterBar", () => {
  it("[FR-006-AC7] 검색은 폭 200~320(flex 0 1 320, min 200), 층 드롭다운은 220 고정, 추가 버튼은 plus 아이콘", () => {
    renderFilterBar(true);

    const search = screen.getByTestId("search-box");
    expect(search.className).toBe("search-box");
    expect(screen.getByTestId("floor-select").className).toBe("floor-select");
    expect(screen.getByRole("searchbox", { name: "워크플로우·에이전트 이름 검색" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "층 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "워크플로우 추가" }).querySelector("svg.lucide-plus")).not.toBeNull();
  });

  it("[FR-001-E2] writable=false → '워크플로우 추가' 비활성 + '쓰기 권한 없음'", () => {
    renderFilterBar(false);

    expect(screen.getByRole("button", { name: "워크플로우 추가" })).toBeDisabled();
    expect(screen.getByText("쓰기 권한 없음")).toBeInTheDocument();
  });

  it("[FR-001-E2] writable=true → '워크플로우 추가' 활성", () => {
    renderFilterBar(true);

    expect(screen.getByRole("button", { name: "워크플로우 추가" })).toBeEnabled();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
  });
});
