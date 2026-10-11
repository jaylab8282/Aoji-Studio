/**
 * 06 폼의 앞쪽 입력 묶음 (`06-agent-form.html` `.grid2`): `이름 (name)` | `모델 (model)` / `소속 워크플로우` | `역할`, 그리고 전체 폭 `설명 (description)`.
 * 판정(모델 선택지, 팀장 비활성, 사전 검증)은 `lib/derive/agentForm.ts`가 하고 여기서는 그리기만 한다.
 */
import { useId } from "react";
import type { Workflow } from "../../api/types";
import { Field } from "../../components/ui/Field";
import { Radio } from "../../components/ui/Radio";
import { Select } from "../../components/ui/Select";
import { TextInput } from "../../components/ui/TextInput";
import { MODEL_CHOICES, agentNameRuleViolated, type AgentFormValues, type ModelChoice } from "../../lib/derive/agentForm";
import {
  AGENT_DESCRIPTION_LABEL,
  AGENT_MODEL_LABEL,
  AGENT_NAME_HINT,
  AGENT_NAME_LABEL,
  AGENT_NAME_RULE_MESSAGE,
  AGENT_ROLE_LABEL,
  AGENT_WORKFLOW_HINT,
  AGENT_WORKFLOW_LABEL,
  AGENT_WORKFLOW_NONE_OPTION,
  IMPORT_NO_WORKFLOW_NOTICE,
  MODEL_OPTION_TEXT,
  ROLE_OPTION_TEXT,
  leadExistsReason,
} from "../../lib/text";

interface AgentFormFieldsProps {
  values: AgentFormValues;
  /** `registry.workflows` 이름 목록(name 오름차순). */
  workflows: Workflow[];
  /** FR-011-AC3: 원래 워크플로우 밖 에이전트일 때만 `(없음)`을 고를 수 있다. */
  allowNoWorkflow: boolean;
  /** FR-010-AC4: 대상 워크플로우의 팀장 name(자기 자신이면 null). */
  leadTaken: string | null;
  /** 409 `LEAD_EXISTS` 사유(라디오 아래). */
  roleError: string | null;
  fieldErrors: Record<string, string>;
  disabled: boolean;
  ids: { name: string; model: string; customModel: string; workflow: string; description: string };
  onChange: (patch: Partial<AgentFormValues>) => void;
}

export function AgentFormFields({
  values,
  workflows,
  allowNoWorkflow,
  leadTaken,
  roleError,
  fieldErrors,
  disabled,
  ids,
  onChange,
}: AgentFormFieldsProps) {
  const leadReasonId = useId();
  const roleDisabled = disabled || values.workflow === null;
  /** 워크플로우 0개 + `(없음)` 불가 → 드롭다운 대신 안내만 둔다(ui-spec.md SCR-06 소속 행 `빈` 열). */
  const workflowPickerMissing = workflows.length === 0 && !allowNoWorkflow;
  const leadBlocked = leadTaken !== null && values.workflow !== null;

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div data-wf="06-2" className="min-w-0">
          <Field
            label={AGENT_NAME_LABEL}
            htmlFor={ids.name}
            required
            hint={AGENT_NAME_HINT}
            error={fieldErrors.name ?? (agentNameRuleViolated(values.name) ? AGENT_NAME_RULE_MESSAGE : undefined)}
          >
            <TextInput
              id={ids.name}
              mono
              value={values.name}
              disabled={disabled}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </Field>
        </div>

        <Field label={AGENT_MODEL_LABEL} htmlFor={ids.model} error={fieldErrors.model}>
          <Select
            id={ids.model}
            value={values.modelChoice}
            disabled={disabled}
            onChange={(event) => onChange({ modelChoice: event.target.value as ModelChoice })}
          >
            {MODEL_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {MODEL_OPTION_TEXT[choice]}
              </option>
            ))}
          </Select>
          {values.modelChoice === "custom" ? (
            <TextInput
              id={ids.customModel}
              mono
              aria-label={MODEL_OPTION_TEXT.custom}
              value={values.customModel}
              disabled={disabled}
              onChange={(event) => onChange({ customModel: event.target.value })}
            />
          ) : null}
        </Field>

        <div data-wf="06-3" className="min-w-0">
          <Field
            label={AGENT_WORKFLOW_LABEL}
            htmlFor={workflowPickerMissing ? undefined : ids.workflow}
            required
            hint={AGENT_WORKFLOW_HINT}
            error={fieldErrors.workflow}
          >
            {workflowPickerMissing ? (
              <span className="text-body text-text-secondary">{IMPORT_NO_WORKFLOW_NOTICE}</span>
            ) : (
              <Select
                id={ids.workflow}
                value={values.workflow ?? ""}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.target.value === "" ? null : event.target.value;
                  onChange({ workflow: next, role: next === null ? null : (values.role ?? "member") });
                }}
              >
                {values.workflow === null || allowNoWorkflow ? (
                  <option value="">{allowNoWorkflow ? AGENT_WORKFLOW_NONE_OPTION : ""}</option>
                ) : null}
                {workflows.map((workflow) => (
                  <option key={workflow.name} value={workflow.name}>
                    {workflow.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label={AGENT_ROLE_LABEL} error={roleError ?? undefined}>
          <div role="radiogroup" aria-label={AGENT_ROLE_LABEL} className="flex flex-wrap items-center gap-4">
            <Radio
              name={AGENT_ROLE_LABEL}
              label={ROLE_OPTION_TEXT.lead}
              checked={values.role === "lead"}
              disabled={roleDisabled || leadBlocked}
              aria-describedby={leadBlocked ? leadReasonId : undefined}
              onChange={() => onChange({ role: "lead" })}
            />
            <Radio
              name={AGENT_ROLE_LABEL}
              label={ROLE_OPTION_TEXT.member}
              checked={values.role === "member"}
              disabled={roleDisabled}
              onChange={() => onChange({ role: "member" })}
            />
          </div>
          {leadBlocked ? (
            <span id={leadReasonId} className="text-aux text-text-muted">
              {leadExistsReason(leadTaken)}
            </span>
          ) : null}
        </Field>
      </div>

      <Field label={AGENT_DESCRIPTION_LABEL} htmlFor={ids.description} required error={fieldErrors.description}>
        <TextInput
          id={ids.description}
          value={values.description}
          disabled={disabled}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>
    </>
  );
}
