import { describe, expect, it } from "vitest";
import { agentOrder } from "./agentOrder";

describe("agentOrder", () => {
  it("[FR-006-AC1] lead 첫 자리, 나머지 단순 문자열 오름차순('Z'<'a' 아님, 소문자 name이므로 'a-2'<'a10')", () => {
    const result = agentOrder({ lead: "dev-lead", members: ["a10", "a-2", "b1"] });
    expect(result).toEqual(["dev-lead", "a-2", "a10", "b1"]);
  });

  it("[FR-006-AC1] lead가 null이면 members만 오름차순으로 반환한다", () => {
    const result = agentOrder({ lead: null, members: ["b", "a"] });
    expect(result).toEqual(["a", "b"]);
  });

  it("[FR-006-AC1] lead는 members 정렬 순서와 무관하게 항상 첫 자리", () => {
    const result = agentOrder({ lead: "z-lead", members: ["a", "b"] });
    expect(result).toEqual(["z-lead", "a", "b"]);
  });
});
