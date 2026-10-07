/**
 * ui-spec.md SCR-02 층 선택 드롭다운(`02-3`). FR-006-AC7. 순수 표시용 controlled `<select>`.
 * 폭 220 고정(`floor-select`, `layout.css`), 선택한 이름은 한 줄 말줄임 — 층이 30개여도 폭·높이가 변하지 않는다.
 * 목록은 네이티브 펼침 창이라 창 안에서 스크롤한다.
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
    <div data-testid="floor-select" className="floor-select">
      <Select value={value} onChange={(event) => onChange(event.target.value)} aria-label="층 선택">
        <option value={ALL_VALUE}>{floorSelectAllLabel(workflows.length)}</option>
        {workflows.map((workflow) => (
          <option key={workflow.name} value={workflow.name}>
            {workflow.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
