/**
 * ui-spec.md SCR-05-R 목록 표(`05R-agent-import.html` `.imp-list`): 테두리 카드, 열 44/200/나머지/150,
 * 체크박스 / `이름 (name)`(고정폭) / `설명 (description)`(말줄임 + `title`) / `역할` 드롭다운(높이 30). 선택 행 바탕 `action-soft`.
 * 표시만 담당하고 판정(정렬·검색·팀장 비활성)은 `lib/derive/*`가 한다(conventions.md §3 Frontend MUST).
 * 행에는 클릭·hover 동작이 없다(클릭 대상은 체크박스·역할 드롭다운, ADR-49 1).
 */
import type { AgentDef, Role } from "../../api/types";
import { Checkbox } from "../../components/ui/Checkbox";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { descriptionFirstLine, isLeadOptionDisabled } from "../../lib/derive/importCandidates";
import {
  IMPORT_TABLE_COL_DESCRIPTION,
  IMPORT_TABLE_COL_NAME,
  IMPORT_TABLE_COL_ROLE,
  IMPORT_TABLE_SELECT_LABEL,
  ROLE_OPTION_TEXT,
  importRoleSelectLabel,
  importRowCheckLabel,
} from "../../lib/text";

/** ui-spec.md §공통 로딩: 05-R 목록은 자체 스켈레톤 5행을 갖는다(ADR-32 예외 목록). */
const SKELETON_ROW_COUNT = 5;

interface ImportAgentTableProps {
  agents: AgentDef[];
  selectedNames: string[];
  roles: Record<string, Role | undefined>;
  /** 대상 워크플로우의 `lead`(FR-009-AC4). 대상 미정이면 null. */
  targetLead: string | null;
  /** 이 목록에서 이미 `팀장`을 고른 행(FR-009-E1 사전 방지). 없으면 null. */
  leadRowName: string | null;
  disabled: boolean;
  onToggle: (name: string) => void;
  onRoleChange: (name: string, role: Role) => void;
}

export function ImportAgentTableSkeleton() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-0 flex-col gap-2 rounded-card border border-border bg-card p-2"
    >
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <Skeleton key={index} decorative className="h-7 w-full" />
      ))}
    </div>
  );
}

export function ImportAgentTable({
  agents,
  selectedNames,
  roles,
  targetLead,
  leadRowName,
  disabled,
  onToggle,
  onRoleChange,
}: ImportAgentTableProps) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-card border border-border">
      <table className="w-full table-fixed border-collapse text-body">
        <colgroup>
          <col className="w-col-check" />
          <col className="w-col-name" />
          <col />
          <col className="w-col-role" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="sticky top-0 border-b border-border bg-card px-2 py-1.5 text-left text-aux font-semibold text-text-muted">
              <span className="sr-only">{IMPORT_TABLE_SELECT_LABEL}</span>
            </th>
            <th scope="col" className="sticky top-0 border-b border-border bg-card px-2 py-1.5 text-left text-aux font-semibold whitespace-nowrap text-text-muted">
              {IMPORT_TABLE_COL_NAME}
            </th>
            <th scope="col" className="sticky top-0 border-b border-border bg-card px-2 py-1.5 text-left text-aux font-semibold whitespace-nowrap text-text-muted">
              {IMPORT_TABLE_COL_DESCRIPTION}
            </th>
            <th scope="col" className="sticky top-0 border-b border-border bg-card px-2 py-1.5 text-left text-aux font-semibold whitespace-nowrap text-text-muted">
              {IMPORT_TABLE_COL_ROLE}
            </th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => {
            const checked = selectedNames.includes(agent.name);
            const role: Role = roles[agent.name] ?? "member";
            const leadDisabled = isLeadOptionDisabled({
              targetLead,
              leadSelectedBy: leadRowName,
              rowName: agent.name,
            });
            const description = descriptionFirstLine(agent.description);
            const cell = `overflow-hidden border-b border-border px-2 py-1.5 align-middle text-ellipsis whitespace-nowrap ${checked ? "bg-action-soft" : ""}`;
            return (
              <tr key={agent.name} data-selected={checked}>
                <td className={cell}>
                  <Checkbox
                    aria-label={importRowCheckLabel(agent.name)}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(agent.name)}
                  />
                </td>
                <td className={`${cell} font-mono text-text-mono`}>{agent.name}</td>
                <td className={`${cell} text-text-secondary`} title={description}>
                  {description}
                </td>
                <td className={cell}>
                  <Select
                    compact
                    aria-label={importRoleSelectLabel(agent.name)}
                    value={role}
                    disabled={disabled}
                    onChange={(event) => onRoleChange(agent.name, event.target.value as Role)}
                  >
                    <option value="lead" disabled={leadDisabled}>
                      {ROLE_OPTION_TEXT.lead}
                    </option>
                    <option value="member">{ROLE_OPTION_TEXT.member}</option>
                  </Select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
