/**
 * ui-spec.md §공통 TextInput (`_base.css:98-104`): 높이 34, `bg-soft`·`border-strong`·`rounded-control`, placeholder `text-muted`,
 * 키보드 초점 링은 `styles/base.css` `:focus-visible`(ADR-69). 에러는 `aria-invalid`일 때 테두리 `danger`(`Field`가 속성을 넣는다).
 * 입력은 클릭 동작이 없어 hover 표현을 주지 않는다. `mono`는 값이 경로·이름일 때 고정폭.
 */
import type { InputHTMLAttributes } from "react";

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  mono?: boolean;
}

export function TextInput({ mono = false, ...rest }: TextInputProps) {
  return (
    <input
      type="text"
      {...rest}
      className={`min-h-control w-full min-w-0 rounded-control border border-border-strong bg-soft px-3 text-body placeholder:text-text-muted aria-invalid:border-danger disabled:cursor-not-allowed disabled:text-text-muted ${
        mono ? "font-mono text-text-mono" : "text-text"
      }`}
    />
  );
}
