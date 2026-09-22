/**
 * 실시간 연결 상태 스토어 (realtime-spec.md §4 연결 상태 기계).
 * `api/stream.ts`만 값을 바꾸고, 화면은 이 스토어를 구독해 04-3 배너를 그린다.
 */
import { useSyncExternalStore } from "react";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export interface ConnectionStoreState {
  state: ConnectionState;
  /** 연결 끊김일 때 남은 재연결 대기 초. 그 외 상태에서는 0. */
  retryInSec: number;
  /** snapshot·registry·live·event·heartbeat를 받은 마지막 시각(ISO). 04-3 "마지막 갱신" 표시용. */
  lastUpdatedAt: string | null;
}

const initialState: ConnectionStoreState = {
  state: "connecting",
  retryInSec: 0,
  lastUpdatedAt: null,
};

let state: ConnectionStoreState = initialState;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ConnectionStoreState {
  return state;
}

function setConnecting(): void {
  state = { ...state, state: "connecting", retryInSec: 0 };
  emit();
}

function setConnected(): void {
  state = { ...state, state: "connected", retryInSec: 0 };
  emit();
}

function setDisconnected(retryInSec: number): void {
  state = { ...state, state: "disconnected", retryInSec };
  emit();
}

function setRetryInSec(retryInSec: number): void {
  state = { ...state, retryInSec };
  emit();
}

/** snapshot·registry·live·event·heartbeat 수신 시각을 기록한다. */
function touch(nowIso: string): void {
  state = { ...state, lastUpdatedAt: nowIso };
  emit();
}

function reset(): void {
  state = initialState;
  emit();
}

export const connectionStore = {
  subscribe,
  getSnapshot,
  setConnecting,
  setConnected,
  setDisconnected,
  setRetryInSec,
  touch,
  reset,
};

export function useConnectionStore(): ConnectionStoreState {
  return useSyncExternalStore(connectionStore.subscribe, connectionStore.getSnapshot);
}
