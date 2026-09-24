/**
 * 06 폼 본문: 상단 사유(FR-011-E4) → 입력 묶음 → 사용 도구 → 지침 → 팝업 사유.
 * 각주·버튼 줄(`AgentFormFooter`)은 `AgentForm.tsx`가 본문 밖에서 그린다 — 파일을 읽는 동안에도
 * 사라지지 않아야 하기 때문이다(ui-spec.md SCR-06 `로딩` 열, T-019 리뷰 Minor 1).
 * 판정은 `lib/derive/agentForm.ts`와 `AgentForm.tsx`가 넘겨준 값만 쓴다.
 */
import type { Workflow } from "../../api/types";
import { TextArea } from "../../components/ui/TextArea";
import { explicitToolsEmpty, type AgentFormValues } from "../../lib/derive/agentForm";
import { AGENT_BODY_LABEL, TOOLS_EXPLICIT_EMPTY_MESSAGE } from "../../lib/text";
import type { SubmitError } from "./useAgentFormState";
import { AgentFormFields } from "./AgentFormFields";
import { ToolsField } from "./ToolsField";

export interface AgentFormBodyProps {
  values: AgentFormValues;
  workflows: Workflow[];
  allowNoWorkflow: boolean;
  leadTaken: string | null;
  fieldErrors: Record<string, string>;
  submitError: SubmitError | null;
  pending: boolean;
  ids: Record<string, string> & { name: string; model: string; customModel: string; workflow: string; description: string; otherTools: string; body: string };
  onChange: (patch: Partial<AgentFormValues>) => void;
}

export function AgentFormBody(props: AgentFormBodyProps) {
  const { values, submitError, pending, ids, onChange } = props;
  const toolsError = explicitToolsEmpty(values) ? TOOLS_EXPLICIT_EMPTY_MESSAGE : props.fieldErrors.tools;

  return (
    <>
      {submitError?.slot === "top" ? (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-aux text-danger">
          {submitError.message}
        </p>
      ) : null}

      <AgentFormFields
        values={values}
        workflows={props.workflows}
        allowNoWorkflow={props.allowNoWorkflow}
        leadTaken={props.leadTaken}
        roleError={submitError?.slot === "role" ? submitError.message : null}
        fieldErrors={props.fieldErrors}
        disabled={pending}
        ids={ids}
        onChange={onChange}
      />

      <ToolsField
        values={values}
        error={toolsError}
        disabled={pending}
        otherInputId={ids.otherTools}
        onChange={onChange}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.body} className="text-aux text-text-secondary">
          {AGENT_BODY_LABEL}
        </label>
        <TextArea
          id={ids.body}
          rows={6}
          value={values.body}
          disabled={pending}
          onChange={(event) => onChange({ body: event.target.value })}
        />
      </div>

      {submitError?.slot === "form" ? (
        <p role="alert" className="text-aux text-danger">
          {submitError.message}
        </p>
      ) : null}
    </>
  );
}
