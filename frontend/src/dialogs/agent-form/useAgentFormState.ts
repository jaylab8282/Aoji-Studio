/**
 * 06 폼의 상태·요청 처리(ui-spec.md SCR-06). 그리기는 `AgentForm.tsx`가 하고,
 * 여기서는 `GET/POST/PUT` 호출과 오류 배치만 다룬다.
 *
 * 계약: api-spec.yaml `POST /api/agents` · `GET|PUT /api/agents/{name}`.
 * 값 변환·요청 조립은 `lib/derive/agentForm.ts` 순수 함수가 한다(ADR-15).
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, apiGet, apiPost, apiPut } from "../../api/client";
import type { AgentDetail } from "../../api/types";
import {
  buildCreateRequest,
  buildUpdateRequest,
  createFormValues,
  detailToFormValues,
  errorSlot,
  type AgentFormValues,
  type FormErrorSlot,
} from "../../lib/derive/agentForm";
import { AGENT_FILE_NOT_FOUND_MESSAGE, UNKNOWN_ERROR_MESSAGE } from "../../lib/text";
import { AGENT_CREATED_NAV_STATE, FORMAT_ERRORS_NAV_STATE } from "../../lib/workflowsNavState";

export interface SubmitError {
  slot: FormErrorSlot;
  message: string;
}

export interface AgentFormMode {
  mode: "create" | "edit";
  agentName: string | null;
  workflowParam: string | null;
}

export function useAgentFormState({ mode, agentName, workflowParam }: AgentFormMode) {
  const navigate = useNavigate();
  const [values, setValues] = useState<AgentFormValues>(() => createFormValues(workflowParam));
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [conflictModifiedAt, setConflictModifiedAt] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const loadDetail = useCallback(
    (name: string) => apiGet<AgentDetail>(`/api/agents/${encodeURIComponent(name)}`),
    [],
  );

  /** FR-002-AC3·FR-011-E3: 형식 오류 파일은 폼을 열지 않고 02의 04-6 목록으로 보낸다. */
  const goToFormatErrors = useCallback(() => {
    navigate("/workflows", { replace: true, state: FORMAT_ERRORS_NAV_STATE });
  }, [navigate]);

  const applyDetail = useCallback((loaded: AgentDetail) => {
    setDetail(loaded);
    setValues(detailToFormValues(loaded));
  }, []);

  const failLoad = useCallback(
    (error: unknown) => {
      setLoading(false);
      const apiError = error instanceof ApiError ? error : null;
      if (apiError?.code === "UNEDITABLE") {
        goToFormatErrors();
        return;
      }
      if (apiError === null) {
        setLoadError(UNKNOWN_ERROR_MESSAGE);
        return;
      }
      setLoadError(apiError.code === "AGENT_NOT_FOUND" ? AGENT_FILE_NOT_FOUND_MESSAGE : apiError.message);
    },
    [goToFormatErrors],
  );

  useEffect(() => {
    if (mode !== "edit" || agentName === null) return;
    let cancelled = false;
    loadDetail(agentName)
      .then((loaded) => {
        if (cancelled) return;
        applyDetail(loaded);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) failLoad(error);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, agentName, loadDetail, applyDetail, failLoad]);

  const failSubmit = useCallback((error: unknown) => {
    setPending(false);
    const apiError = error instanceof ApiError ? error : null;
    // 충돌이 아닌 실패는 06-5를 닫고 폼에 사유를 보여준다(ui-spec.md SCR-06-5 에러 열 "실패 → 폼 에러").
    setConflictModifiedAt(null);
    if (apiError === null) {
      setSubmitError({ slot: "form", message: UNKNOWN_ERROR_MESSAGE });
      return;
    }
    const modifiedAt = apiError.details?.modifiedAt;
    // FR-011-AC4: 저장 직전에 파일이 바뀌었으면 06-5를 띄운다.
    if (apiError.code === "REVISION_CONFLICT" && typeof modifiedAt === "string") {
      setConflictModifiedAt(modifiedAt);
      return;
    }
    // conventions.md §4 MUST: `fields`가 있으면 필드 아래에, 없으면 팝업 에러 영역에 `message`.
    if (apiError.fields !== undefined && Object.keys(apiError.fields).length > 0) {
      setFieldErrors(apiError.fields);
      return;
    }
    setSubmitError({ slot: errorSlot(apiError.code), message: apiError.message });
  }, []);

  const submit = useCallback(
    async (force: boolean) => {
      setPending(true);
      setFieldErrors({});
      setSubmitError(null);
      // `덮어쓰기`(force) 요청 중에는 06-5를 띄워 둔 채 두 버튼만 비활성으로 둔다(ui-spec.md SCR-06-5 로딩 열).
      if (!force) setConflictModifiedAt(null);
      try {
        if (mode === "create") {
          await apiPost<AgentDetail>("/api/agents", buildCreateRequest(values));
          // FR-010-AC5·AC6: 02로 돌아가 새 책상을 보여주고 재시작 안내 줄을 한 번 띄운다.
          navigate("/workflows", { state: AGENT_CREATED_NAV_STATE });
          return;
        }
        if (agentName === null || detail === null) return;
        await apiPut<AgentDetail>(
          `/api/agents/${encodeURIComponent(agentName)}`,
          buildUpdateRequest(values, detail, force),
        );
        navigate("/workflows");
      } catch (error) {
        failSubmit(error);
      }
    },
    [mode, values, agentName, detail, navigate, failSubmit],
  );

  /** 06-5 `최신 파일 다시 불러오기`: GET을 다시 호출해 폼을 그 값으로 덮는다(FR-011-AC4). */
  const reload = useCallback(async () => {
    if (agentName === null) return;
    setReloading(true);
    try {
      applyDetail(await loadDetail(agentName));
      setFieldErrors({});
      setSubmitError(null);
      setConflictModifiedAt(null);
    } catch (error) {
      setConflictModifiedAt(null);
      failSubmit(error);
    } finally {
      setReloading(false);
    }
  }, [agentName, applyDetail, loadDetail, failSubmit]);

  const patchValues = useCallback((patch: Partial<AgentFormValues>) => {
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
