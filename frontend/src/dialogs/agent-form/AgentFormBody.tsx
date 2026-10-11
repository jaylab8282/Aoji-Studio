/**
 * 06 폼 스크롤 영역 (`06-agent-form.html` `.scrollf`): 입력 묶음 → 사용 도구 → 지침(남는 높이).
 * 아래 줄(`AgentFormFooter`)은 `AgentForm.tsx`가 스크롤 밖에서 그린다 — 파일을 읽는 동안에도 사라지지 않아야 하기 때문이다.
 * 판정은 `lib/derive/agentForm.ts`와 `AgentForm.tsx`가 넘겨준 값만 쓴다.
 */
import type { Workflow } from "../../api/types";
import { TextArea } from "../../components/ui/TextArea";
import { explicitToolsEmpty, type AgentFormValues } from "../../lib/derive/agentForm";
import { AGENT_BODY_LABEL, TOOLS_EXPLICIT_EMPTY_MESSAGE } from "../../lib/text";
import { AgentFormFields } from "./AgentFormFields";
import { ToolsField } from "./ToolsField";

export interface AgentFormBodyProps {
  values: AgentFormValues;
  workflows: Workflow[];
  allowNoWorkflow: boolean;
  leadTaken: string | null;
  fieldErrors: Record<string, string>;
  /** 409 `LEAD_EXISTS` 사유. */
  roleError: string | null;
  pending: boolean;
  ids: { name: string; model: string; customModel: string; workflow: string; description: string; body: string };
  onChange: (patch: Partial<AgentFormValues>) => void;
}

export function AgentFormBody({ values, pending, ids, onChange, ...rest }: AgentFormBodyProps) {
  const toolsError = explicitToolsEmpty(values) ? TOOLS_EXPLICIT_EMPTY_MESSAGE : rest.fieldErrors.tools;

  return (
    <>
      <AgentFormFields
        values={values}
        workflows={rest.workflows}
        allowNoWorkflow={rest.allowNoWorkflow}
        leadTaken={rest.leadTaken}
        roleError={rest.roleError}
        fieldErrors={rest.fieldErrors}
        disabled={pending}
        ids={ids}
        onChange={onChange}
      />

      <ToolsField values={values} error={toolsError} disabled={pending} onChange={onChange} />

      <div data-wf="06-5" className="prompt-field gap-1.5">
        <label htmlFor={ids.body} className="text-aux font-semibold text-text-secondary">
          {AGENT_BODY_LABEL}
        </label>
        <TextArea
          id={ids.body}
          fill
          value={values.body}
          disabled={pending}
          onChange={(event) => onChange({ body: event.target.value })}
        />
      </div>
    </>
  );
}
