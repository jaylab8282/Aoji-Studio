/**
 * 08 화면이 받은 마지막 `GET /api/skills` 응답을 08-3 삭제 창과 나누는 작은 스토어 (ui-spec SCR-08-3: 에이전트 목록의 출처는 08의 `definedAgents`).
 * - 08 화면이 응답을 올리고, 08을 떠나면 비운다.
 * - 08-1 저장·08-2 가져오기가 끝나면 `afterSave`로 다시 조회를 요청하고 안내 줄 ① 신호(`savedTick`)를 올린다.
 * - 삭제가 끝났을 때 행을 먼저 빼고 08에 다시 조회를 요청한다(`refreshTick`). 최종 값은 재조회가 정한다.
 * 기간 조회 자체는 `api/usage.ts`만 부른다(conventions §7).
 */
import { useSyncExternalStore } from "react";
import type { SkillsReport } from "../api/types";

export interface SkillsViewState {
  report: SkillsReport | null;
  /** 값이 바뀌면 08이 다시 조회한다. */
  refreshTick: number;
  /** 08-1·08-2 저장 성공 횟수. 늘어나면 08이 안내 줄 ①을 8000ms 보인다(FR-020-AC5). */
  savedTick: number;
}

const initialState: SkillsViewState = { report: null, refreshTick: 0, savedTick: 0 };
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
    ...state,
    report: report === null ? null : { ...report, skills: report.skills.filter((skill) => skill.name !== name) },
    refreshTick: state.refreshTick + 1,
  };
  emit();
}

/** 08-1 저장·08-2 가져오기 성공 직후: 08에 다시 조회를 요청하고 저장 후 안내 줄을 띄우게 한다(최종 목록은 재조회가 정한다). */
function afterSave(): void {
  state = { ...state, refreshTick: state.refreshTick + 1, savedTick: state.savedTick + 1 };
  emit();
}

function reset(): void {
  state = initialState;
  emit();
}

export const skillsViewStore = { subscribe, getSnapshot, setReport, requestRefresh, afterDelete, afterSave, reset };

export function useSkillsViewStore(): SkillsViewState {
  return useSyncExternalStore(skillsViewStore.subscribe, skillsViewStore.getSnapshot);
}
