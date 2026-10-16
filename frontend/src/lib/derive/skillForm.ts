/**
 * 08-1 스킬 만들기·수정 폼의 파생 계산 (conventions.md §3 Frontend MUST: 값 변환·비활성 판정은 `lib/derive/*` 순수 함수, ADR-15).
 * 기준: ui-spec.md SCR-08-1, api-spec.yaml `SkillDetail`·`SkillCreateRequest`·`SkillUpdateRequest`.
 * 사전 검증은 사용자 편의용이며 서버 검증을 대신하지 않는다(FR-020-AC1).
 */
import type { SkillCreateRequest, SkillDetail, SkillUpdateRequest } from "../../api/types";

export interface SkillFormValues {
  name: string;
  userOnly: boolean;
  description: string;
  body: string;
}

/** FR-020-AC1: 이름 규칙. 접두어는 검사하지 않는다(안내 문구뿐). */
export const SKILL_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;

export function createSkillFormValues(): SkillFormValues {
  return { name: "", userOnly: false, description: "", body: "" };
}

export function detailToSkillFormValues(detail: SkillDetail): SkillFormValues {
  return { name: detail.name, userOnly: detail.userOnly, description: detail.description, body: detail.body };
}

/** 값이 있는데 규칙 밖이면 true. 빈 값은 `저장` 비활성으로만 알린다. */
export function skillNameRuleViolated(raw: string): boolean {
  const name = raw.trim();
  return name.length > 0 && !SKILL_NAME_PATTERN.test(name);
}

/** `저장` 활성 조건(이유 줄 없음): 만들기는 이름·설명, 수정은 설명이 채워져 있어야 한다. */
export function skillRequiredFilled(values: SkillFormValues, mode: "create" | "edit"): boolean {
  if (values.description.trim() === "") return false;
  if (mode === "create") return values.name.trim() !== "" && !skillNameRuleViolated(values.name);
  return true;
}

export function buildSkillCreateRequest(values: SkillFormValues): SkillCreateRequest {
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    userOnly: values.userOnly,
    body: values.body,
  };
}

export function buildSkillUpdateRequest(values: SkillFormValues, revision: string, force: boolean): SkillUpdateRequest {
  return {
    description: values.description.trim(),
    userOnly: values.userOnly,
    body: values.body,
    expectedRevision: revision,
    ...(force ? { force: true } : {}),
  };
}
