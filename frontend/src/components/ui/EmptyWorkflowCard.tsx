/**
 * ui-spec.md SCR-04-7 워크플로우 0개 (01 대표 워크플로우 영역, 02 층 그리드 자리).
 * `registry.workflows.length === 0`일 때 쓴다. FR-005-AC5, FR-006-E3.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "./Button";
import { ADD_WORKFLOW_BUTTON_LABEL, EMPTY_WORKFLOW_TITLE, WRITABLE_FALSE_REASON } from "../../lib/text";

export function EmptyWorkflowCard({ writable }: { writable: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();

  function handleClick() {
    const params = new URLSearchParams(location.search);
    params.set("dialog", "workflow-add");
    navigate({ pathname: location.pathname, search: `?${params.toString()}` });
  }

  return (
    <div className="rounded-card border border-dashed border-border-dashed bg-card p-card flex flex-col items-center justify-center gap-3 text-center">
      <span aria-hidden="true" className="text-title text-text-faint">
        +
      </span>
      <p className="text-body text-text-secondary">{EMPTY_WORKFLOW_TITLE}</p>
      <Button variant="primary" onClick={handleClick} disabledReason={writable ? undefined : WRITABLE_FALSE_REASON}>
        {ADD_WORKFLOW_BUTTON_LABEL}
      </Button>
    </div>
  );
}
