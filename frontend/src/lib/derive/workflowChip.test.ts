import { describe, expect, it } from "vitest";
import { workflowChip } from "./workflowChip";

describe("workflowChip", () => {
  it("[ui-rules 1][FR-007-AC9] waiting>0 → 권한 대기 N명", () => {
    expect(workflowChip({ running: 2, waiting: 1 })).toEqual({
      label: "권한 대기 1명",
      variant: "waiting",
    });
  });

  it("[ui-rules 1][FR-007-AC9] waiting>0이면 running>0이어도 권한 대기 칩이 우선한다", () => {
    expect(workflowChip({ running: 5, waiting: 2 })).toEqual({
      label: "권한 대기 2명",
      variant: "waiting",
    });
  });

  it("[ui-rules 1][FR-007-AC9] running>0 → 실행 중 N명", () => {
    expect(workflowChip({ running: 3, waiting: 0 })).toEqual({
      label: "실행 중 3명",
      variant: "running",
    });
  });

  it("[ui-rules 1][FR-007-AC9] 둘 다 0 → 모두 대기", () => {
    expect(workflowChip({ running: 0, waiting: 0 })).toEqual({
      label: "모두 대기",
      variant: "idle",
    });
  });
});
