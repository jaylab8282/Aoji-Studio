import { describe, expect, it } from "vitest";
import { workflowCardBorder } from "./workflowCardBorder";

describe("workflowCardBorder", () => {
  it("[FR-006-AC5] 팀장 없음 → danger-border (running·waiting보다 우선)", () => {
    expect(workflowCardBorder({ running: 0, waiting: 0, leadMissing: true })).toBe("border-danger-border");
    expect(workflowCardBorder({ running: 3, waiting: 2, leadMissing: true })).toBe("border-danger-border");
  });

  it("[FR-006-AC5] running>0 → running-border (waiting>0이어도 running 우선)", () => {
    expect(workflowCardBorder({ running: 1, waiting: 0, leadMissing: false })).toBe("border-running-border");
    expect(workflowCardBorder({ running: 5, waiting: 1, leadMissing: false })).toBe("border-running-border");
  });

  it("[FR-006-AC5] running=0·waiting>0 → waiting", () => {
    expect(workflowCardBorder({ running: 0, waiting: 1, leadMissing: false })).toBe("border-waiting");
  });

  it("[FR-006-AC5] 모두 대기 → border", () => {
    expect(workflowCardBorder({ running: 0, waiting: 0, leadMissing: false })).toBe("border-border");
  });
});
