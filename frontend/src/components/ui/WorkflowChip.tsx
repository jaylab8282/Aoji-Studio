/**
 * ui-spec.md §공통 WorkflowChip: `lib/derive/workflowChip.ts`의 문구·variant를 `Chip`으로 그린다.
 * waiting>0 → 권한 대기(주황) / running>0 → 실행 중(초록) / 둘 다 0 → 모두 대기(중립).
 */
import { Chip, type ChipTone } from "./Chip";
import type { WorkflowChipResult } from "../../lib/derive/workflowChip";

const TONE_BY_VARIANT: Record<WorkflowChipResult["variant"], ChipTone> = {
  waiting: "waiting",
  running: "running",
  idle: "idle",
};

export function WorkflowChip({ result }: { result: WorkflowChipResult }) {
  return <Chip tone={TONE_BY_VARIANT[result.variant]}>{result.label}</Chip>;
}
