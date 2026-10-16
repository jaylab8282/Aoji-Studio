/**
 * ui-spec.md §공통 `HelperMissingDialog` (02·03·07, FR-013-AC9·E1, ADR-71): `Dialog sm`.
 * 제목 `열기 도우미가 응답하지 않습니다` + 부제 `<설치 스크립트>로 설치한 뒤 다시 시도하세요`(macos `helper/install.sh` / wsl `helper/windows/install.ps1`, ADR-91),
 * 선택한 항목의 명령(`CommandLine`), `명령 복사`(`CopyButton`), `닫기`. 시안이 없는 상태라 기존 확정 문구를 공통 컴포넌트로 표현한다.
 *
 * `?dialog=`에 태우지 않는다(ADR-14): URL로 여는 팝업이 아니라 버튼을 누른 결과로만 뜨고,
 * 새로고침하면 다시 떠서는 안 되는 안내이기 때문이다(06-5와 같은 이유로 컴포넌트 상태로 연다).
 */
import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { CommandLine } from "../../components/ui/CommandLine";
import { Dialog, DialogFooter, DialogHeader } from "../../components/ui/Dialog";
import type { HostOs } from "../../api/types";
import {
  CLOSE_BUTTON_LABEL,
  COPY_COMMAND_LABEL,
  HELPER_MISSING_DIALOG_TITLE,
  helperMissingDialogBody,
} from "../../lib/text";

interface HelperMissingDialogProps {
  /** 누른 항목의 명령(02·07은 기본 세션, 03은 팀장 명령 — 실행 환경별). 그대로 보여주고 그대로 복사한다. */
  command: string;
  /** 실행 환경(`config.hostOs`). 설치 스크립트 안내가 달라진다 — macos `helper/install.sh` / wsl `helper/windows/install.ps1`(ADR-91). */
  hostOs: HostOs;
  onClose: () => void;
}

export function HelperMissingDialog({ command, hostOs, onClose }: HelperMissingDialogProps) {
  return (
    <Dialog title={HELPER_MISSING_DIALOG_TITLE} size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="helper-missing-dialog">
        <DialogHeader title={HELPER_MISSING_DIALOG_TITLE} subtitle={helperMissingDialogBody(hostOs)} />
        <CommandLine>{command}</CommandLine>
        <DialogFooter>
          <CopyButton value={command} label={COPY_COMMAND_LABEL} />
          <Button variant="secondary" onClick={onClose}>
            {CLOSE_BUTTON_LABEL}
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
