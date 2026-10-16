/**
 * 08 행 파생 값 (ui-spec SCR-08 활용도 칸, FR-018-AC1·AC6, FR-019-AC2·AC7, FR-020-E2).
 * 서버가 이름 오름차순(FR-018-AC1)으로 준 순서를 그대로 쓴다. 막대 길이 = 이 스킬 `usage.total` / 가장 많이 쓴 스킬의 `usage.total`.
 */
import type { SkillRow } from "../../api/types";
import { SKILL_EDIT_REASON_FORMAT_ERROR, SKILL_EDIT_REASON_IMPORTED, WRITABLE_FALSE_REASON } from "../text";
import { percentText } from "./usageFormat";

export interface SkillRowView {
  row: SkillRow;
  /** `N.N`(소수 첫째 자리). null이면 `기록 없음`(막대 없음). */
  percent: string | null;
  /** 막대 채움 비율 0~1. */
  barRatio: number;
}

/** 가장 많이 쓴 스킬의 `usage.total`. 스킬이 없거나 모두 0이면 0. */
export function maxTotal(skills: readonly SkillRow[]): number {
  return skills.reduce((max, skill) => Math.max(max, skill.usage.total), 0);
}

export function barRatio(total: number, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, total / max)) : 0;
}

export function deriveSkillRows(skills: readonly SkillRow[]): SkillRowView[] {
  const max = maxTotal(skills);
  return skills.map((row) => ({
    row,
    percent: percentText(row.percent),
    barRatio: barRatio(row.usage.total, max),
  }));
}

/** 행 `삭제` 비활성(FR-020-E2): `writable=false`만이다(사유 `쓰기 권한 없음`). 가져온·형식 오류 스킬도 삭제할 수 있다(FR-022-AC4). */
export function deleteDisabled(writable: boolean): boolean {
  return !writable;
}

/** 행 `data-wf` 표식: 형식 오류 `08-9` > 가져온 스킬 `08-10` > 사용자 전용 `08-11`. */
export function rowMarkerWf(row: SkillRow): string | undefined {
  if (row.formatError !== null) return "08-9";
  if (row.imported) return "08-10";
  if (row.userOnly) return "08-11";
  return undefined;
}

/**
 * 행 `수정` 비활성 사유(ui-spec SCR-08 행 동작, 우선순위 쓰기 권한 > 가져온 스킬 > 형식 오류). 활성이면 null.
 * `writable`이 null(첫 스냅샷 전)이면 비활성이지만 이유 줄은 없다(ADR-44) — 호출부가 `editDisabled`로 따로 본다.
 */
export function editDisabledReason(row: SkillRow, writable: boolean): string | null {
  if (!writable) return WRITABLE_FALSE_REASON;
  if (row.imported) return SKILL_EDIT_REASON_IMPORTED;
  if (row.formatError !== null) return SKILL_EDIT_REASON_FORMAT_ERROR;
  return null;
}
