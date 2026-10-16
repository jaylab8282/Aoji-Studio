/**
 * 10-1 단가표 스토어 (ui-spec SCR-10 `단가` 버튼은 `GET /api/pricing` 응답 뒤에 활성, ADR-44).
 * 10 화면과 10-1 창이 같은 응답을 나눈다(단가표는 앱 업데이트 때만 바뀌므로 한 번 받으면 재사용한다).
 * `load()`는 이미 받았거나 받는 중이면 다시 부르지 않는다. 실패하면 `error`를 두고 `load()`를 다시 부르면 재시도한다.
 */
import { useSyncExternalStore } from "react";
import { ApiError } from "../api/client";
import type { PriceTable } from "../api/types";
import { fetchPricing } from "../api/usage";
import { UNKNOWN_ERROR_MESSAGE } from "../lib/text";

export interface PricingState {
  pricing: PriceTable | null;
  error: string | null;
}

let state: PricingState = { pricing: null, error: null };
let inFlight = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PricingState {
  return state;
}

function load(): void {
  if (state.pricing !== null || inFlight) return;
  inFlight = true;
  state = { pricing: null, error: null };
  emit();
  fetchPricing()
    .then((pricing) => {
      state = { pricing, error: null };
    })
    .catch((error: unknown) => {
      state = { pricing: null, error: error instanceof ApiError ? error.message : UNKNOWN_ERROR_MESSAGE };
    })
    .finally(() => {
      inFlight = false;
      emit();
    });
}

function reset(): void {
  state = { pricing: null, error: null };
  inFlight = false;
  emit();
}

export const pricingStore = { subscribe, getSnapshot, load, reset };

export function usePricingStore(): PricingState {
  return useSyncExternalStore(pricingStore.subscribe, pricingStore.getSnapshot);
}
