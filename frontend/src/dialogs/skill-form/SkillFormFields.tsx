/**
 * 08-1 폼 스크롤 영역 (`08-1-skill-form.html` `.scrollf`): 이름 | 호출 방식 → 설명 → 본문(남는 높이).
 * 만들기는 `이름` 입력 + 안내 두 줄(FR-020-AC1), 수정은 `bg-inset` 고정 글자 + 안내(FR-020-AC3). 판정은 `lib/derive/skillForm.ts`가 한다.
 */
import { Checkbox } from "../../components/ui/Checkbox";
import { Field } from "../../components/ui/Field";
import { MonoText } from "../../components/ui/MonoText";
import { TextArea } from "../../components/ui/TextArea";
import { TextInput } from "../../components/ui/TextInput";
import { Skeleton } from "../../components/ui/Skeleton";
import { skillNameRuleViolated, type SkillFormValues } from "../../lib/derive/skillForm";
import {
  SKILL_BODY_LABEL,
  SKILL_DESCRIPTION_HINT,
  SKILL_DESCRIPTION_LABEL,
  SKILL_INVOKE_LABEL,
  SKILL_NAME_FIXED_HINT,
  SKILL_NAME_HINT_PREFIXES,
  SKILL_NAME_HINT_PREFIX_LEAD,
  SKILL_NAME_HINT_RULE,
  SKILL_NAME_LABEL,
  SKILL_NAME_RULE_MESSAGE,
  SKILL_USER_ONLY_HINT_LEAD,
  SKILL_USER_ONLY_HINT_SLASH,
  SKILL_USER_ONLY_HINT_TAIL,
  SKILL_USER_ONLY_KEY,
  SKILL_USER_ONLY_LABEL,
} from "../../lib/text";

interface SkillFormFieldsProps {
  mode: "create" | "edit";
  values: SkillFormValues;
  /** 수정: 파일을 읽는 동안 필드 스켈레톤(ui-spec SCR-08-1 제목 행 `로딩`). */
  loading: boolean;
  /** 저장 중에는 입력을 잠근다. */
  disabled: boolean;
  fieldErrors: Record<string, string>;
  ids: { name: string; description: string; body: string };
  onChange: (patch: Partial<SkillFormValues>) => void;
}

export function SkillFormFields({ mode, values, loading, disabled, fieldErrors, ids, onChange }: SkillFormFieldsProps) {
  const locked = disabled || loading;
  const nameError = fieldErrors.name ?? (skillNameRuleViolated(values.name) ? SKILL_NAME_RULE_MESSAGE : undefined);

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div data-wf="08-1-2" className="grid min-w-0 content-start gap-1.5">
          {mode === "create" ? (
            <>
              <Field
                label={SKILL_NAME_LABEL}
                htmlFor={ids.name}
                required
                hint={SKILL_NAME_HINT_RULE}
                error={nameError}
              >
                <TextInput
                  id={ids.name}
                  mono
                  value={values.name}
                  disabled={locked}
                  onChange={(event) => onChange({ name: event.target.value })}
                />
              </Field>
              <span className="text-aux text-text-muted">
                {SKILL_NAME_HINT_PREFIX_LEAD}
                {SKILL_NAME_HINT_PREFIXES.map((prefix, index) => (
                  <span key={prefix}>
                    {index === 0 ? null : ", "}
                    <MonoText>{prefix}</MonoText>
                  </span>
                ))}
              </span>
            </>
          ) : (
            <Field label={SKILL_NAME_LABEL} hint={SKILL_NAME_FIXED_HINT}>
              {loading ? (
                <Skeleton className="h-control w-full" decorative />
              ) : (
                <div className="flex min-h-control items-center rounded-control bg-inset px-3 font-mono text-text-mono">
                  {values.name}
                </div>
              )}
            </Field>
          )}
        </div>

        <div data-wf="08-1-4" className="min-w-0">
          <Field label={SKILL_INVOKE_LABEL}>
            <span className="flex min-h-control items-center gap-2">
              <Checkbox
                label={SKILL_USER_ONLY_LABEL}
                checked={values.userOnly}
                disabled={locked}
                onChange={(event) => onChange({ userOnly: event.target.checked })}
              />
              <MonoText className="text-text-muted">{SKILL_USER_ONLY_KEY}</MonoText>
            </span>
            <span className="text-aux text-text-muted">
              {SKILL_USER_ONLY_HINT_LEAD}
              <MonoText>{SKILL_USER_ONLY_HINT_SLASH}</MonoText>
              {SKILL_USER_ONLY_HINT_TAIL}
            </span>
          </Field>
        </div>
      </div>

      <div data-wf="08-1-3">
        <Field
          label={SKILL_DESCRIPTION_LABEL}
          htmlFor={ids.description}
          required
          hint={SKILL_DESCRIPTION_HINT}
          error={fieldErrors.description}
        >
          {loading ? (
            <Skeleton className="h-control w-full" decorative />
          ) : (
            <TextInput
              id={ids.description}
              value={values.description}
              disabled={locked}
              onChange={(event) => onChange({ description: event.target.value })}
            />
          )}
        </Field>
      </div>

      <div data-wf="08-1-5" className="skill-body-field gap-1.5">
        <label htmlFor={ids.body} className="text-aux font-semibold text-text-secondary">
          {SKILL_BODY_LABEL}
        </label>
        {loading ? (
          <Skeleton className="h-full min-h-24 w-full flex-1" decorative />
        ) : (
          <TextArea
            id={ids.body}
            fill
            value={values.body}
            disabled={locked}
            onChange={(event) => onChange({ body: event.target.value })}
          />
        )}
      </div>
    </>
  );
}
