/**
 * ui-spec.md §공통 TopBar(64px): 왼쪽 브레드크럼/제목 + 프로젝트 칩, 오른쪽 "127.0.0.1 전용".
 * 화면별 추가 버튼(예: 02 "Claude 열기")은 `rightExtra`로 받는다.
 */
import type { ReactNode } from "react";
import { useSnapshotStore } from "../../state/snapshotStore";
import { Chip } from "../ui/Chip";
import { Skeleton } from "../ui/Skeleton";
import { LOCAL_ONLY_TEXT, PROJECT_CHIP_PREFIX } from "../../lib/text";

interface TopBarProps {
  breadcrumb: ReactNode;
  rightExtra?: ReactNode;
}

export function TopBar({ breadcrumb, rightExtra }: TopBarProps) {
  const { ready, config } = useSnapshotStore();

  return (
    <header className="h-header shrink-0 flex items-center justify-between border-b border-border bg-chrome px-page-x">
      <div className="flex items-center gap-3">
        <span className="text-section font-semibold text-text">{breadcrumb}</span>
        {!ready || config === null ? (
          <Skeleton className="h-5 w-40" aria-label="프로젝트 칩 로딩 중" />
        ) : (
          <Chip tone="running" mono>
            <span aria-hidden="true">●</span>
            {PROJECT_CHIP_PREFIX}
            {config.hostPath}
          </Chip>
        )}
      </div>
      <div className="flex items-center gap-3">
        {rightExtra}
        <span className="text-aux text-text-faint">{LOCAL_ONLY_TEXT}</span>
      </div>
    </header>
  );
}
