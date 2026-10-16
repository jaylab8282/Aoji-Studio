/**
 * 08·09·10·07 재조회 신호 스토어 (realtime-spec.md §2 `usage-changed`, §5).
 * - `api/stream.ts`가 `signal(areas, transcripts)`를 부르면 영역별 카운터를 올린다. 화면 훅이 자기 영역 카운터를
 *   구독해 값이 바뀔 때 다시 조회한다(받는 쪽이 그 화면을 열고 있지 않으면 구독자가 없어 무시된다).
 * - `transcripts`가 있으면(`cost`일 때만 값) 10의 대화 기록 띠를 GET 없이 바로 갱신한다. `null`이면 기존 값을 유지한다.
 * - 재연결 성공 때는 `signalAll()`로 전 영역을 올려, 끊긴 동안 놓친 변화를 열려 있는 화면이 다시 조회하게 한다.
 * 컴포넌트는 이 스토어만 구독한다(SSE 메시지를 직접 처리하지 않는다).
 */
import { useSyncExternalStore } from "react";
import type { TranscriptStatus, UsageArea } from "../api/types";

export const USAGE_AREAS: readonly UsageArea[] = ["skills", "mcp", "cost", "limits", "settings"];

export interface UsageSignalState {
  /** 영역별 신호 횟수. 값이 바뀌면 그 영역을 다시 조회한다. */
  counters: Record<UsageArea, number>;
  /** 마지막으로 받은 대화 기록 진행(`cost` 알림의 `transcripts`). 받은 적 없으면 null. */
  transcripts: TranscriptStatus | null;
}

function initialState(): UsageSignalState {
  return { counters: { skills: 0, mcp: 0, cost: 0, limits: 0, settings: 0 }, transcripts: null };
}

let state: UsageSignalState = initialState();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): UsageSignalState {
  return state;
}

/** `usage-changed` 한 건을 반영한다. 같은 영역이 중복으로 와도 한 번만 올린다. */
function signal(areas: readonly UsageArea[], transcripts: TranscriptStatus | null): void {
  const counters = { ...state.counters };
  for (const area of new Set(areas)) {
    counters[area] += 1;
  }
  state = { counters, transcripts: transcripts ?? state.transcripts };
  emit();
}

/** 재연결 성공: 전 영역을 올린다(`transcripts`는 유지). */
function signalAll(): void {
  signal(USAGE_AREAS, null);
}

function reset(): void {
  state = initialState();
  emit();
}

export const usageSignalStore = {
  subscribe,
  getSnapshot,
  signal,
  signalAll,
  reset,
};

export function useUsageSignalStore(): UsageSignalState {
  return useSyncExternalStore(usageSignalStore.subscribe, usageSignalStore.getSnapshot);
}

/** 한 영역의 신호 횟수. 이 값을 효과 의존성에 넣어 다시 조회한다. */
export function useUsageSignal(area: UsageArea): number {
  return useSyncExternalStore(usageSignalStore.subscribe, () => usageSignalStore.getSnapshot().counters[area]);
}

/** 10의 대화 기록 띠가 쓰는 마지막 `transcripts`. */
export function useTranscriptSignal(): TranscriptStatus | null {
  return useSyncExternalStore(usageSignalStore.subscribe, () => usageSignalStore.getSnapshot().transcripts);
}
