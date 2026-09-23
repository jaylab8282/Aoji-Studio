/**
 * 워크플로우 카드·층 카드의 테두리 색 (ADR-24, ui-spec.md SCR-02 층 카드 행, conventions.md §7 MUST).
 * 01 대표 워크플로우 카드와 02 층 카드가 같은 규칙을 쓴다. 순수 함수(ADR-15).
 * 우선순위: 팀장 없음 → danger-border / running > 0 → running-border / running 0·waiting > 0 → waiting / 그 밖 → 기본.
 * 칩(`workflowChip`)은 권한 대기를 우선하지만 테두리는 running을 우선한다(02 기준 PNG 워크플로우 A = `#2C4A3C`).
 */

export interface WorkflowCardBorderInput {
  running: number;
  waiting: number;
  /** 팀장이 없는 워크플로우(02 층 카드). 01 대표 카드는 항상 false다. */
  leadMissing: boolean;
}

export type WorkflowCardBorderClass =
  | "border-danger-border"
  | "border-running-border"
  | "border-waiting"
  | "border-border";

export function workflowCardBorder({ running, waiting, leadMissing }: WorkflowCardBorderInput): WorkflowCardBorderClass {
  if (leadMissing) return "border-danger-border";
  if (running > 0) return "border-running-border";
  if (waiting > 0) return "border-waiting";
  return "border-border";
}
