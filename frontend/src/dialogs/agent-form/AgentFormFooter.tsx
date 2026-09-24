/**
 * 06 폼 아래 줄: 각주(FR-011-AC1·AC2) + `워크플로우에서 제거`(수정 모드) + `취소` + `저장`.
 * 비활성 이유 줄은 ADR-35가 지정한 지점(`쓰기 권한 없음`, `도구 방식을 고르세요`,
 * `작업 중에는 제거할 수 없습니다`)에만 붙는다. 필수값 미입력·진행 중에는 붙이지 않는다.
 */
import { Button } from "../../components/ui/Button";
import {
  AGENT_FORM_FOOTNOTE,
  AGENT_FORM_SUBMIT_LABEL,
  AGENT_FORM_SUBMIT_PENDING_LABEL,
  AGENT_REMOVE_FROM_WORKFLOW_BUTTON_LABEL,
  CANCEL_BUTTON_LABEL,
} from "../../lib/text";

interface AgentFormFooterProps {
  /** 수정 모드에서만 `워크플로우에서 제거`를 그린다(ui-spec.md SCR-06 `빈` 열). */
  showRemove: boolean;
  removeDisabledReason?: string;
  submitDisabledReason?: string;
  /** 이유 줄 없이 비활성(필수값 미입력·파일 읽는 중·저장 중). */
  submitDisabled: boolean;
  pending: boolean;
  /**
   * 06 수정 모드에서 정의 파일을 읽는 중(ui-spec.md SCR-06 제목 행 `로딩` 열 "폼 전체 비활성").
   * 각주·버튼은 사라지지 않고 그려진 채 모두 비활성이며 이유 줄은 붙이지 않는다(ADR-35).
   */
  loading?: boolean;
  onRemove: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function AgentFormFooter({
  showRemove,
  removeDisabledReason,
  submitDisabledReason,
  submitDisabled,
  pending,
  loading = false,
  onRemove,
  onCancel,
  onSubmit,
}: AgentFormFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-aux text-text-faint">{AGENT_FORM_FOOTNOTE}</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {showRemove ? (
          <Button
            variant="danger"
            size="sm"
            disabled={loading}
            disabledReason={removeDisabledReason}
            onClick={onRemove}
          >
            {AGENT_REMOVE_FROM_WORKFLOW_BUTTON_LABEL}
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" disabled={pending || loading} onClick={onCancel}>
          {CANCEL_BUTTON_LABEL}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={submitDisabled}
          disabledReason={submitDisabledReason}
          onClick={onSubmit}
        >
          {pending ? AGENT_FORM_SUBMIT_PENDING_LABEL : AGENT_FORM_SUBMIT_LABEL}
        </Button>
      </div>
    </div>
  );
}
