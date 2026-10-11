/**
 * ui-spec.md SCR-06-6 워크플로우에서 제거 확인 (`?dialog=agent-remove&agent=<name>` 또는 06 안에서, FR-012, `06-6-agent-remove.html`).
 * 계약: api-spec.yaml `DELETE /api/agents/{name}` — 200 `{trashPath, removedFromWorkflow}`,
 * 404 `AGENT_NOT_FOUND`, 409 `AGENT_BUSY`(FR-012-E2), 500 `IO_FAILED`(FR-012-E1).
 *
 * 구성이 05-3과 같으므로 공통 `ConfirmByNameDialog`를 쓴다. 제목의 조사는 병기 표기이고 받침 판정 코드를 두지 않는다(ADR-39).
 * 02·03 갱신은 SSE `registry`가 한다.
 */
import { useState } from "react";
import { ApiError, apiDelete } from "../../api/client";
import type { AgentDef } from "../../api/types";
import { ConfirmByNameDialog } from "../../components/ui/ConfirmByNameDialog";
import { MonoText } from "../../components/ui/MonoText";
import {
  AGENT_ALREADY_REMOVED_MESSAGE,
  AGENT_REMOVE_CONFIRM_LABEL,
  AGENT_REMOVE_CONFIRM_PENDING_LABEL,
  AGENT_REMOVE_INPUT_LABEL,
  AGENT_REMOVE_TRASH_LEAD,
  AGENT_REMOVE_TRASH_PATH,
  AGENT_REMOVE_TRASH_TAIL,
  REMOVE_AGENT_BUSY_REASON,
  UNKNOWN_ERROR_MESSAGE,
  agentRemoveLeadNote,
  agentRemoveReason,
  agentRemoveTitle,
  agentRemoveWorkflowNote,
} from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";

interface RemoveAgentDialogProps {
  agentName: string;
  onClose: () => void;
  /** 06 폼 안에서 열었을 때 성공 후 이동(ui-spec.md SCR-06-6 `06이었으면 /workflows`). */
  onRemoved?: () => void;
}

export function RemoveAgentDialog({ agentName, onClose, onRemoved }: RemoveAgentDialogProps) {
  const { registry } = useSnapshotStore();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const agent: AgentDef | undefined = registry?.agents.find((each) => each.name === agentName);
  const workflow = agent?.workflow ?? null;

  async function handleRemove() {
    setPending(true);
    setErrorMessage(null);
    try {
      await apiDelete<{ trashPath: string; removedFromWorkflow: string | null }>(
        `/api/agents/${encodeURIComponent(agentName)}`,
      );
      if (onRemoved) onRemoved();
      else onClose();
    } catch (error) {
      // client.ts가 모든 예외를 `ApiError`로 정규화하므로 내부 표현이 화면에 오르지 않는다.
      const apiError = error instanceof ApiError ? error : null;
      if (apiError === null) setErrorMessage(UNKNOWN_ERROR_MESSAGE);
      else if (apiError.code === "AGENT_NOT_FOUND") setErrorMessage(AGENT_ALREADY_REMOVED_MESSAGE);
      else if (apiError.code === "AGENT_BUSY") setErrorMessage(REMOVE_AGENT_BUSY_REASON);
      else setErrorMessage(apiError.message);
      setPending(false);
    }
  }

  // 목록 ① 휴지통 이동은 항상, ② 구성 파일에서 빠짐은 소속이 있을 때, ③ 팀장 안내는 팀장일 때만(FR-012-AC2·AC3).
  const notes = [
    <>
      {AGENT_REMOVE_TRASH_LEAD}
      <MonoText>{AGENT_REMOVE_TRASH_PATH}</MonoText>
      {AGENT_REMOVE_TRASH_TAIL}
    </>,
    ...(workflow === null ? [] : [agentRemoveWorkflowNote(workflow)]),
    ...(workflow !== null && agent?.role === "lead" ? [agentRemoveLeadNote(workflow)] : []),
  ];

  return (
    <ConfirmByNameDialog
      title={agentRemoveTitle(agentName, workflow)}
      notes={notes}
      inputLabel={AGENT_REMOVE_INPUT_LABEL}
      expectedName={agentName}
      confirmLabel={AGENT_REMOVE_CONFIRM_LABEL}
      confirmPendingLabel={AGENT_REMOVE_CONFIRM_PENDING_LABEL}
      reason={agentRemoveReason(agentName)}
      pending={pending}
      errorMessage={errorMessage}
      onConfirm={() => void handleRemove()}
      onClose={onClose}
      wf={{ dialog: "06-6-1", input: "06-6-2", footer: "06-6-3" }}
    />
  );
}
