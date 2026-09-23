/**
 * 폼 사전 검증(FR-008-AC2). 사용자 편의용이며 서버 검증을 대신하지 않는다(conventions.md §3).
 * 최종 판정은 항상 서버가 하고(`POST /api/workflows` 400 `VALIDATION`), 여기서는 같은 규칙으로
 * 요청을 보내기 전에 먼저 알려준다.
 */
import { WORKFLOW_NAME_RULE_MESSAGE } from "./text";

/** FR-008-AC2 / api-spec.yaml `POST /api/workflows` requestBody: trim 후 1~40자 */
export const WORKFLOW_NAME_MAX_LENGTH = 40;
/** FR-008-AC2 / api-spec.yaml: `^[가-힣A-Za-z0-9 _-]+$` */
export const WORKFLOW_NAME_PATTERN = /^[가-힣A-Za-z0-9 _-]+$/;

/** 앞뒤 공백 제거(FR-008-AC2). 서버에 보내는 값도 이 값이다. */
export function normalizeWorkflowName(raw: string): string {
  return raw.trim();
}

/** 규칙 위반이면 사전 검증 문구, 통과하면 null. */
export function workflowNameError(raw: string): string | null {
  const name = normalizeWorkflowName(raw);
  if (name.length === 0 || name.length > WORKFLOW_NAME_MAX_LENGTH) return WORKFLOW_NAME_RULE_MESSAGE;
  if (!WORKFLOW_NAME_PATTERN.test(name)) return WORKFLOW_NAME_RULE_MESSAGE;
  return null;
}
