/**
 * ui-spec.md SCR-05-R 목록 표: 체크박스 / `이름 (name)` / `설명 (description)`(첫 줄) / `역할` 드롭다운.
 * 표시만 담당하고 판정(정렬·검색·팀장 비활성)은 `lib/derive/*`가 한다(conventions.md §3 Frontend MUST).
 */
import type { AgentDef, Role } from "../../api/types";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { descriptionFirstLine, isLeadOptionDisabled } from "../../lib/derive/importCandidates";
import {
  IMPORT_TABLE_COL_DESCRIPTION,
  IMPORT_TABLE_COL_NAME,
  IMPORT_TABLE_COL_ROLE,
  ROLE_OPTION_TEXT,
  importRoleSelectLabel,
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
    <div className="flex flex-col gap-2">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <Skeleton key={index} className="h-btn-sm w-full" />
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
    <table className="w-full border-collapse text-body">
      <thead>
        <tr className="text-aux text-text-secondary">
          <th scope="col" className="w-8" />
          <th scope="col" className="py-1 text-left font-normal">
            {IMPORT_TABLE_COL_NAME}
          </th>
          <th scope="col" className="py-1 text-left font-normal">
            {IMPORT_TABLE_COL_DESCRIPTION}
          </th>
          <th scope="col" className="py-1 text-left font-normal">
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
          return (
            // 선택 행이 `bg-selected`이므로 비선택 행 hover는 `bg-soft`다(ADR-46 A ②). 선택 행에는 hover 표현이 없다.
            <tr key={agent.name} className={checked ? "bg-selected" : "hover:bg-soft"}>
              <td className="py-1.5 pl-2">
                <input
                  type="checkbox"
                  aria-label={agent.name}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(agent.name)}
                />
              </td>
              <td className="py-1.5 pr-3 font-mono font-bold text-text">{agent.name}</td>
              <td className="py-1.5 pr-3 text-text-secondary">{descriptionFirstLine(agent.description)}</td>
              <td className="py-1.5 pr-2">
                <Select
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
  );
}
