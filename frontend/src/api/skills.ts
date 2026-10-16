/**
 * 08-1·08-2 스킬 쓰기 클라이언트 (api-spec.yaml `/api/skills`·`/api/skills/{skill}`·`/api/skills/import(/preview)`, FR-020·FR-021).
 * 모든 호출은 `api/client.ts`를 거친다(토큰·오류 정규화). 목록·기간 조회는 `api/usage.ts`가 맡는다.
 */
import { apiGet, apiPost, apiPostForm, apiPut } from "./client";
import type {
  SkillCreateRequest,
  SkillDetail,
  SkillImportPreview,
  SkillImportRequest,
  SkillUpdateRequest,
} from "./types";

/** 08-1 수정 폼 채우기. 409 `UNEDITABLE`·404 `SKILL_NOT_FOUND`는 호출부가 처리한다. */
export function fetchSkillDetail(name: string): Promise<SkillDetail> {
  return apiGet<SkillDetail>(`/api/skills/${encodeURIComponent(name)}`);
}

/** 스킬 만들기(FR-020-AC2). 201 `SkillDetail`. */
export function createSkill(request: SkillCreateRequest): Promise<SkillDetail> {
  return apiPost<SkillDetail>("/api/skills", request);
}

/** 스킬 수정(FR-020-AC3·AC4). `force: true`는 08-4 `덮어쓰기`. */
export function updateSkill(name: string, request: SkillUpdateRequest): Promise<SkillDetail> {
  return apiPut<SkillDetail>(`/api/skills/${encodeURIComponent(name)}`, request);
}

/** zip 올리기 → 검사 → 미리보기(FR-021-AC1~AC4). multipart `file`. */
export function previewSkillImport(file: File): Promise<SkillImportPreview> {
  const form = new FormData();
  form.append("file", file, file.name);
  return apiPostForm<SkillImportPreview>("/api/skills/import/preview", form);
}

/** 미리 본 zip을 스킬로 저장(FR-021-AC5·AC6). 201 `SkillDetail`. */
export function importSkill(request: SkillImportRequest): Promise<SkillDetail> {
  return apiPost<SkillDetail>("/api/skills/import", request);
}
