/**
 * 08 화면이 받은 마지막 `GET /api/skills` 응답을 08-3 삭제 창과 나누는 작은 스토어 (ui-spec SCR-08-3: 에이전트 목록의 출처는 08의 `definedAgents`).
 * - 08 화면이 응답을 올리고, 08을 떠나면 비운다.
 * - 삭제가 끝났을 때 행을 먼저 빼고 08에 다시 조회를 요청한다(`refreshTick`). 최종 값은 재조회가 정한다.
 * 기간 조회 자체는 `api/usage.ts`만 부른다(conventions §7).
 */
import { useSyncExternalStore } from "react";
import type { SkillsReport } from "../api/types";

export interface SkillsViewState {
  report: SkillsReport | null;
  /** 값이 바뀌면 08이 다시 조회한다. */
  refreshTick: number;
}

const initialState: SkillsViewState = { report: null, refreshTick: 0 };
let state: SkillsViewState = initialState;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SkillsViewState {
  return state;
}

function setReport(report: SkillsReport | null): void {
  state = { ...state, report };
  emit();
}

function requestRefresh(): void {
  state = { ...state, refreshTick: state.refreshTick + 1 };
  emit();
}

/** 삭제 성공 직후: 그 행을 목록에서 빼고 다시 조회를 요청한다. */
function afterDelete(name: string): void {
  const report = state.report;
  state = {
    report: report === null ? null : { ...report, skills: report.skills.filter((skill) => skill.name !== name) },
    refreshTick: state.refreshTick + 1,
  };
  emit();
}

function reset(): void {
  state = initialState;
  emit();
}

export const skillsViewStore = { subscribe, getSnapshot, setReport, requestRefresh, afterDelete, reset };

export function useSkillsViewStore(): SkillsViewState {
  return useSyncExternalStore(skillsViewStore.subscribe, skillsViewStore.getSnapshot);
}
