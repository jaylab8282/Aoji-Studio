/**
 * ui-spec.md SCR-06-5 저장 충돌 (06 폼 위 작은 창, FR-011-AC4).
 * `PUT /api/agents/{name}` 409 `REVISION_CONFLICT`의 `details.modifiedAt`으로 본문을 만든다.
 *
 * 폭은 공통 `Dialog` 기본값 `md`다(ADR-40 — `size`를 넘기지 않는다).
 * 두 버튼의 요청은 06 폼이 보낸다(`최신 파일 다시 불러오기` = `GET` 재호출, `덮어쓰기` = `force: true`).
 * 진행 중에는 두 버튼을 비활성으로 두고 이유 줄은 붙이지 않는다(ADR-35).
 */
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { formatHms } from "../../lib/format/time";
import {
  SAVE_CONFLICT_OVERWRITE_LABEL,
  SAVE_CONFLICT_RELOAD_LABEL,
  SAVE_CONFLICT_TITLE,
  saveConflictBody,
} from "../../lib/text";

interface SaveConflictDialogProps {
  agentName: string;
  /** 409 응답 `details.modifiedAt`(ISO-8601 offset). */
  modifiedAt: string;
  reloading: boolean;
  overwriting: boolean;
  onReload: () => void;
  onOverwrite: () => void;
  onClose: () => void;
}

export function SaveConflictDialog({
  agentName,
  modifiedAt,
  reloading,
  overwriting,
  onReload,
  onOverwrite,
  onClose,
}: SaveConflictDialogProps) {
  const pending = reloading || overwriting;

  return (
    <Dialog title={SAVE_CONFLICT_TITLE} onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="save-conflict-dialog">
        <h2 className="text-section font-semibold text-text">{SAVE_CONFLICT_TITLE}</h2>
        <p className="text-body text-text-secondary">{saveConflictBody(agentName, formatHms(modifiedAt))}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={onReload}>
            {SAVE_CONFLICT_RELOAD_LABEL}
          </Button>
          <Button variant="danger" size="sm" disabled={pending} onClick={onOverwrite}>
            {SAVE_CONFLICT_OVERWRITE_LABEL}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
