/**
 * `?dialog=workflow-delete&workflow=<이름>` 한 곳으로 열리는 삭제 창 (FR-017-AC1, ADR-88 결정 3).
 * 창을 열 때의 `registry.workflows[이름].rawMemberCount`로 05-3(0명)과 05-4(1명 이상)를 고른다. 고른 뒤에는 바꾸지 않는다
 * (05-3이 열린 사이 인원이 늘면 409 `WORKFLOW_NOT_EMPTY` 안내로 처리한다 — FR-017-E1). 첫 스냅샷 전에는 아무것도 그리지 않는다.
 *
 * ui-spec.md SCR-05-3 워크플로우 삭제 확인 (`05-3-workflow-delete.html`).
 * 계약: api-spec.yaml `DELETE /api/workflows/{workflow}` — 204, 409 `WORKFLOW_NOT_EMPTY`, 500 `IO_FAILED`.
 * 구성은 06-6과 같으므로 공통 `ConfirmByNameDialog`를 쓴다(FR-017-AC2). 이름 변경 입력은 없다(FR-017-AC5).
 * 층이 사라지는 것은 SSE `registry`가 반영한다(FR-017-AC4).
 */
import { useEffect, useRef, useState } from "react";
import type { Registry } from "../../api/types";
import { ApiError, apiDelete } from "../../api/client";
import { ConfirmByNameDialog } from "../../components/ui/ConfirmByNameDialog";
import { MonoText } from "../../components/ui/MonoText";
import { useSnapshotStore } from "../../state/snapshotStore";
import { WorkflowDeleteBlockedDialog, type RemainingAgent } from "./WorkflowDeleteBlockedDialog";
import {
  UNKNOWN_ERROR_MESSAGE,
  WORKFLOW_DELETE_CONFIRM_LABEL,
  WORKFLOW_DELETE_CONFIRM_PENDING_LABEL,
  WORKFLOW_DELETE_FILE_LEAD,
  WORKFLOW_DELETE_FILE_TAIL,
  WORKFLOW_DELETE_INPUT_LABEL,
  WORKFLOW_DELETE_NO_TRASH_NOTE,
  WORKFLOW_NOT_EMPTY_MESSAGE,
  workflowDeleteConfigPath,
  workflowDeleteReason,
  workflowDeleteTitle,
} from "../../lib/text";

/**
 * FR-017-E1: 409 `WORKFLOW_NOT_EMPTY`는 사유를 보여준 뒤 팝업을 닫고 02를 갱신한다.
 * 값은 ui-spec.md SCR-05-3이 명시한 3000ms다(ADR-34, conventions.md §7 MUST).
 * 표시 중에는 `삭제`를 비활성으로 묶어 같은 DELETE를 두 번 보내지 않고,
 * 사용자가 그 전에 `취소`·ESC로 닫으면 즉시 닫힌다.
 */
const NOT_EMPTY_NOTICE_MS = 3000;

interface WorkflowDeleteDialogProps {
  workflowName: string;
  onClose: () => void;
}

/** 열 때 고른 창. `blocked`는 05-4(목록은 열 때 값으로 고정), `confirm`은 05-3. */
type Opened =
  | { kind: "confirm" }
  | { kind: "blocked"; agents: RemainingAgent[]; count: number };

/** 05-4 목록: 구성 파일 원본 기준(`rawLead` 첫 행 + `rawMembers` name 오름차순, 깨진 참조 포함). */
function openedFor(registry: Registry, workflowName: string): Opened {
  const workflow = registry.workflows.find((candidate) => candidate.name === workflowName);
  if (workflow === undefined || workflow.rawMemberCount === 0) return { kind: "confirm" };
  const members = [...workflow.rawMembers].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const agents: RemainingAgent[] = [
    ...(workflow.rawLead === null ? [] : [{ name: workflow.rawLead, role: "lead" as const }]),
    ...members.map((name) => ({ name, role: "member" as const })),
  ];
  return { kind: "blocked", agents, count: workflow.rawMemberCount };
}

export function WorkflowDeleteDialog({ workflowName, onClose }: WorkflowDeleteDialogProps) {
  const { registry } = useSnapshotStore();
  const [opened, setOpened] = useState<Opened | null>(null);
  if (opened === null && registry !== null) {
    setOpened(openedFor(registry, workflowName));
  }

  // 05-4가 열린 사이 워크플로우가 사라지면(registry에 없음) 창을 닫는다. 02는 그대로다.
  const gone =
    opened?.kind === "blocked" &&
    registry !== null &&
    !registry.workflows.some((candidate) => candidate.name === workflowName);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (gone) onCloseRef.current();
  }, [gone]);

  if (opened === null) return null;
  if (opened.kind === "blocked") {
    return (
      <WorkflowDeleteBlockedDialog
        workflowName={workflowName}
        agents={opened.agents}
        count={opened.count}
        onClose={onClose}
      />
    );
  }
  return <WorkflowDeleteConfirmDialog workflowName={workflowName} onClose={onClose} />;
}

/** SCR-05-3: 이름 입력 확인형 삭제. */
function WorkflowDeleteConfirmDialog({ workflowName, onClose }: WorkflowDeleteDialogProps) {
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
      // client.ts가 모든 예외를 `ApiError`로 정규화하므로 내부 표현이 화면에 오르지 않는다.
      const apiError = error instanceof ApiError ? error : null;
      if (apiError?.code === "WORKFLOW_NOT_EMPTY") {
        setErrorMessage(WORKFLOW_NOT_EMPTY_MESSAGE);
        setClosingAfterNotice(true);
      } else {
        setErrorMessage(apiError === null ? UNKNOWN_ERROR_MESSAGE : apiError.message);
      }
      setPending(false);
    }
  }

  return (
    <ConfirmByNameDialog
      title={workflowDeleteTitle(workflowName)}
      notes={[
        <>
          {WORKFLOW_DELETE_FILE_LEAD}
          <MonoText>{workflowDeleteConfigPath(workflowName)}</MonoText>
          {WORKFLOW_DELETE_FILE_TAIL}
        </>,
        WORKFLOW_DELETE_NO_TRASH_NOTE,
      ]}
      inputLabel={WORKFLOW_DELETE_INPUT_LABEL}
      expectedName={workflowName}
      confirmLabel={WORKFLOW_DELETE_CONFIRM_LABEL}
      confirmPendingLabel={WORKFLOW_DELETE_CONFIRM_PENDING_LABEL}
      reason={workflowDeleteReason(workflowName)}
      pending={pending}
      confirmDisabled={closingAfterNotice}
      errorMessage={errorMessage}
      onConfirm={() => void handleDelete()}
      onClose={onClose}
      wf={{ dialog: "05-3-1", input: "05-3-2", footer: "05-3-3" }}
    />
  );
}
