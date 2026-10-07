/**
 * ui-spec.md SCR-04-7 워크플로우 0개 (01 대표 워크플로우 영역, 02 캔버스 자리). `NoticeCard empty`(`04-7-1`).
 * `registry.workflows.length === 0`일 때 쓴다. FR-005-AC5, FR-006-E3.
 * `워크플로우 추가`(accent, `plus`)는 `writable`일 때만 활성이고 `?dialog=workflow-add`로 이동한다.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { NoticeCard } from "./NoticeCard";
import { ADD_WORKFLOW_BUTTON_LABEL, EMPTY_WORKFLOW_BODY, EMPTY_WORKFLOW_TITLE, WRITABLE_FALSE_REASON } from "../../lib/text";

export function EmptyWorkflowCard({ writable }: { writable: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();

  function handleClick() {
    const params = new URLSearchParams(location.search);
    params.set("dialog", "workflow-add");
    navigate({ pathname: location.pathname, search: `?${params.toString()}` });
  }

  return (
    <NoticeCard
      kind="empty"
      icon="building"
      title={EMPTY_WORKFLOW_TITLE}
      wf="04-7-1"
      actions={
        <Button variant="accent" onClick={handleClick} disabledReason={writable ? undefined : WRITABLE_FALSE_REASON}>
          <Icon name="plus" />
          {ADD_WORKFLOW_BUTTON_LABEL}
        </Button>
      }
    >
      <p>{EMPTY_WORKFLOW_BODY}</p>
    </NoticeCard>
  );
}
