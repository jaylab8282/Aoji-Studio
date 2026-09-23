/**
 * 04-4 수집 중단 판정과 03 표시 상태 고정 (FR-007-E1, ADR-17, ui-spec.md SCR-04-4). 순수 함수(ADR-15).
 *
 * 배너가 보이는 동안 **03의 표시만** 대기로 고정한다(캐릭터 색·말풍선·상태 글자·패널 `상태`·`현재 도구`).
 * `live` 값과 01·02 화면, API 응답은 그대로다 — 상태 계산 규칙(FR-004-AC1)은 건드리지 않는다.
 */
import type { Status } from "../../api/types";

export interface CollectorDownInput {
  everReceived: boolean;
  hookConfigured: boolean;
}

export function isCollectorDown({ everReceived, hookConfigured }: CollectorDownInput): boolean {
  return !everReceived || !hookConfigured;
}

/** 03 렌더링에 쓸 표시 상태. 수집 중단이면 실제 상태와 무관하게 `idle`. */
export function displayStatus(status: Status, collectorDown: boolean): Status {
  return collectorDown ? "idle" : status;
}
