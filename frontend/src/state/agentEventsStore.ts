/**
 * 03 선택 패널 `최근 이벤트` 스토어 (FR-007-AC6, ui-spec.md SCR-03 패널 행, realtime-spec.md §5).
 * - 선택이 바뀌거나 재연결되면 `GET /api/agents/{name}/events?limit=10`을 다시 호출한다.
 * - SSE `event` 메시지는 `api/stream.ts`가 `prependIfMatches`로 넘겨주고, 목록은 10개를 넘지 않는다.
 * 컴포넌트는 이 스토어만 구독한다(conventions.md §3 Frontend MUST).
 */
import { useSyncExternalStore } from "react";
import { apiGet } from "../api/client";
import type { EventRow } from "../api/types";

export const AGENT_EVENTS_LIMIT = 10;

export type AgentEventsStatus = "loading" | "ready" | "error";

export interface AgentEventsState {
  /** 지금 목록이 가리키는 에이전트 name. 선택이 없으면 null. */
  agentName: string | null;
  status: AgentEventsStatus;
  items: EventRow[];
}

const initialState: AgentEventsState = { agentName: null, status: "loading", items: [] };

let state: AgentEventsState = initialState;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AgentEventsState {
  return state;
}

async function load(agentName: string): Promise<void> {
  state = { agentName, status: "loading", items: [] };
  emit();
  try {
    const body = await apiGet<{ items: EventRow[] }>(
      `/api/agents/${encodeURIComponent(agentName)}/events?limit=${AGENT_EVENTS_LIMIT}`,
    );
    if (state.agentName !== agentName) return; // 응답 도착 전에 선택이 바뀌었으면 버린다
    state = { agentName, status: "ready", items: body.items.slice(0, AGENT_EVENTS_LIMIT) };
    emit();
  } catch {
    if (state.agentName !== agentName) return;
    state = { agentName, status: "error", items: [] };
    emit();
  }
}

/** SSE `event`가 선택 에이전트의 이벤트면 맨 앞에 넣고 10개로 자른다(realtime-spec.md §5). */
function prependIfMatches(event: EventRow): void {
  if (state.agentName === null || event.agentType !== state.agentName) return;
  if (state.status !== "ready") return;
  state = { ...state, items: [event, ...state.items].slice(0, AGENT_EVENTS_LIMIT) };
  emit();
}

function reset(): void {
  state = initialState;
  emit();
}

export const agentEventsStore = {
  subscribe,
  getSnapshot,
  load,
  prependIfMatches,
  reset,
};

export function useAgentEventsStore(): AgentEventsState {
  return useSyncExternalStore(agentEventsStore.subscribe, agentEventsStore.getSnapshot);
}
