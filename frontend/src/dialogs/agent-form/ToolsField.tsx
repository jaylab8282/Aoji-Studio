/**
 * 06 폼 `사용 도구 (tools)` (FR-010-AC2): `전체 상속` / `직접 선택` 라디오 + 체크박스 9종 + `기타` 입력.
 * 만들기 기본값은 미선택이라 `저장`이 비활성이고 이유 줄 `도구 방식을 고르세요`가 붙는다(ADR-35).
 * 목록 상수·쉼표 분리는 `lib/derive/agentForm.ts`가 갖는다.
 */
import { Field } from "../../components/ui/Field";
import { TextInput } from "../../components/ui/TextInput";
import { TOOL_CHECKBOXES, type AgentFormValues } from "../../lib/derive/agentForm";
import {
  AGENT_TOOLS_LABEL,
  AGENT_TOOLS_OTHER_LABEL,
  TOOLS_MODE_EXPLICIT_TEXT,
  TOOLS_MODE_INHERIT_TEXT,
} from "../../lib/text";
import { RadioOption } from "./RadioOption";

interface ToolsFieldProps {
  values: AgentFormValues;
  /** 서버 `fields.tools` 또는 사전 검증(`직접 선택은 1개 이상`). */
  error?: string;
  disabled: boolean;
  otherInputId: string;
  onChange: (patch: Partial<AgentFormValues>) => void;
}

export function ToolsField({ values, error, disabled, otherInputId, onChange }: ToolsFieldProps) {
  const explicit = values.toolsMode === "explicit";

  function toggleTool(tool: string) {
    onChange({
      checkedTools: values.checkedTools.includes(tool)
        ? values.checkedTools.filter((each) => each !== tool)
        : [...values.checkedTools, tool],
    });
  }

  return (
    <Field label={AGENT_TOOLS_LABEL} error={error}>
      <div className="flex flex-col gap-3 rounded-control bg-inset px-3 py-3">
        <div className="flex items-center gap-4">
          <RadioOption
            name={AGENT_TOOLS_LABEL}
            label={TOOLS_MODE_INHERIT_TEXT}
            checked={values.toolsMode === "inherit"}
            disabled={disabled}
            onSelect={() => onChange({ toolsMode: "inherit" })}
          />
          <RadioOption
            name={AGENT_TOOLS_LABEL}
            label={TOOLS_MODE_EXPLICIT_TEXT}
            checked={explicit}
            disabled={disabled}
            onSelect={() => onChange({ toolsMode: "explicit" })}
          />
        </div>

        <div className="grid grid-cols-5 gap-2">
          {TOOL_CHECKBOXES.map((tool) => (
            <label
              key={tool}
              className={`inline-flex items-center gap-1.5 text-body ${explicit ? "text-text" : "text-text-faint"}`}
            >
              <input
                type="checkbox"
                checked={values.checkedTools.includes(tool)}
                disabled={disabled || !explicit}
                onChange={() => toggleTool(tool)}
              />
              {tool}
            </label>
          ))}
          <label
            className={`inline-flex items-center gap-1.5 text-body ${explicit ? "text-text" : "text-text-faint"}`}
            htmlFor={otherInputId}
          >
            {AGENT_TOOLS_OTHER_LABEL}
          </label>
        </div>

        <TextInput
          id={otherInputId}
          value={values.otherTools}
          disabled={disabled || !explicit}
          onChange={(event) => onChange({ otherTools: event.target.value })}
        />
      </div>
    </Field>
  );
}
