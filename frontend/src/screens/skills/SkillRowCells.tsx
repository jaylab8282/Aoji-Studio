/**
 * ui-spec SCR-08 행 한 줄 요약 칸(펼침 버튼 다음): 이름 + 칩(`08-9`~`08-11`) · 활용도 칸(`08-6`) · `사용 에이전트 N명`(`08-7`) · 행 동작(`08-8`).
 * 행 동작은 이 태스크에서 `삭제`만 있다(`수정`은 08-1과 함께 T-R4-16). `writable=false`면 비활성 + 버튼 아래 오른쪽 `쓰기 권한 없음`(FR-020-E2).
 */
import { useId } from "react";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { Icon } from "../../components/ui/Icon";
import { Meter } from "../../components/data/Meter";
import { UsedAgentsButton } from "../../components/data/UsedAgentsButton";
import { deleteDisabled, type SkillRowView } from "../../lib/derive/skillRows";
import {
  SKILL_CHIP_FORMAT_ERROR,
  SKILL_CHIP_IMPORTED,
  SKILL_CHIP_USER_ONLY,
  SKILL_DELETE_BUTTON_LABEL,
  USAGE_NO_RECORD_TEXT,
  WRITABLE_FALSE_REASON,
  usageMeterLabel,
} from "../../lib/text";

interface SkillRowCellsProps {
  view: SkillRowView;
  expanded: boolean;
  detailId: string;
  onToggle: () => void;
  /** `registry.writable`. 첫 스냅샷 전에는 null(비활성, 이유 줄 없음 — ADR-44). */
  writable: boolean | null;
  onDelete: (name: string) => void;
}

export function SkillRowCells({ view, expanded, detailId, onToggle, writable, onDelete }: SkillRowCellsProps) {
  const reasonId = useId();
  const { row, percent, barRatio } = view;
  const disabled = writable === null || deleteDisabled(writable);
  const showReason = writable === false;

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <b data-clamp title={row.name} className="min-w-0 truncate font-mono font-medium text-text">
          {row.name}
        </b>
        {row.userOnly ? <Chip tone="outline">{SKILL_CHIP_USER_ONLY}</Chip> : null}
        {row.imported ? <Chip>{SKILL_CHIP_IMPORTED}</Chip> : null}
        {row.formatError !== null ? <Chip tone="danger">{SKILL_CHIP_FORMAT_ERROR}</Chip> : null}
      </div>
      <div data-wf="08-6" className="flex items-center gap-3">
        {percent === null ? (
          <span className="text-aux text-text-muted">{USAGE_NO_RECORD_TEXT}</span>
        ) : (
          <>
            <span className="w-12 flex-none text-right font-mono text-text">{percent}%</span>
            <Meter ratio={barRatio} label={usageMeterLabel(percent)} />
          </>
        )}
      </div>
      <div data-wf="08-7">
        <UsedAgentsButton count={row.usedAgentCount} expanded={expanded} onToggle={onToggle} controls={detailId} />
      </div>
      <div data-wf="08-8" className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="danger"
          disabled={disabled}
          aria-describedby={showReason ? reasonId : undefined}
          onClick={() => onDelete(row.name)}
        >
          <Icon name="trash-2" />
          {SKILL_DELETE_BUTTON_LABEL}
        </Button>
        {showReason ? (
          <span id={reasonId} className="basis-full text-right text-aux text-text-muted">
            {WRITABLE_FALSE_REASON}
          </span>
        ) : null}
      </div>
    </>
  );
}
