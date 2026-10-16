import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTitle } from "./DataTitle";

describe("DataTitle (ui-spec §공통, 08·09·10)", () => {
  it("[NFR-12] 제목은 h2(font/title 700), 보조 글자는 text-muted, 오른쪽 묶음은 children이 있을 때만", () => {
    const { rerender, container } = render(
      <DataTitle title="스킬" subtitle=".claude/skills/ · 12개" wf="08-2">
        <button type="button">스킬 만들기</button>
      </DataTitle>,
    );

    const heading = screen.getByRole("heading", { level: 2, name: "스킬" });
    expect(heading).toHaveClass("text-title", "font-bold", "tracking-title");
    expect(screen.getByText(".claude/skills/ · 12개")).toHaveClass("text-text-muted");
    expect(container.querySelector('[data-wf="08-2"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "스킬 만들기" })).toBeInTheDocument();

    rerender(<DataTitle title="스킬" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("p")).toBeNull();
  });
});
