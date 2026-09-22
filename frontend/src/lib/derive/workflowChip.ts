/**
 * 워크플로우 칩 문구 (ui-spec.md §공통 WorkflowChip, ui-rules.md 1, FR-007-AC9).
 * 우선순위: 권한 대기가 있으면 권한 대기 칩. 순수 함수(architecture.md ADR-15).
 */

export type WorkflowChipVariant = "waiting" | "running" | "idle";

export interface WorkflowChipResult {
  label: string;
  variant: WorkflowChipVariant;
}

export interface WorkflowChipCounts {
  running: number;
  waiting: number;
}

export function workflowChip(counts: WorkflowChipCounts): WorkflowChipResult {
  if (counts.waiting > 0) {
    return { label: `권한 대기 ${counts.waiting}명`, variant: "waiting" };
  }
  if (counts.running > 0) {
    return { label: `실행 중 ${counts.running}명`, variant: "running" };
  }
  return { label: "모두 대기", variant: "idle" };
}
