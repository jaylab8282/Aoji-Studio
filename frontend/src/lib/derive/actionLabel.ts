/**
 * 03 오피스 캐릭터 말풍선 문구·색 (FR-007-AC2, ui-spec.md SCR-03 오피스 그리드 행, pixel-sprites.md 동작 표현).
 * 순수 함수(ADR-15). 문구는 `lib/text.ts` 상수·조립 함수만 쓴다(conventions.md §2 MUST).
 *
 * - waiting  → `권한 요청` (주황 채움 말풍선)
 * - idle     → `대기` (회색 말풍선)
 * - running + Edit·Write·NotebookEdit → `타이핑 · <도구>`
 * - running + Read·Grep·Glob          → `읽기 · <도구>`
 * - running + 그 밖의 도구(Bash·WebFetch 등) → `<도구>` 이름 그대로
 * - running + 도구 없음 → `작업 중`
 */
import type { Status, ToolRef } from "../../api/types";
import {
  ACTION_LABEL_PERMISSION,
  STATUS_LABEL_TEXT_SHORT,
  readingActionLabel,
  typingActionLabel,
} from "../text";

/** 말풍선 색 계열. 렌더링(채움·회색·테두리)은 `OfficeSprite`가 정한다. */
export type ActionTone = Status;

export interface ActionLabelResult {
  label: string;
  tone: ActionTone;
}

const TYPING_TOOLS = ["Edit", "Write", "NotebookEdit"];
const READING_TOOLS = ["Read", "Grep", "Glob"];

export function actionLabel(status: Status, currentTool: ToolRef | null): ActionLabelResult {
  if (status === "waiting") {
    return { label: ACTION_LABEL_PERMISSION, tone: "waiting" };
  }
  if (status === "idle") {
    return { label: STATUS_LABEL_TEXT_SHORT.idle, tone: "idle" };
  }
  if (currentTool === null) {
    return { label: STATUS_LABEL_TEXT_SHORT.running, tone: "running" };
  }
  if (TYPING_TOOLS.includes(currentTool.name)) {
    return { label: typingActionLabel(currentTool.name), tone: "running" };
  }
  if (READING_TOOLS.includes(currentTool.name)) {
    return { label: readingActionLabel(currentTool.name), tone: "running" };
  }
  return { label: currentTool.name, tone: "running" };
}
