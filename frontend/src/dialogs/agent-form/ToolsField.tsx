/**
 * 06 폼 `사용 도구 (tools)` 상자 (`06-agent-form.html` `.tools`, FR-010-AC2): `전체 상속` / `직접 선택` 라디오 +
 * 5열 체크박스(Read Grep Glob Edit Write / Bash WebFetch WebSearch Agent `기타`) + `기타 도구` 입력.
 * 만들기 기본값은 라디오 미선택이라 `저장`이 비활성이고 이유 줄 `도구 방식을 고르세요`가 붙는다(ADR-35).
 * 체크박스·입력은 `직접 선택`일 때만 활성이고, `기타` 입력은 `기타`를 켰을 때만 활성이다.
 */
import { Checkbox } from "../../components/ui/Checkbox";
import { Radio } from "../../components/ui/Radio";
import { TextInput } from "../../components/ui/TextInput";
import { TOOL_CHECKBOXES, type AgentFormValues } from "../../lib/derive/agentForm";
import {
  AGENT_TOOLS_LABEL,
  AGENT_TOOLS_OTHER_INPUT_LABEL,
  AGENT_TOOLS_OTHER_LABEL,
  AGENT_TOOLS_OTHER_PLACEHOLDER,
  TOOLS_MODE_EXPLICIT_TEXT,
  TOOLS_MODE_INHERIT_TEXT,
} from "../../lib/text";

interface ToolsFieldProps {
  values: AgentFormValues;
  /** 서버 `fields.tools` 또는 사전 검증(`직접 선택은 1개 이상`). */
  error?: string;
  disabled: boolean;
  onChange: (patch: Partial<AgentFormValues>) => void;
}

export function ToolsField({ values, error, disabled, onChange }: ToolsFieldProps) {
  const explicit = values.toolsMode === "explicit";

  function toggleTool(tool: string) {
    onChange({
      checkedTools: values.checkedTools.includes(tool)
        ? values.checkedTools.filter((each) => each !== tool)
        : [...values.checkedTools, tool],
    });
  }

  return (
    <div
      data-wf="06-4"
      role="group"
      aria-label={AGENT_TOOLS_LABEL}
      className="grid gap-2 rounded-card border border-border bg-inset p-3"
    >
      <span className="text-aux font-semibold text-text-secondary">{AGENT_TOOLS_LABEL}</span>
      <div role="radiogroup" aria-label={AGENT_TOOLS_LABEL} className="flex items-center gap-4">
        <Radio
          name={AGENT_TOOLS_LABEL}
          label={TOOLS_MODE_INHERIT_TEXT}
          checked={values.toolsMode === "inherit"}
          disabled={disabled}
          onChange={() => onChange({ toolsMode: "inherit" })}
        />
        <Radio
          name={AGENT_TOOLS_LABEL}
          label={TOOLS_MODE_EXPLICIT_TEXT}
          checked={explicit}
          disabled={disabled}
          onChange={() => onChange({ toolsMode: "explicit" })}
        />
      </div>

      <div className="grid grid-cols-5 gap-x-2 font-mono text-aux text-text-mono">
        {TOOL_CHECKBOXES.map((tool) => (
          <Checkbox
            dense
            key={tool}
            label={tool}
            checked={values.checkedTools.includes(tool)}
            disabled={disabled || !explicit}
            onChange={() => toggleTool(tool)}
          />
        ))}
        <span className="font-sans text-text-secondary">
          <Checkbox
            dense
            label={AGENT_TOOLS_OTHER_LABEL}
            checked={values.otherChecked}
            disabled={disabled || !explicit}
            onChange={() => onChange({ otherChecked: !values.otherChecked })}
          />
        </span>
      </div>

      <TextInput
        aria-label={AGENT_TOOLS_OTHER_INPUT_LABEL}
        placeholder={AGENT_TOOLS_OTHER_PLACEHOLDER}
        mono
        value={values.otherTools}
        disabled={disabled || !explicit || !values.otherChecked}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange({ otherTools: event.target.value })}
      />
      {error ? (
        <span role="alert" className="text-aux font-semibold text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
