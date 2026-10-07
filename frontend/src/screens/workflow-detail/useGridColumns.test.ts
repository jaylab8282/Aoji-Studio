import { describe, expect, it } from "vitest";
import { countGridColumns } from "./useGridColumns";

describe("countGridColumns", () => {
  it("[FR-007-AC1] 계산된 grid-template-columns의 트랙 수 = 열 수", () => {
    expect(countGridColumns("281.333px 281.333px 281.333px 281.333px 281.333px 281.333px")).toBe(6);
    expect(countGridColumns("200px 200px 200px 200px")).toBe(4);
    expect(countGridColumns("  500px  ")).toBe(1);
  });

  it("[FR-007-AC1] 읽을 수 없는 값(빈 값·none·repeat 원문)이면 null", () => {
    expect(countGridColumns("")).toBeNull();
    expect(countGridColumns("none")).toBeNull();
    expect(countGridColumns("repeat(auto-fill, minmax(184px, 1fr))")).toBeNull();
  });
});
