/**
 * ui-spec.md SCR-04-6 정의 파일 형식 오류 (02 층 위). `registry.formatErrors.length > 0`일 때만 그린다.
 * FR-002-AC2·AC3·AC5·AC6, FR-006-E2.
 */
import type { FormatError } from "../../api/types";
import { MonoText } from "./MonoText";
import { FORMAT_ERROR_EDIT_LINK_LABEL, FORMAT_ERROR_FOOTNOTE, formatErrorListTitle } from "../../lib/text";

/** 06이 형식 오류 파일 수정을 거부당했을 때 이 목록으로 스크롤하기 위한 앵커(FR-011-E3). */
export const FORMAT_ERROR_LIST_ELEMENT_ID = "format-error-list";

export function FormatErrorList({ formatErrors }: { formatErrors: FormatError[] }) {
  if (formatErrors.length === 0) return null;

  return (
    <div id={FORMAT_ERROR_LIST_ELEMENT_ID} className="rounded-card border border-danger-border bg-danger-soft p-card flex flex-col gap-2">
      <p className="text-section font-semibold text-danger">{formatErrorListTitle(formatErrors.length)}</p>
      <ul className="flex flex-col gap-1">
        {formatErrors.map((error, index) => (
          <li key={`${error.kind}-${error.file}-${index}`} className="text-body text-text-secondary">
            <MonoText>{error.file}</MonoText> · {error.message}
          </li>
        ))}
      </ul>
      <p className="text-aux text-text-faint">{FORMAT_ERROR_FOOTNOTE}</p>
      <span className="text-aux text-link">{FORMAT_ERROR_EDIT_LINK_LABEL}</span>
    </div>
  );
}
