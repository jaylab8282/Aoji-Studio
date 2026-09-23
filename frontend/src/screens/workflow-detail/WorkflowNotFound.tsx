/**
 * ui-spec.md SCR-03 헤더 행 에러 열: 워크플로우가 없으면 본문 전체를 이 안내로 대체한다.
 * FR-007-E2, FR-017-AC4(열린 탭에서 삭제되어 registry가 갱신된 경우).
 */
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { BACK_TO_WORKFLOWS_LABEL, WORKFLOW_NOT_FOUND_TEXT } from "../../lib/text";

export function WorkflowNotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <p className="text-section font-semibold text-text">{WORKFLOW_NOT_FOUND_TEXT}</p>
      <Button variant="primary" onClick={() => navigate("/workflows")}>
        {BACK_TO_WORKFLOWS_LABEL}
      </Button>
    </div>
  );
}
