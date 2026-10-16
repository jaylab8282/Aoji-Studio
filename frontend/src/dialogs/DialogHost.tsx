/**
 * `?dialog=` 값에 맞는 팝업을 그린다(ADR-14, ui-spec.md §공통 라우트).
 * `App`에서 한 번만 렌더링하므로 어느 화면 위에서도 같은 팝업이 뜬다.
 * 여기 연결된 값은 05 워크플로우 추가(SCR-05-L), 05-R 기존 에이전트 가져오기(SCR-05-R),
 * 05-3 워크플로우 삭제 확인(SCR-05-3), 06 에이전트 만들기·수정(SCR-06),
 * 06-6 워크플로우에서 제거 확인(SCR-06-6), (v1.2.0) 08-1 스킬 만들기·수정(SCR-08-1), 08-2 스킬 가져오기(SCR-08-2),
 * 08-3 스킬 삭제 확인(SCR-08-3), 10-1 단가(SCR-10-1)이다.
 * 06-5·08-4(저장 충돌)는 06·08-1 폼 위에 뜨는 작은 창이라 URL이 아니라 컴포넌트 상태로 연다(ADR-14).
 */
import { useDialog } from "../app/router";
import { AgentForm } from "./agent-form/AgentForm";
import { ImportDialog } from "./import-agents/ImportDialog";
import { PriceDialog } from "./price/PriceDialog";
import { SkillDeleteDialog } from "./skill-delete/SkillDeleteDialog";
import { SkillForm } from "./skill-form/SkillForm";
import { SkillImport } from "./skill-import/SkillImport";
import { RemoveAgentDialog } from "./remove-agent/RemoveAgentDialog";
import { WorkflowAddDialog } from "./workflow-add/WorkflowAddDialog";
import { WorkflowDeleteDialog } from "./workflow-delete/WorkflowDeleteDialog";

export function DialogHost() {
  const { name, workflow, agent, skill, close } = useDialog();

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
  // 08-1 만들기·수정, 08-2 가져오기. 08-4(저장 충돌)는 08-1 안에서 컴포넌트 상태로 연다. 수정은 `?skill`이 없으면 열지 않는다.
  if (name === "skill-new") {
    return <SkillForm mode="create" skillName={null} onClose={close} />;
  }
  if (name === "skill-edit" && skill !== null) {
    return <SkillForm mode="edit" skillName={skill} onClose={close} />;
  }
  if (name === "skill-import") {
    return <SkillImport onClose={close} />;
  }
  // 08-3: `?skill`가 없으면 열지 않는다.
  if (name === "skill-delete" && skill !== null) {
    return <SkillDeleteDialog skillName={skill} onClose={close} />;
  }
  // 10-1 단가(읽기 전용): 10 `단가` 버튼이 연다. 다른 쿼리는 필요 없다.
  if (name === "price") {
    return <PriceDialog onClose={close} />;
  }
  return null;
}
