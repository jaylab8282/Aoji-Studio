/**
 * 수집 상태 3단계 (ADR-72, FR-003-AC6). 순수 함수(ADR-15).
 *
 * - `hookConfigured && everReceived`   → `live`    시안 칩 `hook 설정됨`
 * - `hookConfigured && !everReceived`  → `neutral` 중립 칩 `hook 설정됨` + `마지막 수신 없음`
 * - `!hookConfigured`                  → `unset`   빨강 칩 `hook 설정 안 됨`(레일 `미설정`)
 *
 * 시간 경과로 단계를 바꾸지 않는다 — 입력에 현재 시각이 없고, 마지막 수신 시각은 표기에만 쓴다.
 */
import { formatRailTimestamp, formatTimestamp, NO_TIME_TEXT } from "../format/time";
import { HOOK_CONFIGURED_TEXT, HOOK_NOT_CONFIGURED_TEXT } from "../text";

export type CollectorStage = "live" | "neutral" | "unset";

export interface CollectorStatusInput {
  hookConfigured: boolean;
  everReceived: boolean;
  lastReceivedAt: string | null;
}

export interface CollectorStatusView {
  stage: CollectorStage;
  /** 칩 글자 */
  chipText: string;
  /** 사이드 탭 상자의 마지막 수신 시각(오늘 `hh:mm:ss`, 아니면 `yyyy-mm-dd hh:mm`, 없으면 `없음`) */
  lastReceivedText: string;
  /** 레일 세 번째 줄(`hh:mm`·`mm-dd` / `없음` / `미설정`) */
  railText: string;
  /** 툴팁(`title`)과 `aria-label`: `수집 상태 · <칩 글자> · 마지막 수신 <시각|없음>` */
  label: string;
}

export const COLLECTOR_RAIL_UNSET_TEXT = "미설정";

export function collectorStage({ hookConfigured, everReceived }: Pick<CollectorStatusInput, "hookConfigured" | "everReceived">): CollectorStage {
  if (!hookConfigured) {
    return "unset";
  }
  return everReceived ? "live" : "neutral";
}

export function deriveCollectorStatus(input: CollectorStatusInput, now: Date = new Date()): CollectorStatusView {
  const stage = collectorStage(input);
  const chipText = stage === "unset" ? HOOK_NOT_CONFIGURED_TEXT : HOOK_CONFIGURED_TEXT;
  const lastReceivedText = input.lastReceivedAt === null ? NO_TIME_TEXT : formatTimestamp(input.lastReceivedAt, now);
  let railText: string;
  if (stage === "unset") {
    railText = COLLECTOR_RAIL_UNSET_TEXT;
  } else if (stage === "neutral") {
    railText = NO_TIME_TEXT;
  } else {
    railText = formatRailTimestamp(input.lastReceivedAt, now);
  }
  return {
    stage,
    chipText,
    lastReceivedText,
    railText,
    label: `수집 상태 · ${chipText} · 마지막 수신 ${lastReceivedText}`,
  };
}
