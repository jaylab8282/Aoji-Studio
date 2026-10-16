/**
 * 08-2 미리보기 (`08-2-skill-import.html` `.prev`, 영역 `08-2-3`): `스킬 이름`·`설명` + `파일 목록` 머리 + 보조 `파일 N개 · 풀면 <크기> · 스크립트 N개`
 * + 목록(경로 고정폭, `스크립트`·`실행 파일` 테두리 칩, 목록 안 스크롤). 고르기 전·거부는 값 자리가 `text-muted`로 비활성이고 목록 머리가 없다.
 * 올리는 동안은 스켈레톤이다.
 */
import type { SkillImportPreview as SkillImportPreviewData } from "../../api/types";
import { Chip } from "../../components/ui/Chip";
import { Skeleton } from "../../components/ui/Skeleton";
import { formatBytes } from "../../lib/format/bytes";
import {
  SKILL_IMPORT_CHIP_EXECUTABLE,
  SKILL_IMPORT_CHIP_SCRIPT,
  SKILL_IMPORT_FILES_TITLE,
  SKILL_IMPORT_PREVIEW_DESCRIPTION,
  SKILL_IMPORT_PREVIEW_LABEL,
  SKILL_IMPORT_PREVIEW_NAME,
  skillImportFilesSummary,
} from "../../lib/text";

const EMPTY_VALUE = "-";

interface SkillImportPreviewProps {
  preview: SkillImportPreviewData | null;
  loading: boolean;
}

export function SkillImportPreview({ preview, loading }: SkillImportPreviewProps) {
  return (
    <section
      data-wf="08-2-3"
      aria-label={SKILL_IMPORT_PREVIEW_LABEL}
      aria-busy={loading}
      className="grid content-start gap-3 rounded-card border border-border bg-card p-3"
    >
      <dl className="import-preview-dl">
        <dt className="text-text-muted">{SKILL_IMPORT_PREVIEW_NAME}</dt>
        <dd className="font-mono font-medium text-text">
          {loading ? (
            <Skeleton className="w-40" decorative />
          ) : preview === null ? (
            <span className="font-normal text-text-muted">{EMPTY_VALUE}</span>
          ) : (
            preview.name
          )}
        </dd>
        <dt className="text-text-muted">{SKILL_IMPORT_PREVIEW_DESCRIPTION}</dt>
        <dd className="text-text-secondary">
          {loading ? (
            <Skeleton className="w-full" decorative />
          ) : preview === null ? (
            <span className="text-text-muted">{EMPTY_VALUE}</span>
          ) : (
            preview.description
          )}
        </dd>
      </dl>
      {loading ? <Skeleton className="h-24 w-full" decorative /> : null}
      {preview === null ? null : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-body font-semibold text-text">{SKILL_IMPORT_FILES_TITLE}</h3>
            <span className="text-aux text-text-muted">
              {skillImportFilesSummary(preview.fileCount, formatBytes(preview.unpackedBytes), preview.scriptCount)}
            </span>
          </div>
          <ul className="alist-scroll grid font-mono text-aux text-text-mono">
            {preview.files.map((entry) => (
              <li key={entry.path} className="flex items-center gap-2 border-b border-border py-1.5 last:border-b-0">
                <span className="min-w-0 truncate" title={entry.path}>
                  {entry.path}
                </span>
                <span className="flex flex-none items-center gap-2 font-sans">
                  {entry.script ? <Chip tone="outline">{SKILL_IMPORT_CHIP_SCRIPT}</Chip> : null}
                  {entry.executable ? <Chip tone="outline">{SKILL_IMPORT_CHIP_EXECUTABLE}</Chip> : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
