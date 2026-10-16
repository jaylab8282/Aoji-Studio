/**
 * 08-2 가져오기의 상태·요청 처리 (ui-spec.md SCR-08-2, FR-021). 그리기는 `SkillImport.tsx`가 한다.
 * 계약: api-spec.yaml `POST /api/skills/import/preview`(multipart `file`) → `POST /api/skills/import`({uploadId, source, version, license}).
 * 오류 배치(conventions.md §4, ADR-91·ADR-93): 서버 `message`를 가공 없이 쓴다.
 * - preview 400/409 `IMPORT_REJECTED`·500 `IO_FAILED`·그 밖 → 파일 상자 아래 `Alert`, 미리보기 없음(FR-021-E1~E3)
 * - import 404 `UPLOAD_NOT_FOUND` → 같은 자리 `Alert` + 고르기 전으로, 409 `IMPORT_REJECTED` → 같은 자리 `Alert`(미리보기 유지)
 * - import `fields.source`·`fields.license` → 입력 아래, 500 `IO_FAILED` 등 → 아래 줄 위 `Alert`
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { importSkill, previewSkillImport } from "../../api/skills";
import type { SkillImportPreview } from "../../api/types";
import { UNKNOWN_ERROR_MESSAGE } from "../../lib/text";
import { skillsViewStore } from "../../state/skillsViewStore";

export interface SkillImportSource {
  source: string;
  version: string;
  license: string;
}

const EMPTY_SOURCE: SkillImportSource = { source: "", version: "", license: "" };

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : UNKNOWN_ERROR_MESSAGE;
}

export function useSkillImportState(onClose: () => void) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<SkillImportPreview | null>(null);
  /** 파일 상자 바로 아래 `Alert`(거부·만료·이름 중복). */
  const [fileError, setFileError] = useState<string | null>(null);
  const [source, setSource] = useState<SkillImportSource>(EMPTY_SOURCE);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** 아래 줄 위 `Alert`(500 등). */
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  /** 응답이 겹치면 가장 나중에 고른 파일만 반영한다. */
  const pickId = useRef(0);
  useEffect(
    () => () => {
      pickId.current += 1;
    },
    [],
  );

  const pickFile = useCallback((picked: File) => {
    pickId.current += 1;
    const id = pickId.current;
    setFile(picked);
    setPreview(null);
    setFileError(null);
    setFieldErrors({});
    setSubmitError(null);
    setUploading(true);
    previewSkillImport(picked)
      .then((loaded) => {
        if (id !== pickId.current) return;
        setPreview(loaded);
        setUploading(false);
      })
      .catch((error: unknown) => {
        if (id !== pickId.current) return;
        setFileError(messageOf(error));
        setUploading(false);
      });
  }, []);

  const patchSource = useCallback((patch: Partial<SkillImportSource>) => {
    setSource((previous) => ({ ...previous, ...patch }));
  }, []);

  const submit = useCallback(async () => {
    if (preview === null) return;
    setSubmitting(true);
    setFieldErrors({});
    setSubmitError(null);
    setFileError(null);
    try {
      const version = source.version.trim();
      await importSkill({
        uploadId: preview.uploadId,
        source: source.source.trim(),
        version: version === "" ? null : version,
        license: source.license.trim(),
      });
      skillsViewStore.afterSave();
      onCloseRef.current();
    } catch (error) {
      setSubmitting(false);
      const apiError = error instanceof ApiError ? error : null;
      if (apiError?.fields !== undefined && Object.keys(apiError.fields).length > 0) {
        setFieldErrors(apiError.fields);
        return;
      }
      if (apiError?.code === "UPLOAD_NOT_FOUND") {
        // 올린 임시 파일이 만료됐다: 고르기 전으로 돌아간다(FR-021-E5).
        setFile(null);
        setPreview(null);
        setFileError(apiError.message);
        return;
      }
      if (apiError?.code === "IMPORT_REJECTED") {
        setFileError(apiError.message);
        return;
      }
      setSubmitError(messageOf(error));
    }
  }, [preview, source]);

  return { file, uploading, preview, fileError, source, fieldErrors, submitError, submitting, pickFile, patchSource, submit };
}
