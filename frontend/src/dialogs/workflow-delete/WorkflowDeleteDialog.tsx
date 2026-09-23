/**
 * ui-spec.md SCR-05-3 워크플로우 삭제 확인 (`?dialog=workflow-delete&workflow=<이름>`, FR-017).
 * 계약: api-spec.yaml `DELETE /api/workflows/{workflow}` — 204, 409 `WORKFLOW_NOT_EMPTY`, 500 `IO_FAILED`.
 * 구성은 06-6과 같으므로 공통 `ConfirmByNameDialog`를 쓴다(FR-017-AC2).
 * 층이 사라지는 것은 SSE `registry`가 반영한다(FR-017-AC4).
 */
import { useEffect, useRef, useState } from "react";
import { ApiError, apiDelete } from "../../api/client";
import { ConfirmByNameDialog } from "../../components/ui/ConfirmByNameDialog";
import {
  WORKFLOW_DELETE_CONFIRM_LABEL,
  WORKFLOW_DELETE_CONFIRM_PENDING_LABEL,
  workflowDeleteConfigNote,
  workflowDeleteTitle,
} from "../../lib/text";

/**
 * FR-017-E1: 409 `WORKFLOW_NOT_EMPTY`는 사유를 보여준 뒤 팝업을 닫고 02를 갱신한다.
 * 사유를 읽을 시간만큼만 열어 두며, 길이는 공통 CopyButton의 일시 표시(1.5초)와 맞춘다.
 */
const NOT_EMPTY_NOTICE_MS = 1500;

interface WorkflowDeleteDialogProps {
  workflowName: string;
  onClose: () => void;
}

export function WorkflowDeleteDialog({ workflowName, onClose }: WorkflowDeleteDialogProps) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [closingAfterNotice, setClosingAfterNotice] = useState(false);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!closingAfterNotice) return;
    const timer = setTimeout(() => onCloseRef.current(), NOT_EMPTY_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [closingAfterNotice]);

  async function handleDelete() {
    setPending(true);
    setErrorMessage(null);
    try {
      await apiDelete<void>(`/api/workflows/${encodeURIComponent(workflowName)}`);
      onClose();
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setErrorMessage(apiError === null ? String(error) : apiError.message);
      setPending(false);
      if (apiError?.code === "WORKFLOW_NOT_EMPTY") {
        setClosingAfterNotice(true);
      }
    }
  }

  return (
    <ConfirmByNameDialog
      title={workflowDeleteTitle(workflowName)}
      notes={[workflowDeleteConfigNote(workflowName)]}
      expectedName={workflowName}
      confirmLabel={WORKFLOW_DELETE_CONFIRM_LABEL}
      confirmPendingLabel={WORKFLOW_DELETE_CONFIRM_PENDING_LABEL}
      pending={pending}
      errorMessage={errorMessage}
      onConfirm={() => void handleDelete()}
      onClose={onClose}
    />
  );
}
