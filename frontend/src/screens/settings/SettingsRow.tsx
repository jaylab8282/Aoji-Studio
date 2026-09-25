/**
 * ui-spec.md SCR-07 값 행(왼쪽 라벨 + 오른쪽 값). 07의 값 행은 첫 스냅샷이 아니라 자체 호출
 * (`GET /api/settings`)로 채워지므로 공통 스켈레톤이 아니라 행마다 자체 스켈레톤을 쓴다
 * (ui-spec §공통 상태 표현 `로딩` 예외 목록, ADR-32). 로딩 중에는 값 자리에 `0`이나 빈 문구를
 * 먼저 보여주지 않는다(ui-rules 5).
 */
import type { ReactNode } from "react";
import { Skeleton } from "../../components/ui/Skeleton";

interface SettingsRowProps {
  label: string;
  /** 값이 여러 조각(경로 mono + 설명)으로 나뉘는 행을 테스트가 한 덩어리로 읽기 위한 표식. */
  testId: string;
  /** true면 값 자리를 스켈레톤으로 대신한다. */
  loading?: boolean;
  /** 값 아래 보조 설명(07 `팀장으로 열기` 힌트). */
  hint?: string;
  children?: ReactNode;
}

export function SettingsRow({ label, testId, loading = false, hint, children }: SettingsRowProps) {
  return (
    <div className="flex items-start gap-4 text-body" data-testid={testId}>
      <span className="w-32 shrink-0 text-text-muted">{label}</span>
      <div className="flex min-w-0 flex-col gap-1">
        {loading ? (
          <Skeleton className="h-4 w-64" aria-label={`${label} 로딩 중`} />
        ) : (
          <span className="text-text-secondary">{children}</span>
        )}
        {hint === undefined ? null : <span className="text-aux text-text-faint">{hint}</span>}
      </div>
    </div>
  );
}
