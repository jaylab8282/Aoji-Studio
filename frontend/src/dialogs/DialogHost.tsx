/**
 * `?dialog=` 값에 맞는 팝업을 그린다(ADR-14, ui-spec.md §공통 라우트).
 * `App`에서 한 번만 렌더링하므로 어느 화면 위에서도 같은 팝업이 뜬다.
 * 여기 연결된 값은 05 워크플로우 추가(SCR-05-L), 05-R 기존 에이전트 가져오기(SCR-05-R),
 * 05-3 워크플로우 삭제 확인(SCR-05-3)이다.
 */
import { useDialog } from "../app/router";
import { ImportDialog } from "./import-agents/ImportDialog";
import { WorkflowAddDialog } from "./workflow-add/WorkflowAddDialog";
import { WorkflowDeleteDialog } from "./workflow-delete/WorkflowDeleteDialog";

export function DialogHost() {
  const { name, workflow, close } = useDialog();

  if (name === "workflow-add") {
    return <WorkflowAddDialog onClose={close} />;
  }
  // 05-R: `?workflow`가 없으면 대상 워크플로우를 팝업 안 드롭다운에서 고른다(FR-009-AC7).
  if (name === "import") {
    return <ImportDialog workflowName={workflow} onClose={close} />;
  }
  if (name === "workflow-delete" && workflow !== null) {
    return <WorkflowDeleteDialog workflowName={workflow} onClose={close} />;
  }
  return null;
}
