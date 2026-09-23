/**
 * ui-spec.md SCR-02 층 선택 드롭다운. FR-006-AC7. 순수 표시용 controlled `<select>`.
 */
import type { Workflow } from "../../api/types";
import { Select } from "../../components/ui/Select";
import { floorSelectAllLabel } from "../../lib/text";

const ALL_VALUE = "";

interface FloorSelectProps {
  workflows: Workflow[];
  value: string;
  onChange: (value: string) => void;
}

export function FloorSelect({ workflows, value, onChange }: FloorSelectProps) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)} aria-label="층 선택">
      <option value={ALL_VALUE}>{floorSelectAllLabel(workflows.length)}</option>
      {workflows.map((workflow) => (
        <option key={workflow.name} value={workflow.name}>
          {workflow.name}
        </option>
      ))}
    </Select>
  );
}
