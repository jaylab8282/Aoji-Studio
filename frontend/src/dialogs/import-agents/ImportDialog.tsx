/**
 * ui-spec.md SCR-05-R 기존 에이전트 가져오기 (`?dialog=import[&workflow=<이름>]`, FR-009, `05R-agent-import*.html`).
 * 계약: api-spec.yaml `POST /api/workflows/{workflow}/members` — 요청 `{ members: [{name, role}] }`,
 * 200 `{ added, rejected, workflow }`(부분 성공·전부 거부 포함), 400 `VALIDATION`(`fields.members`), 409 `LEAD_EXISTS`, 500 `IO_FAILED`.
 * 정의 파일은 바꾸지 않고 소속만 기록한다(FR-009-AC3, 서버 판정). 목록·02 화면 갱신은 SSE `registry`가 하므로 스토어를 직접 고치지 않는다.
 * 에러 문구는 서버 `message`가 아니라 `lib/errorMapping.ts`가 ui-rules 표 글자로 만든다(D-142).
 */
import { useId, useState } from "react";
import { ApiError, apiPost } from "../../api/client";
import type { ImportMembersRequest, ImportMembersResponse, ImportRejected, Role } from "../../api/types";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog, DialogFooter, DialogHeader } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { NoticeCard } from "../../components/ui/NoticeCard";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import {
  hiddenSelectedCount,
  leadSelectedBy,
  outsideAgents,
  toImportMembers,
} from "../../lib/derive/importCandidates";
import { searchAgents } from "../../lib/derive/search";
import { importErrorMessage, importRejectionLines } from "../../lib/errorMapping";
import {
  CANCEL_BUTTON_LABEL,
  IMPORT_CREATE_AGENT_BUTTON_LABEL,
  IMPORT_EMPTY_BODY,
  IMPORT_EMPTY_TITLE,
  IMPORT_NOTICE,
  IMPORT_NO_WORKFLOW_NOTICE,
  IMPORT_SEARCH_LABEL,
  IMPORT_SEARCH_NO_RESULTS_TEXT,
  IMPORT_SEARCH_PLACEHOLDER,
  IMPORT_SUBMIT_PENDING_LABEL,
  IMPORT_TARGET_WORKFLOW_LABEL,
  IMPORT_TITLE,
  UNKNOWN_ERROR_MESSAGE,
  WRITABLE_FALSE_POPUP_NOTICE,
  importHiddenSelectionNotice,
  importSubmitLabel,
  importSubtitle,
  importTitleFor,
} from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { ImportAgentTable, ImportAgentTableSkeleton } from "./ImportAgentTable";

interface ImportDialogProps {
  /** `?workflow` 값. 층의 `가져오기`로 열면 대상이 고정되고, 헤더 링크로 열면 null이다(FR-009-AC7). */
  workflowName: string | null;
  onClose: () => void;
}

/** 부분 성공 응답에서 거부 줄을 다시 계산하는 데 필요한 값(소속 워크플로우는 갱신된 스냅샷에서 찾는다, D-142). */
interface RejectionState {
  rejected: ImportRejected[];
  addedCount: number;
}

export function ImportDialog({ workflowName, onClose }: ImportDialogProps) {
  const targetId = useId();
  const searchId = useId();
  const { registry } = useSnapshotStore();
  const openDialog = useDialogNavigate();

  const [query, setQuery] = useState("");
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [roles, setRoles] = useState<Record<string, Role | undefined>>({});
  /** 헤더 링크로 열었을 때 드롭다운으로 고른 대상(FR-009-AC7). `?workflow`가 있으면 쓰지 않는다. */
  const [pickedTarget, setPickedTarget] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** 아래 줄 위 `Alert`: 요청 전체가 거부된 사유(FR-009-E1·E3, 409 `LEAD_EXISTS`). */
  const [formError, setFormError] = useState<string | null>(null);
  /** 부분 성공·전부 거부의 거부 줄(FR-009-E2). */
  const [rejection, setRejection] = useState<RejectionState | null>(null);

  const workflows = registry?.workflows ?? [];
  const writable = registry?.writable !== false;
  const candidates = registry === null ? [] : outsideAgents(registry.agents);
  const visibleAgents = searchAgents(candidates, query);
  const target = workflowName ?? pickedTarget ?? workflows[0]?.name ?? null;
  const targetLead = workflows.find((workflow) => workflow.name === target)?.lead ?? null;
  const leadRowName = leadSelectedBy(
    candidates.map((agent) => agent.name),
    roles,
  );
  // ADR-71(ui-spec SCR-05-R, 시안 05R-agent-import): 헤더 링크로 열면(`?workflow` 없음) 드롭다운과 상관없이 고정 제목,
  // 층에서 열면 `<워크플로우>(으)로 …`.
  const title = workflowName === null ? IMPORT_TITLE : importTitleFor(workflowName);
  // ADR-37: 검색에 가려진 선택이 1명 이상일 때만 안내 줄을 그린다.
  const hiddenSelected = hiddenSelectedCount(selectedNames, visibleAgents);
  // 헤더 링크로 열었을 때만 대상 드롭다운이 있다(FR-009-AC7).
  const showTarget = workflowName === null;
  const targetIsSelect = showTarget && registry !== null && workflows.length > 0;
  const isEmpty = registry !== null && candidates.length === 0;
  const rejectionLines =
    rejection === null ? [] : importRejectionLines(rejection.rejected, rejection.addedCount, registry?.agents ?? null);

  function toggle(name: string) {
    setSelectedNames((previous) =>
      previous.includes(name) ? previous.filter((each) => each !== name) : [...previous, name],
    );
  }

  function changeRole(name: string, role: Role) {
    setRoles((previous) => ({ ...previous, [name]: role }));
  }

  function changeTarget(name: string) {
    // 대상이 바뀌면 `팀장` 가능 여부가 달라지므로(FR-009-AC4) 고른 역할을 기본값으로 되돌린다.
    setPickedTarget(name);
    setRoles({});
    setFormError(null);
    setRejection(null);
  }

  function createAgent() {
    openDialog(target === null ? { dialog: "agent-new" } : { dialog: "agent-new", workflow: target });
  }

  async function handleSubmit() {
    if (target === null) return;
    setPending(true);
    setFormError(null);
    setRejection(null);
    const body: ImportMembersRequest = { members: toImportMembers(selectedNames, roles) };
    try {
      const result = await apiPost<ImportMembersResponse>(
        `/api/workflows/${encodeURIComponent(target)}/members`,
        body,
      );
      if (result.rejected.length === 0) {
        onClose();
        return;
      }
      // FR-009-E2: 거부된 에이전트만 사유를 보여주고 팝업은 유지한다. 전부 거부(`added: []`)여도 같다(N = 0).
      setRejection({ rejected: result.rejected, addedCount: result.added.length });
      setSelectedNames([]);
      setPending(false);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setFormError(
        apiError === null
          ? UNKNOWN_ERROR_MESSAGE
          : importErrorMessage({ code: apiError.code, serverMessage: apiError.message, requested: body.members }),
      );
      setPending(false);
    }
  }

  const targetField = !showTarget ? null : (
    <Field label={IMPORT_TARGET_WORKFLOW_LABEL} htmlFor={targetIsSelect ? targetId : undefined}>
      {registry === null ? (
        <Skeleton className="h-control w-full" />
      ) : workflows.length === 0 ? (
        <span className="inline-flex min-h-control items-center text-body text-text-secondary">
          {IMPORT_NO_WORKFLOW_NOTICE}
        </span>
      ) : (
        <Select
          id={targetId}
          value={target ?? ""}
          disabled={pending}
          onChange={(event) => changeTarget(event.target.value)}
        >
          {workflows.map((workflow) => (
            <option key={workflow.name} value={workflow.name}>
              {workflow.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );

  return (
    <Dialog title={title} size="lg" wf="05R-1" onClose={onClose}>
      <DialogHeader
        title={title}
        subtitle={registry === null ? <Skeleton className="h-4 w-2/3" /> : importSubtitle(candidates.length)}
      />

      {isEmpty ? (
        // FR-009-AC6: 워크플로우 밖 에이전트가 0명이면 검색·표·안내 박스·가져오기 대신 점선 안내 카드 하나와 `새로 만들기`만 보인다.
        <>
          {targetField === null ? null : <div className="w-import-target">{targetField}</div>}
          <NoticeCard kind="empty" title={IMPORT_EMPTY_TITLE} wf="05R-3" actions={
            <div data-wf="05R-2">
              <Button
                variant="primary"
                disabled={!writable}
                onClick={createAgent}
              >
                <Icon name="plus" />
                {IMPORT_CREATE_AGENT_BUTTON_LABEL}
              </Button>
            </div>
          }>
            <p>{IMPORT_EMPTY_BODY}</p>
          </NoticeCard>
        </>
      ) : (
        <>
          <div data-wf="05R-2" className="flex items-end gap-3">
            {targetField === null ? null : <div className="w-import-target flex-none">{targetField}</div>}
            <div className="min-w-0 flex-1">
              <Field label={IMPORT_SEARCH_LABEL} htmlFor={searchId}>
                <SearchInput
                  id={searchId}
                  value={query}
                  placeholder={IMPORT_SEARCH_PLACEHOLDER}
                  disabled={pending || registry === null}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </Field>
            </div>
            <Button variant="add" disabled={!writable} onClick={createAgent}>
              <Icon name="plus" />
              {IMPORT_CREATE_AGENT_BUTTON_LABEL}
            </Button>
          </div>

          {hiddenSelected === 0 ? null : (
            <p className="text-aux text-text-secondary">{importHiddenSelectionNotice(hiddenSelected)}</p>
          )}

          <div data-wf="05R-3" className="flex min-h-0 flex-1 flex-col">
            {registry === null ? (
              <ImportAgentTableSkeleton />
            ) : visibleAgents.length === 0 ? (
              <p className="rounded-card border border-border px-3 py-6 text-center text-body text-text-secondary">
                {IMPORT_SEARCH_NO_RESULTS_TEXT}
              </p>
            ) : (
              <ImportAgentTable
                agents={visibleAgents}
                selectedNames={selectedNames}
                roles={roles}
                targetLead={targetLead}
                leadRowName={leadRowName}
                disabled={pending}
                onToggle={toggle}
                onRoleChange={changeRole}
              />
            )}
          </div>

          <p data-wf="05R-4" className="rounded-chip bg-inset px-3 py-2 text-aux text-text-secondary">
            {IMPORT_NOTICE}
          </p>
        </>
      )}

      {rejectionLines.length === 0 && formError === null ? null : (
        <div className="grid gap-2">
          {rejectionLines.map((line) => (
            <Alert key={line} message={line} />
          ))}
          {formError === null ? null : <Alert block message={formError} />}
        </div>
      )}

      <DialogFooter wf="05R-5">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          {CANCEL_BUTTON_LABEL}
        </Button>
        {isEmpty ? null : (
          <Button
            variant="primary"
            disabled={selectedNames.length === 0 || target === null || pending || !writable}
            onClick={() => void handleSubmit()}
          >
            <Icon name="import" />
            {pending ? IMPORT_SUBMIT_PENDING_LABEL : importSubmitLabel(selectedNames.length)}
          </Button>
        )}
      </DialogFooter>
      {writable ? null : <p className="text-right text-aux text-text-muted">{WRITABLE_FALSE_POPUP_NOTICE}</p>}
    </Dialog>
  );
}
