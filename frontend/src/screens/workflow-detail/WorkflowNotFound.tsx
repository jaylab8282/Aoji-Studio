/**
 * ui-spec.md SCR-03 헤더 행 에러 열: 워크플로우가 없으면 본문 전체를 `NoticeCard error`로 대체한다.
 * FR-007-E2, FR-017-AC4(열린 탭에서 삭제되어 registry가 갱신된 경우). 주 동작 `에이전트 워크플로우로` → `/workflows`.
 */
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { NoticeCard } from "../../components/ui/NoticeCard";
import { BACK_TO_WORKFLOWS_LABEL, WORKFLOW_NOT_FOUND_TEXT } from "../../lib/text";

export function WorkflowNotFound() {
  const navigate = useNavigate();

  return (
    <NoticeCard
      kind="error"
      icon="triangle-alert"
      title={WORKFLOW_NOT_FOUND_TEXT}
      actions={
        <Button variant="primary" onClick={() => navigate("/workflows")}>
          {BACK_TO_WORKFLOWS_LABEL}
        </Button>
      }
    />
  );
}
