import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ExpandableList, EXPANDABLE_LOADING_ROWS } from "./ExpandableList";
import { UsedAgentsButton } from "./UsedAgentsButton";

interface Row {
  name: string;
  agents: number;
}

const ROWS: Row[] = [
  { name: "design-a11y-review", agents: 2 },
  { name: "release-notes", agents: 0 },
];

function Harness({ loading = false, initialOpen = [] as string[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(initialOpen));
  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return (
    <ExpandableList
      label="스킬 목록"
      wf="08-5"
      chevWf="08-12"
      detailWf="08-13"
      headers={["스킬", "사용 에이전트"]}
      columnsClass="skill-row-grid"
      rows={ROWS}
      rowKey={(row) => row.name}
      rowName={(row) => row.name}
      expanded={open}
      onToggle={toggle}
      loading={loading}
      renderCells={(row, control) => (
        <>
          <b>{row.name}</b>
          <UsedAgentsButton count={row.agents} expanded={control.expanded} onToggle={control.toggle} controls={control.detailId} />
        </>
      )}
      renderDetail={(row) => <span>{row.name} 자세히</span>}
    />
  );
}

describe("ExpandableList (ui-spec §공통, ADR-88 결정 2)", () => {
  it("[NFR-12] 처음 모두 접힘: 펼침 버튼 aria-expanded=false, aria-label `<이름> 펼치기`, 펼친 영역 없음", () => {
    const { container } = render(<Harness />);

    const list = screen.getByRole("region", { name: "스킬 목록" });
    expect(list).toHaveAttribute("data-wf", "08-5");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    const chev = screen.getByRole("button", { name: "design-a11y-review 펼치기" });
    expect(chev).toHaveAttribute("aria-expanded", "false");
    expect(chev.querySelector("svg.lucide-chevron-right")).not.toBeNull();
    expect(chev).toHaveClass("size-control");
    expect(container.querySelector(".expand-panel")).toBeNull();
    // 머리 줄 글자: 첫 칸(펼침 버튼 자리)은 비어 있다.
    expect(screen.getByText("스킬")).toBeInTheDocument();
    expect(screen.getByText("사용 에이전트")).toBeInTheDocument();
  });

  it("[NFR-12] 펼치면 aria-expanded=true·`접기`·chevron-down, 그 행 아래 펼친 영역이 생기고 행 바탕이 bg-inset이 된다", () => {
    const { container } = render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "design-a11y-review 펼치기" }));

    const chev = screen.getByRole("button", { name: "design-a11y-review 접기" });
    expect(chev).toHaveAttribute("aria-expanded", "true");
    expect(chev.querySelector("svg.lucide-chevron-down")).not.toBeNull();
    const detail = container.querySelector('[data-wf="08-13"]') as HTMLElement;
    expect(detail).toHaveClass("expand-panel");
    expect(detail).toHaveTextContent("design-a11y-review 자세히");
    expect(chev).toHaveAttribute("aria-controls", detail.id);
    expect(detail.closest("li")).toHaveClass("bg-inset");
    expect(container.querySelectorAll(".expand-panel")).toHaveLength(1);
  });

  it("[NFR-12] 여러 행 동시 펼침: 둘 다 열려 있고, 한 행만 접으면 다른 행은 유지된다", () => {
    const { container } = render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "design-a11y-review 펼치기" }));
    fireEvent.click(screen.getByRole("button", { name: "release-notes 펼치기" }));
    expect(container.querySelectorAll(".expand-panel")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "design-a11y-review 접기" }));
    expect(container.querySelectorAll(".expand-panel")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "release-notes 접기" })).toHaveAttribute("aria-expanded", "true");
  });

  it("[NFR-12] `사용 에이전트 N명` 버튼은 같은 행을 펼치고 접으며 펼침 버튼과 aria-expanded가 같다 (N=0도 동작)", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "사용 에이전트 0명" }));
    expect(screen.getByRole("button", { name: "release-notes 접기" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "사용 에이전트 0명" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "사용 에이전트 2명" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "사용 에이전트 0명" }));
    expect(screen.getByRole("button", { name: "release-notes 펼치기" })).toHaveAttribute("aria-expanded", "false");
  });

  it("펼침 상태는 화면이 넘긴 집합이 정하고, 부모가 행 배열을 바꿔도(기간 전환) 같은 이름의 펼침이 유지된다", () => {
    function PeriodHarness() {
      const [open, setOpen] = useState<ReadonlySet<string>>(new Set(["release-notes"]));
      const [rows, setRows] = useState<Row[]>(ROWS);
      return (
        <>
          <button type="button" onClick={() => setRows([{ name: "release-notes", agents: 5 }])}>
            기간 바꾸기
          </button>
          <ExpandableList
            label="스킬 목록"
            headers={["스킬"]}
            columnsClass="skill-row-grid"
            rows={rows}
            rowKey={(row) => row.name}
            rowName={(row) => row.name}
            expanded={open}
            onToggle={(key) => setOpen(new Set([...open].filter((name) => name !== key)))}
            renderCells={(row) => <b>{row.name}</b>}
            renderDetail={(row) => <span>{row.agents}명</span>}
          />
        </>
      );
    }
    render(<PeriodHarness />);

    expect(screen.getByRole("button", { name: "release-notes 접기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "기간 바꾸기" }));
    expect(screen.getByRole("button", { name: "release-notes 접기" })).toBeInTheDocument();
    expect(screen.getByText("5명")).toBeInTheDocument();
  });

  it("로딩 = 행 8개 스켈레톤(펼침 버튼·이름·값 자리), 머리 줄 글자는 그대로 보이고 aria-busy", () => {
    render(<Harness loading />);

    const list = screen.getByRole("region", { name: "스킬 목록" });
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("expandable-skeleton-row")).toHaveLength(EXPANDABLE_LOADING_ROWS);
    expect(EXPANDABLE_LOADING_ROWS).toBe(8);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("스킬")).toBeInTheDocument();
  });
});
