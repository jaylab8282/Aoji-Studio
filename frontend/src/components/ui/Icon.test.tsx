import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, type IconName } from "./Icon";

const EXPECTED_30: ReadonlyArray<IconName> = [
  "house",
  "building",
  "settings",
  "square-terminal",
  "search",
  "chevron-down",
  "plus",
  "import",
  "arrow-right",
  "trash-2",
  "triangle-alert",
  "zoom-in",
  "zoom-out",
  "scan",
  "chevron-left",
  "wifi-off",
  "refresh-cw",
  "copy",
  "pencil",
  "folder-x",
  "circle-alert",
  "check",
  "file-warning",
  // v1.2.0 새 이름 7종
  "puzzle",
  "plug",
  "coins",
  "receipt",
  "info",
  "chevron-right",
  "file-archive",
];

describe("Icon [NFR-12]", () => {
  it("[NFR-12] 대응표는 ui-spec 아이콘 표 30종(v1.1.0 23종 + v1.2.0 7종)과 정확히 같다(IconName이 하나라도 다르면 컴파일 오류)", () => {
    const exact: Record<IconName, true> = Object.fromEntries(EXPECTED_30.map((n) => [n, true])) as Record<IconName, true>;
    expect(Object.keys(exact)).toHaveLength(30);
    expect(new Set(EXPECTED_30).size).toBe(30);
  });

  it.each(EXPECTED_30)("[NFR-12] %s 렌더 · stroke-width 1.75 · aria-hidden", (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("stroke-width", "1.75");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it.each(["puzzle", "plug", "coins", "receipt", "info", "chevron-right", "file-archive"] as const)(
    "[NFR-12] v1.2.0 새 이름 %s → lucide 같은 이름 아이콘",
    (name) => {
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector(`svg.lucide-${name}`)).not.toBeNull();
    },
  );

  it.each([
    ["sm", "16"],
    ["md", "18"],
    ["lg", "24"],
  ] as const)("[NFR-12] size %s = %spx", (size, px) => {
    const { container } = render(<Icon name="house" size={size} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", px);
    expect(svg).toHaveAttribute("height", px);
  });

  it("[NFR-12] 기본 크기는 sm 16", () => {
    const { container } = render(<Icon name="check" />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "16");
  });

  it("[NFR-12] 표 밖 이름은 타입 오류", () => {
    // @ts-expect-error 표 밖 이름은 IconName에 없어 컴파일되지 않는다
    const el = <Icon name="rocket" />;
    expect(el.props.name).toBe("rocket");
  });
});
