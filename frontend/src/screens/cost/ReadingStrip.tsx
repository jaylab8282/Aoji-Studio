/**
 * ui-spec SCR-10 대화 기록 띠(`10-3`, `role=status`, `aria-label` `대화 기록 읽기 상태`, FR-025-AC6·E1·E2).
 * 정상: 점(중립) + `대화 기록` + 경로 + `읽은 파일 N / 전체`(고정폭) + 진행 막대 + `새 기록은 10초 안에 반영` + 오른쪽 `건너뛴 파일 N개`(0이면 없음).
 * 연결 안 됨(`connected === false`): 빨강 `대화 기록 · 연결 안 됨` + 안내 + `설정 열기`(→ `/settings`). 첫 응답 전에는 상태 글자가 스켈레톤이다.
 */
import { useNavigate } from "react-router-dom";
import type { TranscriptStatus } from "../../api/types";
import { ProgressBar } from "../../components/data/ProgressBar";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { MonoText } from "../../components/ui/MonoText";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatusDot } from "../../components/ui/StatusDot";
import { commaText } from "../../lib/derive/usageFormat";
import {
  COST_SKIPPED_LEAD,
  COST_SKIPPED_TAIL,
  COST_STRIP_DISCONNECTED_BODY,
  COST_STRIP_LABEL,
  COST_STRIP_NAME,
  COST_STRIP_NAME_DISCONNECTED,
  COST_STRIP_NOTE,
  COST_STRIP_PATH,
  COST_STRIP_PROGRESS_LABEL,
  COST_STRIP_READ_LEAD,
  OPEN_SETTINGS_BUTTON_LABEL,
} from "../../lib/text";

interface ReadingStripProps {
  /** `signal.transcripts`가 있으면 그것, 없으면 `cost.transcripts`. 둘 다 없으면 null(첫 조회 전). */
  transcripts: TranscriptStatus | null;
}

const STRIP_CLASSES = "flex min-w-0 items-center gap-3 rounded-card border border-border bg-card px-4 py-2 whitespace-nowrap";

export function ReadingStrip({ transcripts }: ReadingStripProps) {
  const navigate = useNavigate();

  if (transcripts !== null && !transcripts.connected) {
    return (
      <section role="alert" aria-label={COST_STRIP_LABEL} data-wf="10-3" className={`${STRIP_CLASSES} col-span-full`}>
        <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-danger">
          <StatusDot status="danger" />
          {COST_STRIP_NAME_DISCONNECTED}
        </span>
        <MonoText>{COST_STRIP_PATH}</MonoText>
        <span className="min-w-0 truncate text-text-muted">{COST_STRIP_DISCONNECTED_BODY}</span>
        <span className="flex-1" />
        <Button variant="secondary" onClick={() => navigate("/settings")}>
          <Icon name="settings" />
          {OPEN_SETTINGS_BUTTON_LABEL}
        </Button>
      </section>
    );
  }

  return (
    <section role="status" aria-label={COST_STRIP_LABEL} data-wf="10-3" className={`${STRIP_CLASSES} col-span-full`}>
      <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-text-muted">
        <StatusDot status="idle" />
        {COST_STRIP_NAME}
      </span>
      <MonoText>{COST_STRIP_PATH}</MonoText>
      {transcripts === null ? (
        <>
          <Skeleton className="w-40" decorative />
          <Skeleton className="w-40" decorative />
        </>
      ) : (
        <>
          <span className="text-text-muted">
            {COST_STRIP_READ_LEAD}
            <span className="font-mono tabular-nums text-text-mono">
              {commaText(transcripts.readFiles)} / {commaText(transcripts.totalFiles)}
            </span>
          </span>
          <ProgressBar value={transcripts.readFiles} max={transcripts.totalFiles} label={COST_STRIP_PROGRESS_LABEL} />
        </>
      )}
      <span className="text-text-muted">{COST_STRIP_NOTE}</span>
      <span className="flex-1" />
      {transcripts !== null && transcripts.skippedFiles > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-text-secondary">
          <Icon name="file-warning" className="text-text-muted" />
          <span>
            {COST_SKIPPED_LEAD}
            <span className="font-mono tabular-nums text-text-mono">{commaText(transcripts.skippedFiles)}</span>
            {COST_SKIPPED_TAIL}
          </span>
        </span>
      ) : null}
    </section>
  );
}
