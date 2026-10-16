/**
 * ui-spec SCR-08 행 한 줄 요약 칸(펼침 버튼 다음): 이름 + 칩(`08-9`~`08-11`) · 활용도 칸(`08-6`) · `사용 에이전트 N명`(`08-7`) · 행 동작(`08-8`).
 * 행 동작(`08-8`): `수정`(secondary, `pencil`) · `삭제`(danger, `trash-2`). 비활성 이유는 버튼 아래 오른쪽 한 줄이다.
 * `수정`: 쓰기 권한 > 가져온 스킬 > 형식 오류 순으로 이유를 하나만 보인다(FR-018-AC5·E1, FR-020-E2). `삭제`는 `writable=false`만 비활성(FR-022-AC4).
 */
import { useId } from "react";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { Icon } from "../../components/ui/Icon";
import { Meter } from "../../components/data/Meter";
import { UsedAgentsButton } from "../../components/data/UsedAgentsButton";
import { deleteDisabled, editDisabledReason, type SkillRowView } from "../../lib/derive/skillRows";
import {
  SKILL_CHIP_FORMAT_ERROR,
  SKILL_CHIP_IMPORTED,
  SKILL_CHIP_USER_ONLY,
  SKILL_DELETE_BUTTON_LABEL,
  SKILL_EDIT_BUTTON_LABEL,
  USAGE_NO_RECORD_TEXT,
  usageMeterLabel,
} from "../../lib/text";

interface SkillRowCellsProps {
  view: SkillRowView;
  expanded: boolean;
  detailId: string;
  onToggle: () => void;
  /** `registry.writable`. 첫 스냅샷 전에는 null(비활성, 이유 줄 없음 — ADR-44). */
  writable: boolean | null;
  onEdit: (name: string) => void;
  onDelete: (name: string) => void;
}

export function SkillRowCells({ view, expanded, detailId, onToggle, writable, onEdit, onDelete }: SkillRowCellsProps) {
  const reasonId = useId();
  const { row, percent, barRatio } = view;
  const deleteOff = writable === null || deleteDisabled(writable);
  const editReason = writable === null ? null : editDisabledReason(row, writable);
  const editOff = writable === null || editReason !== null;

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
          variant="secondary"
          disabled={editOff}
          aria-describedby={editReason === null ? undefined : reasonId}
          onClick={() => onEdit(row.name)}
        >
          <Icon name="pencil" />
          {SKILL_EDIT_BUTTON_LABEL}
        </Button>
        <Button
          variant="danger"
          disabled={deleteOff}
          aria-describedby={writable === false ? reasonId : undefined}
          onClick={() => onDelete(row.name)}
        >
          <Icon name="trash-2" />
          {SKILL_DELETE_BUTTON_LABEL}
        </Button>
        {editReason === null ? null : (
          <span id={reasonId} className="basis-full text-right text-aux text-text-muted">
            {editReason}
          </span>
        )}
      </div>
    </>
  );
}
