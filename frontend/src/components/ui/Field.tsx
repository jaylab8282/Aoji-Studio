/**
 * ui-spec.md §공통 Field (라벨 + 입력 + 도움말/에러, `_base.css:105-109,185`).
 * 라벨 aux 600 `text-secondary`(필수 표시 muted 400). 에러: 입력에 `aria-invalid` + `aria-describedby`(에러·도움말 id),
 * 아래 `help.err`(`danger` 600, `role="alert"`), 그 아래 도움말은 그대로 둔다(conventions.md §4).
 * 입력 요소(`TextInput`·`Select`·`TextArea`…)가 단일 자식이면 Field가 두 속성을 넣어 준다. 자식이 여러 개(역할 라디오 줄 등)이면
 * 그룹이라 호출부가 연결하고, Field는 에러 줄만 그린다.
 */
import { Children, cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";
import { REQUIRED_MARK_TEXT } from "../../lib/text";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  /** 06 폼의 `필수` 표시(와이어프레임 p.7). 라벨 밖에 두어 접근성 이름은 라벨 글자 그대로 유지한다. */
  required?: boolean;
  children: ReactNode;
}

interface DescribableProps {
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}

export function Field({ label, htmlFor, hint, error, required = false, children }: FieldProps) {
  const errorId = useId();
  const hintId = useId();
  const describedBy = [error ? errorId : undefined, hint ? hintId : undefined].filter(Boolean).join(" ");

  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  const content =
    isValidElement(only) && typeof only.type !== "string" && (error !== undefined || hint !== undefined)
      ? cloneElement(only as ReactElement<DescribableProps>, {
          ...(error ? { "aria-invalid": true } : {}),
          ...(describedBy === "" ? {} : { "aria-describedby": describedBy }),
        })
      : children;

  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-aux font-semibold text-text-secondary">
          {label}
        </label>
        {required ? <span className="text-aux font-normal text-text-muted">{REQUIRED_MARK_TEXT}</span> : null}
      </div>
      {content}
      {error ? (
        <span id={errorId} role="alert" className="text-aux font-semibold text-danger">
          {error}
        </span>
      ) : null}
      {hint ? (
        <span id={hintId} className="text-aux text-text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
