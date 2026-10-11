/**
 * ui-spec.md SCR-05-L 워크플로우 추가 (`?dialog=workflow-add`, FR-008, `05L-workflow-add*.html`).
 * 계약: api-spec.yaml `POST /api/workflows` — 요청 `{ name, description }`, 201 `Workflow`,
 * 400 `VALIDATION`(`fields.name`), 500 `IO_FAILED`. 에러 문구는 서버 `message`가 아니라 `lib/errorMapping.ts`가
 * ui-rules 표 글자로 만든다(D-142).
 * 새 층은 SSE `registry`로 반영되므로(FR-008-AC4) 여기서 스토어를 직접 고치지 않는다.
 */
import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, apiPost } from "../../api/client";
import type { Workflow } from "../../api/types";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog, DialogFooter, DialogHeader } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { MonoText } from "../../components/ui/MonoText";
import { TextInput } from "../../components/ui/TextInput";
import { workflowCreateErrorMessage, workflowNameFieldMessage } from "../../lib/errorMapping";
import { normalizeWorkflowName, workflowNameError } from "../../lib/validators";
import {
  CANCEL_BUTTON_LABEL,
  UNKNOWN_ERROR_MESSAGE,
  WORKFLOW_ADD_DESCRIPTION_LEAD,
  WORKFLOW_ADD_DESCRIPTION_PATH,
  WORKFLOW_ADD_DESCRIPTION_TAIL,
  WORKFLOW_ADD_LEAD_NOTICE,
  WORKFLOW_ADD_SUBMIT_LABEL,
  WORKFLOW_ADD_SUBMIT_PENDING_LABEL,
  WORKFLOW_ADD_TITLE,
  WORKFLOW_DESCRIPTION_LABEL,
  WORKFLOW_DESCRIPTION_PLACEHOLDER,
  WORKFLOW_NAME_HINT,
  WORKFLOW_NAME_LABEL,
  WRITABLE_FALSE_POPUP_NOTICE,
} from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";

export function WorkflowAddDialog({ onClose }: { onClose: () => void }) {
  const nameId = useId();
  const descriptionId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const { registry } = useSnapshotStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  /** 입력 아래 사유: 사전 검증(FR-008-E2) 또는 서버 `fields.name`을 바꾼 E1·E2 문구. */
  const [nameError, setNameError] = useState<string | null>(null);
  /** 아래 줄 위 `Alert`: `fields`가 없는 오류(FR-008-E3 쓰기 실패 등). */
  const [formError, setFormError] = useState<string | null>(null);

  const writable = registry?.writable !== false;
  const nameIsEmpty = normalizeWorkflowName(name).length === 0;

  function updateName(value: string) {
    setName(value);
    setNameError(null);
    setFormError(null);
  }

  async function handleSubmit() {
    // 사전 검증은 사용자 편의이고 최종 판정은 서버가 한다(conventions.md §3).
    const preValidationError = workflowNameError(name);
    if (preValidationError !== null) {
      setNameError(preValidationError);
      return;
    }

    setPending(true);
    setNameError(null);
    setFormError(null);
    try {
      await apiPost<Workflow>("/api/workflows", {
        name: normalizeWorkflowName(name),
        description,
      });
      // ui-spec.md SCR-05-L: 성공 → 팝업 닫힘. 01에서 열었으면 `/workflows`로 이동한다.
      if (location.pathname === "/") {
        navigate("/workflows");
      } else {
        onClose();
      }
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      if (apiError?.fields?.name !== undefined) {
        setNameError(workflowNameFieldMessage(name));
      } else {
        // client.ts가 모든 예외를 `ApiError`로 정규화한다. 알 수 없는 오류 문구는 conventions.md §4 MUST의 공통 문구 하나만 쓴다.
        setFormError(apiError === null ? UNKNOWN_ERROR_MESSAGE : workflowCreateErrorMessage(apiError.code, apiError.message));
      }
      setPending(false);
    }
  }

  return (
    <Dialog title={WORKFLOW_ADD_TITLE} size="md" wf="05L-1" onClose={onClose}>
      <DialogHeader
        title={WORKFLOW_ADD_TITLE}
        subtitle={
          <>
            {WORKFLOW_ADD_DESCRIPTION_LEAD}
            <MonoText>{WORKFLOW_ADD_DESCRIPTION_PATH}</MonoText>
            {WORKFLOW_ADD_DESCRIPTION_TAIL}
          </>
        }
      />

      <div data-wf="05L-2">
        <Field
          label={WORKFLOW_NAME_LABEL}
          htmlFor={nameId}
          hint={WORKFLOW_NAME_HINT}
          error={nameError ?? undefined}
        >
          <TextInput id={nameId} value={name} disabled={pending} onChange={(event) => updateName(event.target.value)} />
        </Field>
      </div>

      <Field label={WORKFLOW_DESCRIPTION_LABEL} htmlFor={descriptionId} optional>
        <TextInput
          id={descriptionId}
          value={description}
          placeholder={WORKFLOW_DESCRIPTION_PLACEHOLDER}
          disabled={pending}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      {/* FR-008-AC3 안내 박스 */}
      <p data-wf="05L-3" className="rounded-chip bg-inset px-3 py-2 text-aux text-text-secondary">
        {WORKFLOW_ADD_LEAD_NOTICE}
      </p>

      {formError === null ? null : <Alert block message={formError} />}

      <DialogFooter wf="05L-4">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          {CANCEL_BUTTON_LABEL}
        </Button>
        <Button
          variant="primary"
          disabled={nameIsEmpty || pending || !writable}
          onClick={() => void handleSubmit()}
        >
          <Icon name="plus" />
          {pending ? WORKFLOW_ADD_SUBMIT_PENDING_LABEL : WORKFLOW_ADD_SUBMIT_LABEL}
        </Button>
      </DialogFooter>
      {writable ? null : <p className="text-right text-aux text-text-muted">{WRITABLE_FALSE_POPUP_NOTICE}</p>}
    </Dialog>
  );
}
