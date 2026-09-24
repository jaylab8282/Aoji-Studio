/**
 * ui-spec.md SCR-05-R 기존 에이전트 가져오기 (`?dialog=import[&workflow=<이름>]`, FR-009).
 * 계약: api-spec.yaml `POST /api/workflows/{workflow}/members` — 요청 `{ members: [{name, role}] }`,
 * 200 `{ added, rejected, workflow }`(부분 성공), 400 `VALIDATION`(`fields.members`), 409 `LEAD_EXISTS`,
 * 500 `IO_FAILED`. 정의 파일은 바꾸지 않고 소속만 기록한다(FR-009-AC3, 서버 판정).
 * 목록·02 화면 갱신은 SSE `registry`가 하므로 여기서 스토어를 직접 고치지 않는다.
 */
import { useId, useState } from "react";
import { ApiError, apiPost } from "../../api/client";
import type { ImportMembersRequest, ImportMembersResponse, ImportRejected, Role } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import { leadSelectedBy, outsideAgents, toImportMembers } from "../../lib/derive/importCandidates";
import { searchAgents } from "../../lib/derive/search";
import {
  CANCEL_BUTTON_LABEL,
  IMPORT_CREATE_AGENT_BUTTON_LABEL,
  IMPORT_EMPTY_TEXT,
  IMPORT_NOTICE_LEAD,
  IMPORT_NOTICE_TRASH,
  IMPORT_NO_WORKFLOW_NOTICE,
  IMPORT_SEARCH_NO_RESULTS_TEXT,
  IMPORT_SEARCH_PLACEHOLDER,
  IMPORT_SUBMIT_PENDING_LABEL,
  IMPORT_TARGET_WORKFLOW_LABEL,
  IMPORT_TITLE,
  UNKNOWN_ERROR_MESSAGE,
  WRITABLE_FALSE_REASON,
  importRejectedLine,
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
  /** 팝업 하단 사유: `fields.members`(FR-009-E1) 또는 `message`(FR-009-E3, 409 `LEAD_EXISTS`). */
  const [formError, setFormError] = useState<string | null>(null);
  /** 부분 성공 시 거부된 에이전트별 사유(FR-009-E2). */
  const [rejected, setRejected] = useState<ImportRejected[]>([]);

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
  const title = workflowName === null ? IMPORT_TITLE : importTitleFor(workflowName);

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
    setRejected([]);
  }

  function createAgent() {
    openDialog(target === null ? { dialog: "agent-new" } : { dialog: "agent-new", workflow: target });
  }

  async function handleSubmit() {
    if (target === null) return;
    setPending(true);
    setFormError(null);
    setRejected([]);
    try {
      const body: ImportMembersRequest = { members: toImportMembers(selectedNames, roles) };
      const result = await apiPost<ImportMembersResponse>(
        `/api/workflows/${encodeURIComponent(target)}/members`,
        body,
      );
      if (result.rejected.length === 0) {
        onClose();
        return;
      }
      // FR-009-E2: 거부된 에이전트만 사유를 보여주고 팝업은 유지한다. 목록은 SSE `registry`로 갱신된다.
      setRejected(result.rejected);
      setSelectedNames([]);
      setPending(false);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      // 400 `VALIDATION`은 `fields.members`에 사유가 온다(api-spec.yaml, FR-009-E1).
      const fieldReason = apiError?.fields?.members;
      setFormError(fieldReason ?? (apiError === null ? UNKNOWN_ERROR_MESSAGE : apiError.message));
      setPending(false);
    }
  }

  return (
    <Dialog title={title} size="lg" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-section font-semibold text-text">{title}</h2>
          {registry === null ? (
            <Skeleton className="h-4 w-2/3" />
          ) : (
            <p className="text-aux text-text-secondary">{importSubtitle(candidates.length)}</p>
          )}
        </div>

        <Field label={IMPORT_TARGET_WORKFLOW_LABEL} htmlFor={targetId}>
          {workflowName !== null ? (
            <span id={targetId} className="text-body text-text">
              {workflowName}
            </span>
          ) : registry === null ? (
            <Skeleton className="h-btn-sm w-40" />
          ) : workflows.length === 0 ? (
            <span id={targetId} className="text-body text-text-secondary">
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

        <div className="flex items-center gap-2">
          {registry !== null && candidates.length === 0 ? null : (
            <div className="flex-1">
              <SearchInput
                id={searchId}
                aria-label={IMPORT_SEARCH_PLACEHOLDER}
                value={query}
                placeholder={IMPORT_SEARCH_PLACEHOLDER}
                disabled={pending}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          )}
          <Button
            variant="add"
            size="sm"
            disabledReason={writable ? undefined : WRITABLE_FALSE_REASON}
            onClick={createAgent}
          >
            {IMPORT_CREATE_AGENT_BUTTON_LABEL}
          </Button>
        </div>

        {registry === null ? (
          <ImportAgentTableSkeleton />
        ) : candidates.length === 0 ? (
          // FR-009-AC6: 워크플로우 밖 에이전트가 0명이면 표 대신 안내와 `+ 새로 만들기`만 보인다.
          <p className="text-body text-text-secondary">{IMPORT_EMPTY_TEXT}</p>
        ) : visibleAgents.length === 0 ? (
          <p className="text-body text-text-secondary">{IMPORT_SEARCH_NO_RESULTS_TEXT}</p>
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

        <div className="flex flex-col gap-1.5 rounded-control bg-soft px-3 py-2 text-aux text-text-secondary">
          <p>{IMPORT_NOTICE_LEAD}</p>
          <p>{IMPORT_NOTICE_TRASH}</p>
        </div>

        {rejected.length === 0 && formError === null ? null : (
          <div role="alert" className="flex flex-col gap-1 text-aux text-danger">
            {rejected.map((item) => (
              <p key={item.name}>{importRejectedLine(item.name, item.reason)}</p>
            ))}
            {formError === null ? null : <p>{formError}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={onClose}>
            {CANCEL_BUTTON_LABEL}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={selectedNames.length === 0 || target === null || pending}
            disabledReason={writable ? undefined : WRITABLE_FALSE_REASON}
            onClick={() => void handleSubmit()}
          >
            {pending ? IMPORT_SUBMIT_PENDING_LABEL : importSubmitLabel(selectedNames.length)}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
