/**
 * 공용 폼 필드 껍데기(라벨 + 입력 + 힌트/에러). 05·06 팝업에서 재사용한다.
 * conventions.md §4: 필드 에러는 필드 아래에 표시한다.
 */
import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-aux text-text-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-aux text-danger">{error}</span>
      ) : hint ? (
        <span className="text-aux text-text-faint">{hint}</span>
      ) : null}
    </div>
  );
}
