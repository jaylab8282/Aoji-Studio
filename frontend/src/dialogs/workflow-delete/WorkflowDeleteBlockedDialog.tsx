/**
 * ui-spec.md SCR-05-4 워크플로우 삭제 불가 안내 (v1.2.0, FR-017-AC1, `05-4-workflow-delete-blocked.html`).
 * `?dialog=workflow-delete&workflow=<이름>`에서 `rawMemberCount > 0`일 때 `WorkflowDeleteDialog`가 고른다.
 * `Dialog sm` + `role="alertdialog"`: 제목 → 조건 안내 한 줄(`aria-describedby`) → `bg-inset` 상자(`남은 에이전트 N명` + 팀장 먼저, 팀원 name 오름차순)
 * → 주 동작 `확인`(처음 초점). 이름 입력·삭제 버튼은 없고, `확인`·ESC는 창만 닫는다(요청 0회, 파일 변경 없음).
 * 목록은 구성 파일 원본(`rawLead`·`rawMembers`, 깨진 참조 포함) 기준으로 호출부가 열 때 값으로 고정해 넘긴다.
 */
import { useId } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog, DialogFooter, DialogHeader } from "../../components/ui/Dialog";
import { ROLE_OPTION_TEXT, WORKFLOW_DELETE_BLOCKED_CONDITION, WORKFLOW_DELETE_BLOCKED_CONFIRM_LABEL, workflowDeleteBlockedListTitle, workflowDeleteBlockedTitle } from "../../lib/text";

export interface RemainingAgent {
  name: string;
  role: "lead" | "member";
}

interface WorkflowDeleteBlockedDialogProps {
  workflowName: string;
  /** 열 때의 `rawLead`(있으면 첫 행) + `rawMembers`(name 오름차순). */
  agents: RemainingAgent[];
  /** 머리 `남은 에이전트 N명`의 N (`rawMemberCount`). */
  count: number;
  onClose: () => void;
}

export function WorkflowDeleteBlockedDialog({ workflowName, agents, count, onClose }: WorkflowDeleteBlockedDialogProps) {
  const title = workflowDeleteBlockedTitle(workflowName);
  const conditionId = useId();

  return (
    <Dialog title={title} size="sm" role="alertdialog" describedBy={conditionId} onClose={onClose} wf="05-4-1">
      <DialogHeader title={title} />
      <p id={conditionId} className="text-body text-text-secondary">
        {WORKFLOW_DELETE_BLOCKED_CONDITION}
      </p>
      <section data-wf="05-4-2" className="grid gap-2 rounded-card border border-border bg-inset p-3">
        <h3 className="text-aux font-semibold text-text">{workflowDeleteBlockedListTitle(count)}</h3>
        <ul className="alist-scroll grid font-mono text-aux text-text-mono">
          {agents.map((agent) => (
            <li key={`${agent.role}:${agent.name}`} className="flex items-center gap-2 border-b border-border py-1.5 last:border-b-0">
              <span data-clamp className="min-w-0 truncate" title={agent.name}>
                {agent.name}
              </span>
              <span className="ml-auto shrink-0">
                {agent.role === "lead" ? (
                  <Badge>{ROLE_OPTION_TEXT.lead}</Badge>
                ) : (
                  <span className="font-sans text-text-muted">{ROLE_OPTION_TEXT.member}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <DialogFooter wf="05-4-3">
        <Button variant="primary" autoFocus onClick={onClose}>
          {WORKFLOW_DELETE_BLOCKED_CONFIRM_LABEL}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
