/**
 * `?dialog=` 값에 맞는 팝업을 그린다(ADR-14, ui-spec.md §공통 라우트).
 * `App`에서 한 번만 렌더링하므로 어느 화면 위에서도 같은 팝업이 뜬다.
 * 여기 연결된 값은 05 워크플로우 추가(SCR-05-L), 05-R 기존 에이전트 가져오기(SCR-05-R),
 * 05-3 워크플로우 삭제 확인(SCR-05-3), 06 에이전트 만들기·수정(SCR-06),
 * 06-6 워크플로우에서 제거 확인(SCR-06-6)이다.
 * 06-5(저장 충돌)는 06 폼 위에 뜨는 작은 창이라 URL이 아니라 컴포넌트 상태로 연다(ADR-14).
 */
import { useDialog } from "../app/router";
import { AgentForm } from "./agent-form/AgentForm";
import { ImportDialog } from "./import-agents/ImportDialog";
import { RemoveAgentDialog } from "./remove-agent/RemoveAgentDialog";
import { WorkflowAddDialog } from "./workflow-add/WorkflowAddDialog";
import { WorkflowDeleteDialog } from "./workflow-delete/WorkflowDeleteDialog";

export function DialogHost() {
  const { name, workflow, agent, close } = useDialog();

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
  // 06 만들기: `?workflow`가 있으면 소속을 미리 고른다(ui-spec.md SCR-06 소속 행).
  if (name === "agent-new") {
    return <AgentForm mode="create" agentName={null} workflowParam={workflow} onClose={close} />;
  }
  if (name === "agent-edit" && agent !== null) {
    return <AgentForm mode="edit" agentName={agent} workflowParam={workflow} onClose={close} />;
  }
  if (name === "agent-remove" && agent !== null) {
    return <RemoveAgentDialog agentName={agent} onClose={close} />;
  }
  return null;
}
