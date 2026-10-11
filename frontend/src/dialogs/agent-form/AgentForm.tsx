/**
 * ui-spec.md SCR-06 에이전트 만들기·수정 폼 (`?dialog=agent-new[&workflow=<이름>]` /
 * `?dialog=agent-edit&agent=<name>`, FR-010·FR-011·FR-012-AC5·FR-002-AC3, `06-agent-form.html`).
 *
 * 폭은 공통 `Dialog`의 `size="lg"` + `tall`(높이 `min(1180, 100vh − 48)`)이다(ADR-40 — 팝업에서 `max-w-*`를 직접 지정하지 않는다).
 * 상태·요청은 `useAgentFormState`, 값 변환·비활성 판정은 `lib/derive/agentForm.ts`가 한다.
 * 06-5(저장 충돌)·06-6(제거 확인)은 이 폼 위에 뜨는 작은 창이라 컴포넌트 상태로 연다(ADR-14).
 * ESC·막 클릭은 맨 위 창만 닫는다(Dialog가 처리, D-126).
 */
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog, DialogFooter } from "../../components/ui/Dialog";
import { MonoText } from "../../components/ui/MonoText";
import { agentFilePathOf, leadTakenBy, requiredFilled } from "../../lib/derive/agentForm";
import {
  AGENT_FORM_CREATE_TITLE,
  AGENT_FORM_EDIT_TITLE,
  CLOSE_BUTTON_LABEL,
  REMOVE_AGENT_BUSY_REASON,
  TOOLS_MODE_REQUIRED_REASON,
  agentFilePathLabel,
} from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { RemoveAgentDialog } from "../remove-agent/RemoveAgentDialog";
import { SaveConflictDialog } from "../save-conflict/SaveConflictDialog";
import { AgentFormBody } from "./AgentFormBody";
import { AgentFormFooter } from "./AgentFormFooter";
import { AgentFormSkeleton } from "./AgentFormSkeleton";
import { useAgentFormState } from "./useAgentFormState";

interface AgentFormProps {
  mode: "create" | "edit";
  /** 수정 대상 name(`?agent=`). 만들기면 null. */
  agentName: string | null;
  /** 만들기에서 미리 고를 워크플로우(`?workflow=`). */
  workflowParam: string | null;
  onClose: () => void;
}

export function AgentForm({ mode, agentName, workflowParam, onClose }: AgentFormProps) {
  const navigate = useNavigate();
  const { registry, live } = useSnapshotStore();
  const ids = useFieldIds();
  const [removeOpen, setRemoveOpen] = useState(false);
  const form = useAgentFormState({ mode, agentName, workflowParam });

  const workflows = registry?.workflows ?? [];
  const writable = registry?.writable !== false;
  const selectedWorkflow = workflows.find((workflow) => workflow.name === form.values.workflow) ?? null;
  // ADR-27: 버튼 비활성 판정은 04-4 표시 고정(displayStatus)이 아니라 실제 상태를 쓴다.
  // 스냅샷 `live`가 더 최근 값이므로 먼저 보고, 없으면 `GET`이 준 `AgentDetail.status`를 쓴다.
  const detail = form.detail;
  const status = (detail === null ? undefined : live?.agents[detail.name]?.status) ?? detail?.status ?? "idle";

  const title = mode === "create" ? AGENT_FORM_CREATE_TITLE : AGENT_FORM_EDIT_TITLE;
  const filePath = detail === null ? agentFilePathOf(form.values.name) : detail.filePath;
  const fileName = filePath.slice(filePath.lastIndexOf("/") + 1);
  const roleError = form.submitError?.slot === "role" ? form.submitError.message : null;
  const alertMessage = form.submitError !== null && form.submitError.slot !== "role" ? form.submitError.message : null;
  const busy = status !== "idle";

  return (
    <Dialog title={title} size="lg" tall wf="06-1" onClose={onClose}>
      <div className="flex flex-none items-baseline gap-3" data-testid="agent-form-dialog">
        <h2 className="flex-none text-section font-bold text-text">{title}</h2>
        {/* 만들기·이름 빈 값이면 경로를 숨긴다(ui-spec.md SCR-06 제목 행 `빈` 열). */}
        {mode === "create" && form.values.name.trim() === "" ? null : (
          <MonoText className="min-w-0 truncate text-aux text-text-muted">{agentFilePathLabel(filePath)}</MonoText>
        )}
      </div>

      {form.loadError !== null ? (
        <>
          <Alert message={form.loadError} />
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {CLOSE_BUTTON_LABEL}
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          {alertMessage === null ? null : <Alert message={alertMessage} />}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
            {form.loading ? (
              <AgentFormSkeleton />
            ) : (
              <AgentFormBody
                values={form.values}
                workflows={workflows}
                allowNoWorkflow={mode === "edit" && detail?.workflow === null}
                leadTaken={leadTakenBy(selectedWorkflow?.lead ?? null, detail?.name ?? null)}
                fieldErrors={form.fieldErrors}
                roleError={roleError}
                pending={form.pending}
                ids={ids}
                onChange={form.patchValues}
              />
            )}
          </div>
          <AgentFormFooter
            showRemove={mode === "edit"}
            removeDisabled={form.loading || !writable || busy}
            removeDisabledReason={form.loading || !writable || !busy ? undefined : REMOVE_AGENT_BUSY_REASON}
            submitDisabledReason={
              form.loading || !writable || form.values.toolsMode !== null ? undefined : TOOLS_MODE_REQUIRED_REASON
            }
            submitDisabled={form.loading || form.pending || !writable || !requiredFilled(form.values, mode)}
            pending={form.pending}
            loading={form.loading}
            writable={writable}
            onRemove={() => setRemoveOpen(true)}
            onCancel={onClose}
            onSubmit={() => void form.submit(false)}
          />
        </>
      )}

      {form.conflictModifiedAt === null || detail === null ? null : (
        <SaveConflictDialog
          fileName={fileName}
          modifiedAt={form.conflictModifiedAt}
          reloading={form.reloading}
          overwriting={form.pending}
          onReload={() => void form.reload()}
          onOverwrite={() => void form.submit(true)}
          onClose={form.closeConflict}
        />
      )}

      {removeOpen && detail !== null ? (
        <RemoveAgentDialog
          agentName={detail.name}
          onClose={() => setRemoveOpen(false)}
          onRemoved={() => navigate("/workflows")}
        />
      ) : null}
    </Dialog>
  );
}

/** 라벨·입력 연결용 id 묶음(한 팝업 안에서만 쓰는 값). */
function useFieldIds() {
  const prefix = useId();
  return {
    name: `${prefix}-name`,
    model: `${prefix}-model`,
    customModel: `${prefix}-custom-model`,
    workflow: `${prefix}-workflow`,
    description: `${prefix}-description`,
    body: `${prefix}-body`,
  };
}
