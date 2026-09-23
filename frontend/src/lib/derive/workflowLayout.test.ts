import { describe, expect, it } from "vitest";
import { floorColumnSpan } from "./workflowLayout";

describe("floorColumnSpan", () => {
  it("[FR-006-AC2] 인원 7 이상 → span 3", () => {
    expect(floorColumnSpan(7)).toBe(3);
    expect(floorColumnSpan(12)).toBe(3);
  });

  it("[FR-006-AC2] 인원 6 이하 → span 1", () => {
    expect(floorColumnSpan(6)).toBe(1);
    expect(floorColumnSpan(1)).toBe(1);
    expect(floorColumnSpan(0)).toBe(1);
  });
});
