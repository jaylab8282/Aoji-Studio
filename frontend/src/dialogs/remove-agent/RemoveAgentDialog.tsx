/**
 * ui-spec.md SCR-06-6 워크플로우에서 제거 확인 (`?dialog=agent-remove&agent=<name>` 또는 06 안에서, FR-012).
 * 계약: api-spec.yaml `DELETE /api/agents/{name}` — 200 `{trashPath, removedFromWorkflow}`,
 * 404 `AGENT_NOT_FOUND`, 409 `AGENT_BUSY`(FR-012-E2), 500 `IO_FAILED`(FR-012-E1).
 *
 * 구성이 05-3과 같으므로 공통 `ConfirmByNameDialog`를 쓰고 전용 확인 팝업을 새로 만들지 않는다(폭은 `md`, ADR-40).
 * 제목의 조사는 병기 표기이고 받침 판정 코드를 두지 않는다(ADR-39).
 * 02·03 갱신은 SSE `registry`가 한다.
 */
import { useState } from "react";
import { ApiError, apiDelete } from "../../api/client";
import type { AgentDef } from "../../api/types";
import { ConfirmByNameDialog } from "../../components/ui/ConfirmByNameDialog";
import {
  AGENT_ALREADY_REMOVED_MESSAGE,
  AGENT_REMOVE_CONFIRM_LABEL,
  AGENT_REMOVE_CONFIRM_PENDING_LABEL,
  AGENT_REMOVE_TRASH_NOTE,
  UNKNOWN_ERROR_MESSAGE,
  agentRemoveLeadNote,
  agentRemoveTitle,
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
      else setErrorMessage(apiError.code === "AGENT_NOT_FOUND" ? AGENT_ALREADY_REMOVED_MESSAGE : apiError.message);
      setPending(false);
    }
  }

  return (
    <ConfirmByNameDialog
      title={agentRemoveTitle(agentName, workflow)}
      notes={buildNotes(agent?.role ?? null, workflow)}
      expectedName={agentName}
      confirmLabel={AGENT_REMOVE_CONFIRM_LABEL}
      confirmPendingLabel={AGENT_REMOVE_CONFIRM_PENDING_LABEL}
      pending={pending}
      errorMessage={errorMessage}
      onConfirm={() => void handleRemove()}
      onClose={onClose}
    />
  );
}

/** 안내 줄: 휴지통 이동은 항상, 팀장 안내는 팀장일 때만(FR-012-AC3). */
function buildNotes(role: string | null, workflow: string | null): string[] {
  if (role !== "lead" || workflow === null) return [AGENT_REMOVE_TRASH_NOTE];
  return [AGENT_REMOVE_TRASH_NOTE, agentRemoveLeadNote(workflow)];
}
