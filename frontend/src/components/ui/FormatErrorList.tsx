/**
 * ui-spec.md SCR-04-6 정의·구성 파일 형식 오류 카드 (02 캔버스 맨 위, `04-6-1`). `registry.formatErrors.length > 0`일 때만 그린다.
 * FR-002-AC2·AC3·AC5·AC6, FR-006-E2.
 * 카드(`border-danger-border`, `role="alert"`) 머리 `file-warning` + `읽지 못한 정의·구성 파일 N개`(`danger` 13px 600) + 보조 줄(말줄임),
 * 아래 두 열 표(파일 280 고정폭 `font-mono` / 사유)이고 5줄 넘으면 카드 안에서 스크롤한다(최대 190). 줌 대상이 아니다.
 * 파일·사유 글자는 서버 `FormatError.file`·`message` 그대로다(api-spec 5종 + 구성 파일 형식 오류 + 참조 깨짐).
 * `tabIndex={-1}`: 06이 형식 오류 파일 수정을 거부당했을 때(FR-002-AC3) 이 카드로 스크롤하고 초점을 준다(`screenSignals`).
 */
import type { FormatError } from "../../api/types";
import { Icon } from "./Icon";
import { FORMAT_ERROR_NOTE, formatErrorListTitle } from "../../lib/text";

/** 06이 형식 오류 파일 수정을 거부당했을 때 이 목록으로 스크롤·초점을 주기 위한 앵커(FR-011-E3). */
export const FORMAT_ERROR_LIST_ELEMENT_ID = "format-error-list";

export function FormatErrorList({ formatErrors }: { formatErrors: FormatError[] }) {
  if (formatErrors.length === 0) return null;

  return (
    <section
      id={FORMAT_ERROR_LIST_ELEMENT_ID}
      role="alert"
      data-wf="04-6-1"
      tabIndex={-1}
      className="grid w-full min-w-0 gap-2 rounded-card border border-danger-border bg-card px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <Icon name="file-warning" className="text-danger" />
        <h2 className="text-body font-semibold text-danger">{formatErrorListTitle(formatErrors.length)}</h2>
        <span className="min-w-0 truncate text-aux text-text-muted" title={FORMAT_ERROR_NOTE}>
          {FORMAT_ERROR_NOTE}
        </span>
      </div>
      <div data-testid="format-error-table" className="max-h-invalid-max min-h-0 overflow-auto">
        <table className="w-full table-fixed border-collapse">
          <tbody>
            {formatErrors.map((error, index) => (
              <tr key={`${error.kind}-${error.file}-${index}`} className="border-b border-border last:border-b-0">
                <td className="w-invalid-file overflow-hidden px-2 py-1.5 font-mono text-text-mono text-ellipsis whitespace-nowrap" title={error.file}>
                  {error.file}
                </td>
                <td className="px-2 py-1.5 break-words text-text-secondary">{error.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
