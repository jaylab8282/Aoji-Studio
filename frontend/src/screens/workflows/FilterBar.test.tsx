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
  it("[FR-001-E2] writable=false → '+ 워크플로우 추가' 비활성 + '쓰기 권한 없음'", () => {
    renderFilterBar(false);

    expect(screen.getByRole("button", { name: "+ 워크플로우 추가" })).toBeDisabled();
    expect(screen.getByText("쓰기 권한 없음")).toBeInTheDocument();
  });

  it("[FR-001-E2] writable=true → '+ 워크플로우 추가' 활성", () => {
    renderFilterBar(true);

    expect(screen.getByRole("button", { name: "+ 워크플로우 추가" })).toBeEnabled();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
  });
});
