/**
 * ui-spec.md SCR-02 검색+드롭다운 줄: 검색 입력 + 층 선택 드롭다운 + "+ 워크플로우 추가" 버튼.
 * 기준 이미지(docs/ui/screens/02-workflows.png)대로 오른쪽 정렬한 고정폭 묶음이다.
 * FR-006-AC7·AC8, FR-001-E2.
 */
import type { Workflow } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { SearchInput } from "../../components/ui/SearchInput";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import { ADD_WORKFLOW_HEADER_BUTTON_LABEL, SEARCH_PLACEHOLDER, WRITABLE_FALSE_REASON } from "../../lib/text";
import { FloorSelect } from "./FloorSelect";

interface FilterBarProps {
  workflows: Workflow[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedFloor: string;
  onSelectedFloorChange: (value: string) => void;
  writable: boolean;
}

export function FilterBar({
  workflows,
  search,
  onSearchChange,
  selectedFloor,
  onSelectedFloorChange,
  writable,
}: FilterBarProps) {
  const openDialog = useDialogNavigate();

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="w-70">
        <SearchInput
          placeholder={SEARCH_PLACEHOLDER}
          aria-label={SEARCH_PLACEHOLDER}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <FloorSelect workflows={workflows} value={selectedFloor} onChange={onSelectedFloorChange} />
      <Button
        variant="add"
        disabledReason={writable ? undefined : WRITABLE_FALSE_REASON}
        onClick={() => openDialog({ dialog: "workflow-add" })}
      >
        {ADD_WORKFLOW_HEADER_BUTTON_LABEL}
      </Button>
    </div>
  );
}
