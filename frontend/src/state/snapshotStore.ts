/**
 * 스냅샷 스토어 (architecture.md ADR-19: `useSyncExternalStore` 기반 자체 스토어).
 * realtime-spec.md §5 반영 규칙을 그대로 구현한다: snapshot=replace, registry/live=부분 교체,
 * event=prepend(50개 상한). 화면은 이 스토어만 구독한다(conventions.md §3 Frontend MUST).
 */
import { useSyncExternalStore } from "react";
import type { Config, EventRow, Live, Registry, Snapshot } from "../api/types";

const RECENT_EVENTS_LIMIT = 50;

export interface SnapshotState {
  /** 첫 `snapshot`(또는 `GET /api/state`)을 받았는지. false면 04-2 스켈레톤(FR-005-AC9). */
  ready: boolean;
  config: Config | null;
  registry: Registry | null;
  live: Live | null;
  recentEvents: EventRow[];
}

const initialState: SnapshotState = {
  ready: false,
  config: null,
  registry: null,
  live: null,
  recentEvents: [],
};

let state: SnapshotState = initialState;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SnapshotState {
  return state;
}

function replace(data: Snapshot): void {
  state = {
    ready: true,
    config: data.config,
    registry: data.registry,
    live: data.live,
    recentEvents: data.recentEvents.slice(0, RECENT_EVENTS_LIMIT),
  };
  emit();
}

function setRegistry(registry: Registry): void {
  state = { ...state, registry };
  emit();
}

function setLive(live: Live): void {
  state = { ...state, live };
  emit();
}

function prependEvent(event: EventRow): void {
  state = {
    ...state,
    recentEvents: [event, ...state.recentEvents].slice(0, RECENT_EVENTS_LIMIT),
  };
  emit();
}

function reset(): void {
  state = initialState;
  emit();
}

export const snapshotStore = {
  subscribe,
  getSnapshot,
  replace,
  setRegistry,
  setLive,
  prependEvent,
  reset,
};

export function useSnapshotStore(): SnapshotState {
  return useSyncExternalStore(snapshotStore.subscribe, snapshotStore.getSnapshot);
}
