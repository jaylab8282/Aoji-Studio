/**
 * 10 구독·한도 카드 표시값 (ui-spec SCR-10 `10-6`, FR-027-AC4·AC5·E1·E2): `GET /api/limits` → 행별 표시 상태.
 * 순수 함수다(`now`는 호출부가 넘긴다). 사용률은 정수로 반올림해 `N%`로 보이고, 막대 비율은 반올림 전 값을 쓴다.
 */
import type { LimitState, LimitValue, Limits } from "../../api/types";
import { formatHms } from "../format/time";
import { weekdayOf } from "./usageFormat";

export type LimitSource = "상태줄" | "한도 캐시";

/** 값이 있는 행(`ok`, 초기화 시각이 아직 지나지 않음). */
export interface LimitOkRow {
  kind: "ok";
  percentText: string;
  /** 막대 비율 0~1. */
  ratio: number;
  /** 접근 이름용 정수 퍼센트. */
  percentValue: number;
  resetText: string | null;
  sourceText: string | null;
}

/** `missing`(받은 JSON에 그 한도 필드가 없음) → `값 없음`. */
export interface LimitMissingRow {
  kind: "missing";
  resetText: null;
  sourceText: string | null;
}

/** 초기화 시각이 지남 → `초기화됨 · 새 값 대기`. */
export interface LimitResetRow {
  kind: "reset";
  resetText: string;
  sourceText: string | null;
}

export type LimitRow = LimitOkRow | LimitMissingRow | LimitResetRow;

export interface PlanRow {
  /** null이면 `알 수 없음`. */
  value: string | null;
  sourceText: string | null;
}

export interface LimitsView {
  /** 5시간·주간이 모두 `never`(상태줄·한도 캐시 어디서도 못 받음) → `받은 적 없음` 상자. */
  neverReceived: boolean;
  plan: PlanRow;
  fiveHour: LimitRow;
  sevenDay: LimitRow;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 초기화 시각: 오늘이면 `hh:mm`, 아니면 `MM-DD (요일) hh:mm`(브라우저 로컬). */
export function resetTimeText(iso: string, now: Date): string {
  const date = new Date(iso);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (isSameLocalDate(date, now)) return time;
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day} (${weekdayOf(`${date.getFullYear()}-${day}`)}) ${time}`;
}

/** `<출처> · N분 전 hh:mm:ss`. 받은 시각이 없으면 출처만(출처도 없으면 null). */
export function sourceLineText(source: LimitSource | null, receivedAt: string | null, now: Date): string | null {
  if (source === null) return null;
  if (receivedAt === null) return source;
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(receivedAt).getTime()) / 60_000));
  return `${source} · ${minutes}분 전 ${formatHms(receivedAt)}`;
}

function sourceName(source: LimitValue["source"]): LimitSource | null {
  if (source === "statusline") return "상태줄";
  if (source === "cache") return "한도 캐시";
  return null;
}

function limitRow(value: LimitValue, now: Date): LimitRow {
  const sourceText = sourceLineText(sourceName(value.source), value.receivedAt, now);
  const state: LimitState = value.state;
  if (state !== "ok" || value.usedPercent === null) {
    return { kind: "missing", resetText: null, sourceText };
  }
  const resetText = value.resetsAt === null ? null : resetTimeText(value.resetsAt, now);
  if (value.resetsAt !== null && new Date(value.resetsAt).getTime() <= now.getTime()) {
    return { kind: "reset", resetText: resetTimeText(value.resetsAt, now), sourceText };
  }
  const percentValue = Math.round(value.usedPercent);
  return {
    kind: "ok",
    percentText: `${percentValue}%`,
    ratio: Math.min(1, Math.max(0, value.usedPercent / 100)),
    percentValue,
    resetText,
    sourceText,
  };
}

export function limitsView(limits: Limits, now: Date): LimitsView {
  const planValue = limits.plan.value;
  return {
    neverReceived: limits.fiveHour.state === "never" && limits.sevenDay.state === "never",
    plan: {
      value: planValue,
      sourceText: planValue === null ? null : sourceLineText("상태줄", limits.plan.receivedAt, now),
    },
    fiveHour: limitRow(limits.fiveHour, now),
    sevenDay: limitRow(limits.sevenDay, now),
  };
}
