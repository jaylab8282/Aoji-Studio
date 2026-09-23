/**
 * `?dialog=` 값에 맞는 팝업을 그린다(ADR-14, ui-spec.md §공통 라우트).
 * `App`에서 한 번만 렌더링하므로 어느 화면 위에서도 같은 팝업이 뜬다.
 * 여기 연결된 값은 05 워크플로우 추가(SCR-05-L)와 05-3 워크플로우 삭제 확인(SCR-05-3)이다.
 */
import { useDialog } from "../app/router";
import { WorkflowAddDialog } from "./workflow-add/WorkflowAddDialog";
import { WorkflowDeleteDialog } from "./workflow-delete/WorkflowDeleteDialog";

export function DialogHost() {
  const { name, workflow, close } = useDialog();

  if (name === "workflow-add") {
    return <WorkflowAddDialog onClose={close} />;
  }
  if (name === "workflow-delete" && workflow !== null) {
    return <WorkflowDeleteDialog workflowName={workflow} onClose={close} />;
  }
  return null;
}
