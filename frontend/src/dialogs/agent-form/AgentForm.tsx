/**
 * ui-spec.md SCR-06 에이전트 만들기·수정 폼 (`?dialog=agent-new[&workflow=<이름>]` /
 * `?dialog=agent-edit&agent=<name>`, FR-010·FR-011·FR-012-AC5·FR-002-AC3).
 *
 * 폭은 공통 `Dialog`의 `size="lg"`다(ADR-40 — 팝업에서 `max-w-*`를 직접 지정하지 않는다).
 * 상태·요청은 `useAgentFormState`, 값 변환·비활성 판정은 `lib/derive/agentForm.ts`가 한다.
 * 06-5(저장 충돌)·06-6(제거 확인)은 이 폼 위에 뜨는 작은 창이라 컴포넌트 상태로 연다(ADR-14).
 */
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { MonoText } from "../../components/ui/MonoText";
import { agentFilePathOf, leadTakenBy, requiredFilled } from "../../lib/derive/agentForm";
import {
  AGENT_FORM_CREATE_TITLE,
  AGENT_FORM_EDIT_TITLE,
  CLOSE_BUTTON_LABEL,
  REMOVE_AGENT_BUSY_REASON,
  TOOLS_MODE_REQUIRED_REASON,
  WRITABLE_FALSE_REASON,
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

  function handleDialogClose() {
    // 위에 열린 작은 창(06-5·06-6)이 있으면 그것만 닫는다.
    if (form.conflictModifiedAt !== null) {
      form.closeConflict();
      return;
    }
    if (removeOpen) {
      setRemoveOpen(false);
      return;
    }
    onClose();
  }

  const title = mode === "create" ? AGENT_FORM_CREATE_TITLE : AGENT_FORM_EDIT_TITLE;
  const filePath = detail === null ? agentFilePathOf(form.values.name) : detail.filePath;

  return (
    <Dialog title={title} size="lg" onClose={handleDialogClose}>
      <div className="flex flex-col gap-4" data-testid="agent-form-dialog">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-section font-semibold text-text">{title}</h2>
          <MonoText className="text-aux text-text-faint">{agentFilePathLabel(filePath)}</MonoText>
        </div>

        {form.loadError !== null ? (
          <div className="flex flex-col gap-4">
            <p role="alert" className="text-body text-danger">
              {form.loadError}
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={onClose}>
                {CLOSE_BUTTON_LABEL}
              </Button>
            </div>
          </div>
        ) : (
          // ui-spec.md SCR-06 제목 행 `로딩` 열: 파일을 읽는 동안 필드 자리만 스켈레톤이고
          // 각주·`취소`·`저장`은 사라지지 않은 채 비활성이다(T-019 리뷰 Minor 1, ADR-35 — 이유 줄 없음).
          <>
            {form.loading ? (
              <AgentFormSkeleton />
            ) : (
              <AgentFormBody
                values={form.values}
                workflows={workflows}
                allowNoWorkflow={mode === "edit" && detail?.workflow === null}
                leadTaken={leadTakenBy(selectedWorkflow?.lead ?? null, detail?.name ?? null)}
                fieldErrors={form.fieldErrors}
                submitError={form.submitError}
                pending={form.pending}
                ids={ids}
                onChange={form.patchValues}
              />
            )}
            <AgentFormFooter
              showRemove={mode === "edit"}
              removeDisabledReason={
                form.loading
                  ? undefined
                  : !writable
                    ? WRITABLE_FALSE_REASON
                    : status === "idle"
                      ? undefined
                      : REMOVE_AGENT_BUSY_REASON
              }
              submitDisabledReason={
                form.loading
                  ? undefined
                  : !writable
                    ? WRITABLE_FALSE_REASON
                    : form.values.toolsMode === null
                      ? TOOLS_MODE_REQUIRED_REASON
                      : undefined
              }
              submitDisabled={form.loading || form.pending || !requiredFilled(form.values, mode)}
              pending={form.pending}
              loading={form.loading}
              onRemove={() => setRemoveOpen(true)}
              onCancel={onClose}
              onSubmit={() => void form.submit(false)}
            />
          </>
        )}
      </div>

      {form.conflictModifiedAt === null || detail === null ? null : (
        <SaveConflictDialog
          agentName={detail.name}
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
    otherTools: `${prefix}-other-tools`,
    body: `${prefix}-body`,
  };
}
