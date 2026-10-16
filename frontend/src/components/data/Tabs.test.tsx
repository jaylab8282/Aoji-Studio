import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";
import { tabId, tabPanelId } from "./tabIds";

const TABS = [
  { id: "model", label: "모델별" },
  { id: "session", label: "세션별" },
  { id: "agent", label: "에이전트별" },
] as const;

function Harness({ initial = "model" }: { initial?: (typeof TABS)[number]["id"] }) {
  const [selected, setSelected] = useState<(typeof TABS)[number]["id"]>(initial);
  return (
    <>
      <Tabs tabs={TABS} selected={selected} onSelect={setSelected} label="나눔" idPrefix="cost" />
      <div role="tabpanel" id={tabPanelId("cost")} aria-labelledby={tabId("cost", selected)}>
        {selected}
      </div>
    </>
  );
}

describe("Tabs (ui-spec §공통, 10)", () => {
  it("[NFR-12] role=tablist, 각 탭 role=tab + aria-selected, 선택 탭만 Tab 순서에 들어간다", () => {
    render(<Harness />);

    expect(screen.getByRole("tablist", { name: "나눔" })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["모델별", "세션별", "에이전트별"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(tabs[0]).toHaveClass("text-text", "min-h-tab");
    expect(tabs[1]).toHaveClass("text-text-muted");
    // 선택 탭은 아래 2px brand-blue 막대, 그 밖에는 없다.
    expect(tabs[0]?.querySelector(".bg-brand-blue")).not.toBeNull();
    expect(tabs[1]?.querySelector(".bg-brand-blue")).toBeNull();
  });

  it("[NFR-12] 탭 패널과 연결된다: aria-controls = 패널 id, 패널 aria-labelledby = 선택 탭 id", () => {
    render(<Harness />);

    const selected = screen.getByRole("tab", { name: "모델별" });
    const panel = screen.getByRole("tabpanel");
    expect(selected).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAccessibleName("모델별");

    fireEvent.click(screen.getByRole("tab", { name: "세션별" }));
    expect(screen.getByRole("tab", { name: "세션별" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("세션별");
  });

  it("[NFR-12] ←/→/Home/End로 탭을 옮기면 선택과 초점이 함께 움직인다(끝에서 순환)", () => {
    render(<Harness />);

    fireEvent.keyDown(screen.getByRole("tab", { name: "모델별" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "세션별" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "세션별" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("tab", { name: "세션별" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "에이전트별" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("tab", { name: "에이전트별" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "모델별" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "모델별" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "에이전트별" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "에이전트별" }), { key: "Home" });
    expect(screen.getByRole("tab", { name: "모델별" })).toHaveFocus();
  });
});
