/**
 * ui-spec.md §공통 `HelperMissingDialog` (02·03·07, FR-013-AC9·E1).
 * 구성: 제목 `열기 도우미가 응답하지 않습니다`, 본문 `helper/install.sh로 설치한 뒤 다시 시도하세요`,
 * 선택한 항목의 명령(mono 박스), `명령 복사`, `닫기`.
 *
 * `?dialog=`에 태우지 않는다(ADR-14): URL로 여는 팝업이 아니라 버튼을 누른 결과로만 뜨고,
 * 새로고침하면 다시 떠서는 안 되는 안내이기 때문이다(06-5와 같은 이유로 컴포넌트 상태로 연다).
 * 폭은 `Dialog`의 기본 `md`다(ADR-40이 이 팝업을 `md`로 지정했다).
 */
import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { Dialog } from "../../components/ui/Dialog";
import { MonoText } from "../../components/ui/MonoText";
import {
  CLOSE_BUTTON_LABEL,
  COPY_COMMAND_LABEL,
  HELPER_MISSING_DIALOG_BODY,
  HELPER_MISSING_DIALOG_TITLE,
} from "../../lib/text";

interface HelperMissingDialogProps {
  /** 누른 항목의 명령(02·07은 기본 세션, 03은 팀장 명령). 그대로 보여주고 그대로 복사한다. */
  command: string;
  onClose: () => void;
}

export function HelperMissingDialog({ command, onClose }: HelperMissingDialogProps) {
  return (
    <Dialog title={HELPER_MISSING_DIALOG_TITLE} onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="helper-missing-dialog">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-section font-semibold text-text">{HELPER_MISSING_DIALOG_TITLE}</h2>
          <p className="text-aux text-text-secondary">{HELPER_MISSING_DIALOG_BODY}</p>
        </div>

        <div className="rounded-control bg-soft px-3 py-2 text-aux">
          <MonoText>{command}</MonoText>
        </div>

        <div className="flex items-center justify-end gap-2">
          <CopyButton value={command} label={COPY_COMMAND_LABEL} />
          <Button variant="secondary" size="sm" onClick={onClose}>
            {CLOSE_BUTTON_LABEL}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
