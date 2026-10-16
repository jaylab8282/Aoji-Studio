import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Meter } from "./Meter";
import { clampRatio } from "../../lib/derive/ratio";

describe("Meter (ui-spec §공통, ADR-88 결정 2·5)", () => {
  it("[NFR-12] 08 활용도: role=img + aria-label, 채움 비율은 --meter-ratio 하나로만 넘기고 색은 값과 무관한 중립이다", () => {
    render(<Meter ratio={0.92} label="활용도 19.6%" />);

    const meter = screen.getByRole("img", { name: "활용도 19.6%" });
    expect(meter).toHaveClass("h-meter", "bg-inset", "border-border");
    const fill = meter.firstElementChild as HTMLElement;
    expect(fill.style.getPropertyValue("--meter-ratio")).toBe("0.92");
    expect(fill).toHaveClass("meter-fill");
    // 인라인 스타일은 CSS 변수 하나뿐이다(색·크기 값 없음).
    expect(fill.getAttribute("style")).toBe("--meter-ratio: 0.92;");
    expect(fill.className).not.toMatch(/live|waiting|danger|action/);
    expect(meter).not.toHaveAttribute("aria-valuenow");
  });

  it("[NFR-12] 10 한도: role=meter + aria-valuemin/max/now(백분율), 높이 10", () => {
    render(<Meter ratio={0.42} label="5시간 한도 42%" role="meter" limit />);

    const meter = screen.getByRole("meter", { name: "5시간 한도 42%" });
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter).toHaveAttribute("aria-valuenow", "42");
    expect(meter).toHaveClass("h-meter-limit");
  });

  it("사용률이 높아도 색이 바뀌지 않는다: 0.99와 0.1의 채움 클래스가 같고, 범위 밖 값은 0~1로 자른다", () => {
    const high = render(<Meter ratio={0.99} label="높음" />);
    const highClass = (high.getByRole("img").firstElementChild as HTMLElement).className;
    high.unmount();
    const low = render(<Meter ratio={0.1} label="낮음" />);
    expect((low.getByRole("img").firstElementChild as HTMLElement).className).toBe(highClass);
    low.unmount();

    expect(clampRatio(1.7)).toBe(1);
    expect(clampRatio(-3)).toBe(0);
    expect(clampRatio(Number.NaN)).toBe(0);
  });
});
