/**
 * ui-spec.md SCR-05-L 워크플로우 추가 (`?dialog=workflow-add`, FR-008).
 * 계약: api-spec.yaml `POST /api/workflows` — 요청 `{ name, description }`, 201 `Workflow`,
 * 400 `VALIDATION`(`fields.name`), 500 `IO_FAILED`.
 * 새 층은 SSE `registry`로 반영되므로(FR-008-AC4) 여기서 스토어를 직접 고치지 않는다.
 */
import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, apiPost } from "../../api/client";
import type { Workflow } from "../../api/types";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { TextInput } from "../../components/ui/TextInput";
import { useSnapshotStore } from "../../state/snapshotStore";
import { normalizeWorkflowName, workflowNameError } from "../../lib/validators";
import {
  CANCEL_BUTTON_LABEL,
  WORKFLOW_ADD_DESCRIPTION,
  WORKFLOW_ADD_LEAD_NOTICE,
  WORKFLOW_ADD_SUBMIT_LABEL,
  WORKFLOW_ADD_SUBMIT_PENDING_LABEL,
  WORKFLOW_ADD_TITLE,
  WORKFLOW_DESCRIPTION_LABEL,
  WORKFLOW_DESCRIPTION_PLACEHOLDER,
  WORKFLOW_NAME_HINT,
  WORKFLOW_NAME_LABEL,
  WORKFLOW_NAME_PLACEHOLDER,
  WRITABLE_FALSE_REASON,
} from "../../lib/text";

export function WorkflowAddDialog({ onClose }: { onClose: () => void }) {
  const nameId = useId();
  const descriptionId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const { registry } = useSnapshotStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  /** 필드 아래 사유: 사전 검증 문구(FR-008-E2) 또는 서버 `fields.name`(FR-008-E1·E2). */
  const [nameError, setNameError] = useState<string | null>(null);
  /** 팝업 하단 사유: `fields`가 없는 오류의 `message`(FR-008-E3, conventions.md §4). */
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
      const fieldReason = apiError?.fields?.name;
      if (fieldReason !== undefined) {
        setNameError(fieldReason);
      } else {
        setFormError(apiError === null ? String(error) : apiError.message);
      }
      setPending(false);
    }
  }

  return (
    <Dialog title={WORKFLOW_ADD_TITLE} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-section font-semibold text-text">{WORKFLOW_ADD_TITLE}</h2>
          <p className="text-aux text-text-secondary">{WORKFLOW_ADD_DESCRIPTION}</p>
        </div>

        <Field
          label={WORKFLOW_NAME_LABEL}
          htmlFor={nameId}
          hint={WORKFLOW_NAME_HINT}
          error={nameError ?? undefined}
        >
          <TextInput
            id={nameId}
            value={name}
            placeholder={WORKFLOW_NAME_PLACEHOLDER}
            disabled={pending}
            onChange={(event) => updateName(event.target.value)}
          />
        </Field>

        <Field label={WORKFLOW_DESCRIPTION_LABEL} htmlFor={descriptionId}>
          <TextInput
            id={descriptionId}
            value={description}
            placeholder={WORKFLOW_DESCRIPTION_PLACEHOLDER}
            disabled={pending}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        {/* FR-008-AC3 안내 박스 */}
        <p className="rounded-control bg-danger-soft px-3 py-2 text-aux text-danger">
          {WORKFLOW_ADD_LEAD_NOTICE}
        </p>

        {formError === null ? null : (
          <p role="alert" className="text-aux text-danger">
            {formError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={onClose}>
            {CANCEL_BUTTON_LABEL}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={nameIsEmpty || pending}
            disabledReason={writable ? undefined : WRITABLE_FALSE_REASON}
            onClick={() => void handleSubmit()}
          >
            {pending ? WORKFLOW_ADD_SUBMIT_PENDING_LABEL : WORKFLOW_ADD_SUBMIT_LABEL}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
