/**
 * ui-spec.md SCR-06-5 저장 충돌 (06 폼 위 작은 창, FR-011-AC4, `06-5-save-conflict.html`).
 * `PUT /api/agents/{name}` 409 `REVISION_CONFLICT`의 `details.modifiedAt`으로 본문을 만든다.
 *
 * `Dialog sm`, `role="alertdialog"`. 두 버튼의 요청은 06 폼이 보낸다
 * (`최신 파일 다시 불러오기` = `GET` 재호출, `덮어쓰기` = `force: true`). 진행 중에는 두 버튼을 비활성으로 두고 이유 줄은 붙이지 않는다(ADR-35).
 * ESC·막 클릭은 이 창만 닫는다(Dialog가 쌓인 창 중 맨 위만 처리).
 */
import { useId } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog, DialogFooter, DialogHeader } from "../../components/ui/Dialog";
import { Icon } from "../../components/ui/Icon";
import { MonoText } from "../../components/ui/MonoText";
import { formatHms } from "../../lib/format/time";
import {
  SAVE_CONFLICT_BODY_AFTER_FILE,
  SAVE_CONFLICT_BODY_AFTER_TIME,
  SAVE_CONFLICT_OVERWRITE_LABEL,
  SAVE_CONFLICT_RELOAD_LABEL,
  SAVE_CONFLICT_TITLE,
} from "../../lib/text";

interface SaveConflictDialogProps {
  /** `AgentDetail.filePath`의 파일 이름(`web-reviewer.md`). */
  fileName: string;
  /** 409 응답 `details.modifiedAt`(ISO-8601 offset). */
  modifiedAt: string;
  reloading: boolean;
  overwriting: boolean;
  onReload: () => void;
  onOverwrite: () => void;
  onClose: () => void;
}

export function SaveConflictDialog({
  fileName,
  modifiedAt,
  reloading,
  overwriting,
  onReload,
  onOverwrite,
  onClose,
}: SaveConflictDialogProps) {
  const bodyId = useId();
  const pending = reloading || overwriting;

  return (
    <Dialog
      title={SAVE_CONFLICT_TITLE}
      size="sm"
      role="alertdialog"
      describedBy={bodyId}
      wf="06-5-1"
      onClose={onClose}
    >
      <DialogHeader title={SAVE_CONFLICT_TITLE} />
      <p id={bodyId} className="text-body text-text-secondary">
        <MonoText>{fileName}</MonoText>
        {SAVE_CONFLICT_BODY_AFTER_FILE}
        <MonoText>{formatHms(modifiedAt)}</MonoText>
        {SAVE_CONFLICT_BODY_AFTER_TIME}
      </p>
      <DialogFooter wf="06-5-2">
        <Button variant="accent" disabled={pending} onClick={onReload}>
          <Icon name="refresh-cw" />
          {SAVE_CONFLICT_RELOAD_LABEL}
        </Button>
        <Button variant="danger" disabled={pending} onClick={onOverwrite}>
          {SAVE_CONFLICT_OVERWRITE_LABEL}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
