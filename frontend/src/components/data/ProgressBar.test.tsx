import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar (ui-spec §공통, 10 첫 읽기)", () => {
  it("[NFR-12] role=progressbar: aria-valuenow = 읽은 파일, aria-valuemax = 전체, 채움은 --progress-ratio 하나", () => {
    render(<ProgressBar value={412} max={1280} label="읽은 파일" />);

    const bar = screen.getByRole("progressbar", { name: "읽은 파일" });
    expect(bar).toHaveAttribute("aria-valuenow", "412");
    expect(bar).toHaveAttribute("aria-valuemax", "1280");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveClass("w-progress", "h-meter");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.getAttribute("style")).toBe(`--progress-ratio: ${412 / 1280};`);
  });

  it("전체가 0이면 비율 0, 읽은 수가 전체를 넘어도 1을 넘지 않는다", () => {
    const empty = render(<ProgressBar value={0} max={0} label="읽은 파일" />);
    expect((empty.getByRole("progressbar").firstElementChild as HTMLElement).getAttribute("style")).toBe("--progress-ratio: 0;");
    empty.unmount();

    render(<ProgressBar value={9} max={3} label="읽은 파일" />);
    expect((screen.getByRole("progressbar").firstElementChild as HTMLElement).getAttribute("style")).toBe("--progress-ratio: 1;");
  });
});
