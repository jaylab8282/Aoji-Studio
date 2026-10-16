/**
 * 08-1 폼의 상태·요청 처리 (ui-spec.md SCR-08-1). 그리기는 `SkillForm.tsx`가 한다.
 * 계약: api-spec.yaml `POST /api/skills` · `GET|PUT /api/skills/{skill}`. 값 변환은 `lib/derive/skillForm.ts`.
 * 오류 배치(conventions.md §4): `fields`가 있으면 필드 아래, 없으면 아래 줄 위 `Alert`에 서버 `message`를 그대로.
 * 404 `SKILL_NOT_FOUND`와 409 `FILE_GONE`은 같은 알림(`저장 중 파일이 사라졌습니다`)이다(D-164 Minor 2, FR-020-E4).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { createSkill, fetchSkillDetail, updateSkill } from "../../api/skills";
import type { SkillDetail } from "../../api/types";
import {
  buildSkillCreateRequest,
  buildSkillUpdateRequest,
  createSkillFormValues,
  detailToSkillFormValues,
  type SkillFormValues,
} from "../../lib/derive/skillForm";
import { SKILL_FILE_GONE_MESSAGE, UNKNOWN_ERROR_MESSAGE } from "../../lib/text";
import { skillsViewStore } from "../../state/skillsViewStore";

export interface SkillFormStateInput {
  mode: "create" | "edit";
  /** 수정 대상 이름(`?skill=`). 만들기면 null. */
  skillName: string | null;
  /** 형식 오류 파일이라 열 수 없을 때(409 `UNEDITABLE`) 창을 닫고 08로 돌아간다(FR-020-E5). */
  onClose: () => void;
}

export function useSkillFormState({ mode, skillName, onClose }: SkillFormStateInput) {
  const [values, setValues] = useState<SkillFormValues>(createSkillFormValues);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflictModifiedAt, setConflictModifiedAt] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const applyDetail = useCallback((loaded: SkillDetail) => {
    setDetail(loaded);
    setValues(detailToSkillFormValues(loaded));
  }, []);

  useEffect(() => {
    if (mode !== "edit" || skillName === null) return;
    let cancelled = false;
    fetchSkillDetail(skillName)
      .then((loaded) => {
        if (cancelled) return;
        applyDetail(loaded);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoading(false);
        const apiError = error instanceof ApiError ? error : null;
        // FR-020-E5: 형식 오류 SKILL.md는 창을 열지 않는다(행 사유가 이미 보인다).
        if (apiError?.code === "UNEDITABLE") {
          onCloseRef.current();
          return;
        }
        setLoadError(apiError === null ? UNKNOWN_ERROR_MESSAGE : apiError.message);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, skillName, applyDetail]);

  const failSubmit = useCallback((error: unknown) => {
    setPending(false);
    setConflictModifiedAt(null);
    const apiError = error instanceof ApiError ? error : null;
    if (apiError === null) {
      setSubmitError(UNKNOWN_ERROR_MESSAGE);
      return;
    }
    const modifiedAt = apiError.details?.modifiedAt;
    if (apiError.code === "REVISION_CONFLICT" && typeof modifiedAt === "string") {
      setConflictModifiedAt(modifiedAt);
      return;
    }
    if (apiError.fields !== undefined && Object.keys(apiError.fields).length > 0) {
      setFieldErrors(apiError.fields);
      return;
    }
    if (apiError.code === "FILE_GONE" || apiError.code === "SKILL_NOT_FOUND") {
      setSubmitError(SKILL_FILE_GONE_MESSAGE);
      return;
    }
    setSubmitError(apiError.message);
  }, []);

  const submit = useCallback(
    async (force: boolean) => {
      setPending(true);
      setFieldErrors({});
      setSubmitError(null);
      // `덮어쓰기` 요청 중에는 08-4를 띄워 둔 채 두 버튼만 비활성으로 둔다.
      if (!force) setConflictModifiedAt(null);
      try {
        if (mode === "create") {
          await createSkill(buildSkillCreateRequest(values));
        } else {
          if (skillName === null || detail === null) {
            setPending(false);
            return;
          }
          await updateSkill(skillName, buildSkillUpdateRequest(values, detail.revision, force));
        }
        skillsViewStore.afterSave();
        onCloseRef.current();
      } catch (error) {
        failSubmit(error);
      }
    },
    [mode, values, skillName, detail, failSubmit],
  );

  /** 08-4 `최신 파일 다시 불러오기`: GET을 다시 호출해 폼을 그 값으로 덮는다(FR-020-AC4). 파일은 쓰지 않는다. */
  const reload = useCallback(async () => {
    if (skillName === null) return;
    setReloading(true);
    try {
      applyDetail(await fetchSkillDetail(skillName));
      setFieldErrors({});
      setSubmitError(null);
      setConflictModifiedAt(null);
    } catch (error) {
      failSubmit(error);
    } finally {
      setReloading(false);
    }
  }, [skillName, applyDetail, failSubmit]);

  const patchValues = useCallback((patch: Partial<SkillFormValues>) => {
    setValues((previous) => ({ ...previous, ...patch }));
  }, []);

  const closeConflict = useCallback(() => setConflictModifiedAt(null), []);

  return {
    values,
    detail,
    loading,
    loadError,
    pending,
    fieldErrors,
    submitError,
    conflictModifiedAt,
    reloading,
    patchValues,
    submit,
    reload,
    closeConflict,
  };
}
