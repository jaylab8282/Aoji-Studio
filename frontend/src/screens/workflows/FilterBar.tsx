/**
 * ui-spec.md SCR-02 검색 + 층 드롭다운 + `워크플로우 추가`(`02-3` 오른쪽). FR-006-AC7·AC8, FR-001-E2.
 * 검색은 폭 200~320(남는 폭에서 줄어든다, 세로형은 남는 폭 전부), 드롭다운은 220 고정(`FloorSelect`).
 * 한 줄, 줄바꿈 없음. `워크플로우 추가`는 `plus` 아이콘 + 글자(추가 버튼).
 */
import type { Workflow } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
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
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2 whitespace-nowrap portrait:justify-start">
      <div data-testid="search-box" className="search-box">
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
        <Icon name="plus" />
        {ADD_WORKFLOW_HEADER_BUTTON_LABEL}
      </Button>
    </div>
  );
}
