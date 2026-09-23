/**
 * ui-spec.md §공통 TopBar(64px): 왼쪽 브레드크럼/제목 + 프로젝트 칩, 오른쪽 "127.0.0.1 전용".
 * 화면별 추가 버튼(예: 02 "Claude 열기")은 `rightExtra`로 받아 "127.0.0.1 전용" 오른쪽(맨 끝)에 둔다
 * (docs/ui/screens/02-workflows.png 상단바 순서).
 * 프로젝트 칩은 01·02에만 그린다(ADR-30). `TopBar`는 라우트를 직접 읽지 않고 화면이 `showProjectChip`으로
 * 넘긴 설정만 본다(공통 셸이 화면 규칙을 알지 않게 한다, conventions.md §7 MUST).
 */
import type { ReactNode } from "react";
import { useSnapshotStore } from "../../state/snapshotStore";
import { Chip } from "../ui/Chip";
import { Skeleton } from "../ui/Skeleton";
import { LOCAL_ONLY_TEXT, PROJECT_CHIP_PREFIX } from "../../lib/text";

interface TopBarProps {
  breadcrumb: ReactNode;
  rightExtra?: ReactNode;
  /** 프로젝트 칩 표시 여부. 화면(라우트 handle)이 넘긴다. 기본값은 미표시(ADR-30). */
  showProjectChip?: boolean;
}

export function TopBar({ breadcrumb, rightExtra, showProjectChip = false }: TopBarProps) {
  return (
    <header className="h-header shrink-0 flex items-center justify-between border-b border-border bg-chrome px-page-x">
      <div className="flex items-center gap-3">
        <span className="text-section font-semibold text-text">{breadcrumb}</span>
        {showProjectChip ? <ProjectChip /> : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-aux text-text-faint">{LOCAL_ONLY_TEXT}</span>
        {rightExtra}
      </div>
    </header>
  );
}

// 본문 밖이라 AppShell 공통 스켈레톤이 덮지 않는다 → 자체 스켈레톤을 갖는다(ui-spec §공통 로딩 예외, ADR-32).
function ProjectChip() {
  const { ready, config } = useSnapshotStore();

  if (!ready || config === null) {
    return <Skeleton className="h-5 w-40" aria-label="프로젝트 칩 로딩 중" />;
  }

  return (
    <Chip tone="running" mono>
      <span aria-hidden="true">●</span>
      {PROJECT_CHIP_PREFIX}
      {config.hostPath}
    </Chip>
  );
}
