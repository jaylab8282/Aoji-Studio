/**
 * ui-spec.md SCR-02 층 카드(워크플로우마다, `02-6`·`02-7`·`02-8`). FR-006-AC1·AC3·AC5·AC11·AC12, FR-017-AC1, FR-001-E2.
 * 그리드 배치(열 수·넓은 층 span, FR-006-AC2)는 상위 `FloorGrid`가 맡는다.
 *
 * 카드 테두리는 상태와 무관하다(워크플로우 단위의 상태색은 없다, FR-006-AC5, `ui-rules.md` 색의 역할):
 * 기본 `border-border`, 팀장 없는 층만 점선 `border-border-dashed`. 요약 줄만 상태 사각형 + 상태 글자를 쓴다.
 * 헤더는 2줄 — ① 이름·`N명` 칩·요약·`상세`(arrow-right 아이콘) ② `가져오기`·`만들기`·(이유)`삭제`. 카드 폭 440px 이하면 둘째 줄이 줄바꿈하고
 * 이유 글자가 다음 줄 오른쪽으로 간다(`floor-header`·`floor-reason`, `layout.css`).
 * 경고 줄(`팀장이 없습니다`·`여러 워크플로우에 있습니다`)은 `bg-inset` 중립 줄 + `triangle-alert`이고 주황·빨강을 쓰지 않는다.
 * 책상 영역은 칸 100px 고정 `repeat(auto-fill, 100px)`, 인원 0이면 책상 영역을 그리지 않는다.
 */
import { useId } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentDef, Live, Workflow } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { Icon } from "../../components/ui/Icon";
import { StatusDot } from "../../components/ui/StatusDot";
import { agentOrder } from "../../lib/derive/agentOrder";
import { floorSummary, type FloorSummary } from "../../lib/derive/floorSummary";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import {
  FLOOR_CREATE_BUTTON_LABEL,
  FLOOR_DELETE_BUTTON_LABEL,
  FLOOR_DELETE_DISABLED_REASON,
  FLOOR_DETAIL_BUTTON_LABEL,
  FLOOR_IMPORT_BUTTON_LABEL,
  FLOOR_NO_LEAD_TEXT,
  FLOOR_NO_LEAD_WARNING,
  SUMMARY_SEPARATOR,
  WORKFLOW_CHIP_ALL_IDLE_TEXT,
  WRITABLE_FALSE_REASON,
  floorDuplicateWarning,
  floorMemberCountLabel,
  floorRunningLabel,
  floorWaitingLabel,
} from "../../lib/text";
import { Desk } from "./Desk";

interface FloorProps {
  workflow: Workflow;
  registryAgents: AgentDef[];
  live: Live;
  writable: boolean;
  /** null이면 검색으로 걸러지지 않은 상태(전체 표시). 배열이면 그 이름들만 책상을 보여준다. */
  matchedAgentNames: string[] | null;
}

/** 요약 줄: `실행 중 N명 · 권한 대기 N명` / `모두 대기` / 팀장 없음이면 `팀장 없음`(`text-secondary`). */
function SummaryText({ hasLead, summary }: { hasLead: boolean; summary: FloorSummary }) {
  const base = "ml-1 inline-flex min-w-0 items-center gap-2 text-aux font-semibold whitespace-nowrap";
  if (!hasLead) {
    return (
      <span data-testid="floor-summary" className={`${base} text-text-secondary`}>
        {FLOOR_NO_LEAD_TEXT}
      </span>
    );
  }
  if (summary.allIdle) {
    return (
      <span data-testid="floor-summary" className={`${base} text-text-muted`}>
        {WORKFLOW_CHIP_ALL_IDLE_TEXT}
      </span>
    );
  }
  return (
    <span data-testid="floor-summary" className={base}>
      {summary.running > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-live">
          <StatusDot status="running" />
          {floorRunningLabel(summary.running)}
        </span>
      ) : null}
      {summary.running > 0 && summary.waiting > 0 ? (
        <>
          {" "}
          <span aria-hidden="true" className="font-normal text-text-muted">
            {SUMMARY_SEPARATOR}
          </span>{" "}
        </>
      ) : null}
      {summary.waiting > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-waiting">
          <StatusDot status="waiting" />
          {floorWaitingLabel(summary.waiting)}
        </span>
      ) : null}
    </span>
  );
}

function WarningLine({ children }: { children: string }) {
  return (
    <div
      role="note"
      data-wf="02-8"
      className="flex items-center gap-2 border-t border-border bg-inset px-4 py-2 text-aux font-semibold text-text"
    >
      <Icon name="triangle-alert" className="text-text-secondary" />
      <span>{children}</span>
    </div>
  );
}

export function Floor({ workflow, registryAgents, live, writable, matchedAgentNames }: FloorProps) {
  const navigate = useNavigate();
  const openDialog = useDialogNavigate();
  const reasonId = useId();

  const allNames = workflow.lead ? [workflow.lead, ...workflow.members] : [...workflow.members];
  const nameToAgent = new Map(registryAgents.map((agent) => [agent.name, agent] as const));
  const duplicateNames = allNames.filter((name) => (nameToAgent.get(name)?.duplicateWorkflows.length ?? 0) > 0);

  // 중복 소속 에이전트는 `agent.workflow`(첫 층)에만 책상을 둔다(FR-006-AC11).
  const canonicalLead =
    workflow.lead !== null && nameToAgent.get(workflow.lead)?.workflow === workflow.name ? workflow.lead : null;
  const canonicalMembers = workflow.members.filter((name) => nameToAgent.get(name)?.workflow === workflow.name);
  const canonicalOrder = agentOrder({ lead: canonicalLead, members: canonicalMembers });
  const deskNames =
    matchedAgentNames === null ? canonicalOrder : canonicalOrder.filter((name) => matchedAgentNames.includes(name));

  const summary = floorSummary(workflow, live.agents);
  const hasLead = workflow.lead !== null;
  const writeReason = writable ? undefined : WRITABLE_FALSE_REASON;
  const deleteReason = writeReason ?? (workflow.rawMemberCount > 0 ? FLOOR_DELETE_DISABLED_REASON : undefined);

  return (
    <section
      aria-label={`${workflow.name} 층`}
      data-floor={workflow.name}
      className={`floor-container overflow-hidden rounded-card border bg-card ${
        hasLead ? "border-border" : "border-dashed border-border-dashed"
      }`}
    >
      <div data-wf="02-6" className="grid gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <h3 className="min-w-0 truncate text-section font-semibold text-text" title={workflow.name}>
            {workflow.name}
          </h3>
          <Chip>
            <span className="font-mono font-medium text-text-secondary">{floorMemberCountLabel(allNames.length)}</span>
          </Chip>
          <SummaryText hasLead={hasLead} summary={summary} />
          <span className="flex-1" />
          <Button
            variant="secondary"
            aria-label={`${workflow.name} ${FLOOR_DETAIL_BUTTON_LABEL}`}
            onClick={() => navigate(`/workflows/${encodeURIComponent(workflow.name)}`)}
          >
            {FLOOR_DETAIL_BUTTON_LABEL}
            <Icon name="arrow-right" />
          </Button>
        </div>
        <div className="floor-header flex min-w-0 items-center gap-2 whitespace-nowrap">
          <Button
            variant="secondary"
            disabledReason={writeReason}
            onClick={() => openDialog({ dialog: "import", workflow: workflow.name })}
          >
            <Icon name="import" />
            {FLOOR_IMPORT_BUTTON_LABEL}
          </Button>
          <Button
            variant="add"
            disabledReason={writeReason}
            onClick={() => openDialog({ dialog: "agent-new", workflow: workflow.name })}
          >
            <Icon name="plus" />
            {FLOOR_CREATE_BUTTON_LABEL}
          </Button>
          <span className="flex-1" />
          {/* 이유는 버튼 왼쪽. 카드 폭 440 이하면 `floor-reason`이 다음 줄 오른쪽으로 보낸다. */}
          {deleteReason === undefined ? null : (
            <span id={reasonId} className="floor-reason text-aux whitespace-nowrap text-text-muted">
              {deleteReason}
            </span>
          )}
          <Button
            variant="danger"
            disabled={deleteReason !== undefined}
            aria-describedby={deleteReason === undefined ? undefined : reasonId}
            onClick={() => openDialog({ dialog: "workflow-delete", workflow: workflow.name })}
          >
            <Icon name="trash-2" />
            {FLOOR_DELETE_BUTTON_LABEL}
          </Button>
        </div>
      </div>

      {hasLead ? null : <WarningLine>{FLOOR_NO_LEAD_WARNING}</WarningLine>}
      {duplicateNames.map((name) => (
        <WarningLine key={name}>{floorDuplicateWarning(name)}</WarningLine>
      ))}

      {deskNames.length === 0 ? null : (
        <div
          data-testid="floor-desks"
          className="desk-grid gap-2 border-t border-border bg-inset px-4 pt-3 pb-4"
        >
          {deskNames.map((name) => {
            const agentLive = live.agents[name];
            return (
              <Desk
                key={name}
                name={name}
                status={agentLive?.status ?? "idle"}
                isLead={name === canonicalLead}
                parentLabel={agentLive?.parentLabel ?? null}
                onOpen={() =>
                  navigate(`/workflows/${encodeURIComponent(workflow.name)}?agent=${encodeURIComponent(name)}`)
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
