/**
 * 06 폼 아래 줄 (`06-agent-form.html` `.foot`, 영역 `06-6`): 왼쪽 보존 안내(FR-011-AC1·AC2) + `워크플로우에서 제거`(수정 모드, danger, `trash-2`)
 * + `취소` + `저장`(primary). 비활성 이유 줄은 ADR-35가 지정한 지점(`도구 방식을 고르세요`, `작업 중에는 제거할 수 없습니다`)에만 붙고,
 * 쓰기 권한 없음 문구는 버튼 줄 아래 한 줄이다(ui-rules). 필수값 미입력·진행 중에는 이유 줄을 붙이지 않는다.
 */
import { DialogFooter } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import {
  AGENT_FORM_FOOTNOTE,
  AGENT_FORM_SUBMIT_LABEL,
  AGENT_FORM_SUBMIT_PENDING_LABEL,
  AGENT_REMOVE_FROM_WORKFLOW_BUTTON_LABEL,
  CANCEL_BUTTON_LABEL,
  WRITABLE_FALSE_POPUP_NOTICE,
} from "../../lib/text";

interface AgentFormFooterProps {
  /** 수정 모드에서만 `워크플로우에서 제거`를 그린다(ui-spec.md SCR-06 `빈` 열). */
  showRemove: boolean;
  /** 수정 중이 아니거나(읽는 중·`writable=false`) 작업 중이면 비활성. */
  removeDisabled: boolean;
  removeDisabledReason?: string;
  submitDisabledReason?: string;
  /** 이유 줄 없이 비활성(필수값 미입력·파일 읽는 중·저장 중·`writable=false`). */
  submitDisabled: boolean;
  pending: boolean;
  /** 정의 파일을 읽는 중: 각주·버튼은 그려진 채 모두 비활성이고 이유 줄은 없다(ADR-35). */
  loading: boolean;
  writable: boolean;
  onRemove: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function AgentFormFooter({
  showRemove,
  removeDisabled,
  removeDisabledReason,
  submitDisabledReason,
  submitDisabled,
  pending,
  loading,
  writable,
  onRemove,
  onCancel,
  onSubmit,
}: AgentFormFooterProps) {
  return (
    <>
      <DialogFooter wf="06-6" note={AGENT_FORM_FOOTNOTE}>
        {showRemove ? (
          <Button variant="danger" disabled={removeDisabled} disabledReason={removeDisabledReason} onClick={onRemove}>
            <Icon name="trash-2" />
            {AGENT_REMOVE_FROM_WORKFLOW_BUTTON_LABEL}
          </Button>
        ) : null}
        <Button variant="secondary" disabled={pending || loading} onClick={onCancel}>
          {CANCEL_BUTTON_LABEL}
        </Button>
        <Button variant="primary" disabled={submitDisabled} disabledReason={submitDisabledReason} onClick={onSubmit}>
          {pending ? AGENT_FORM_SUBMIT_PENDING_LABEL : AGENT_FORM_SUBMIT_LABEL}
        </Button>
      </DialogFooter>
      {writable ? null : <p className="text-right text-aux text-text-muted">{WRITABLE_FALSE_POPUP_NOTICE}</p>}
    </>
  );
}
