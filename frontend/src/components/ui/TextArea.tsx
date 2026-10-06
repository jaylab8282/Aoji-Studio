/**
 * ui-spec.md §공통 TextArea (`_base.css:98-104`, 06 `지침`): `TextInput`과 같은 표면, 여러 줄. 기본은 고정폭 원문(`mono`).
 * 에러·초점 표현은 `TextInput`과 같다.
 */
import type { TextareaHTMLAttributes } from "react";

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  mono?: boolean;
}

export function TextArea({ mono = true, ...rest }: TextAreaProps) {
  return (
    <textarea
      {...rest}
      className={`w-full min-w-0 rounded-control border border-border-strong bg-soft px-3 py-2 text-body placeholder:text-text-muted aria-invalid:border-danger disabled:cursor-not-allowed disabled:text-text-muted ${
        mono ? "font-mono text-text-mono" : "text-text"
      }`}
    />
  );
}
