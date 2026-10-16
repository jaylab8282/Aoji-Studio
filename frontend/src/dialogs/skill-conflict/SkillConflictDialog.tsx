/**
 * ui-spec.md SCR-08-4 스킬 저장 충돌 (08-1 위 작은 창, FR-020-AC4, `08-4-skill-conflict.html`).
 * `PUT /api/skills/{skill}` 409 `REVISION_CONFLICT`의 `details.modifiedAt`으로 본문을 만든다. 구성은 06-5와 같다:
 * `Dialog sm`, `role="alertdialog"`, 두 버튼 `최신 파일 다시 불러오기`(accent, `refresh-cw`)·`덮어쓰기`(danger).
 * 두 버튼의 요청은 08-1 폼이 보낸다(`GET` 재호출 / `force: true`). 진행 중에는 둘 다 비활성이다. ESC·막 클릭은 이 창만 닫는다(Dialog).
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

interface SkillConflictDialogProps {
  /** 본문 파일 표기 `<이름>/SKILL.md`. */
  fileName: string;
  /** 409 응답 `details.modifiedAt`(ISO-8601 offset). */
  modifiedAt: string;
  reloading: boolean;
  overwriting: boolean;
  onReload: () => void;
  onOverwrite: () => void;
  onClose: () => void;
}

export function SkillConflictDialog({
  fileName,
  modifiedAt,
  reloading,
  overwriting,
  onReload,
  onOverwrite,
  onClose,
}: SkillConflictDialogProps) {
  const bodyId = useId();
  const pending = reloading || overwriting;

  return (
    <Dialog title={SAVE_CONFLICT_TITLE} size="sm" role="alertdialog" describedBy={bodyId} wf="08-4-1" onClose={onClose}>
      <DialogHeader title={SAVE_CONFLICT_TITLE} />
      <p id={bodyId} className="text-body text-text-secondary">
        <MonoText>{fileName}</MonoText>
        {SAVE_CONFLICT_BODY_AFTER_FILE}
        <MonoText>{formatHms(modifiedAt)}</MonoText>
        {SAVE_CONFLICT_BODY_AFTER_TIME}
      </p>
      <DialogFooter wf="08-4-2">
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
