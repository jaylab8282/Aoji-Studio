/**
 * 공용 폼 필드 껍데기(라벨 + 입력 + 힌트/에러). 05·06 팝업에서 재사용한다.
 * conventions.md §4: 필드 에러는 필드 아래에 표시한다.
 */
import type { ReactNode } from "react";
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

export function Field({ label, htmlFor, hint, error, required = false, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-aux text-text-secondary">
          {label}
        </label>
        {required ? <span className="text-aux text-text-faint">{REQUIRED_MARK_TEXT}</span> : null}
      </div>
      {children}
      {error ? (
        <span className="text-aux text-danger">{error}</span>
      ) : hint ? (
        <span className="text-aux text-text-faint">{hint}</span>
      ) : null}
    </div>
  );
}
