/**
 * ui-spec.md §공통 Chip 계열 요소의 공용 껍데기(프로젝트 칩, WorkflowChip 등에서 조립해 쓴다).
 */
import type { ReactNode } from "react";

export type ChipTone = "neutral" | "running" | "waiting" | "idle";

const TONE_CLASSES: Record<ChipTone, string> = {
  neutral: "bg-soft text-text-secondary",
  running: "bg-running-soft text-running",
  waiting: "bg-waiting-soft text-waiting",
  idle: "bg-selected text-text-secondary",
};

interface ChipProps {
  tone?: ChipTone;
  mono?: boolean;
  children: ReactNode;
}

export function Chip({ tone = "neutral", mono = false, children }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-aux ${TONE_CLASSES[tone]} ${mono ? "font-mono" : ""}`}
    >
      {children}
    </span>
  );
}
