import { describe, expect, it } from "vitest";
import { ellipsis } from "./ellipsis";

describe("ellipsis", () => {
  it("[FR-006-AC4] 13자 → 12자+…", () => {
    expect(ellipsis("abcdefghijklm")).toBe("abcdefghijkl…");
  });

  it("[FR-006-AC4] 12자 이하 → 그대로", () => {
    expect(ellipsis("abcdefghijkl")).toBe("abcdefghijkl");
    expect(ellipsis("short")).toBe("short");
  });
});
