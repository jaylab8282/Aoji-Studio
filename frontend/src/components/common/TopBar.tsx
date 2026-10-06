/**
 * ui-spec.md §공통 TopBar(`<화면>-1`): 높이 56, `bg-chrome`, 아래 `border-border`, 좌우 `px-gutter`, 간격 12.
 * 왼쪽 제목(`font/section` 700) 또는 03 브레드크럼, 01·02만 프로젝트 경로 칩, 오른쪽 끝 `127.0.0.1 전용`.
 * 02의 주 동작 `Claude 열기 · 기본 세션`(`rightExtra`)은 `127.0.0.1 전용` 왼쪽에 둔다(화면 원본 `02-1`).
 * 프로젝트 칩은 01·02에만 그린다(ADR-30). `TopBar`는 라우트를 직접 읽지 않고 화면이 `showProjectChip`·`wf`로
 * 넘긴 설정만 본다(공통 셸이 화면 규칙을 알지 않게 한다, conventions.md §7 MUST).
 * 제목이 문자열이면 `<h1>`, 03 브레드크럼처럼 노드면 그대로 둔다.
 */
import type { ReactNode } from "react";
import { useSnapshotStore } from "../../state/snapshotStore";
import { Skeleton } from "../ui/Skeleton";
import { LOCAL_ONLY_TEXT, PROJECT_CHIP_PREFIX } from "../../lib/text";

interface TopBarProps {
  breadcrumb: ReactNode;
  rightExtra?: ReactNode;
  /** 프로젝트 칩 표시 여부. 화면(라우트 handle)이 넘긴다. 기본값은 미표시(ADR-30). */
  showProjectChip?: boolean;
  /** 화면 원본의 `data-wf` 영역 이름(`01-1`·`02-1`·`03-1`·`07-1`). 라우트 handle이 넘긴다. */
  wf?: string;
}

export function TopBar({ breadcrumb, rightExtra, showProjectChip = false, wf }: TopBarProps) {
  return (
    <header
      data-wf={wf}
      className="flex h-header min-w-0 shrink-0 items-center gap-3 border-b border-border bg-chrome px-gutter"
    >
      {typeof breadcrumb === "string" ? (
        <h1 className="text-section font-bold tracking-title whitespace-nowrap text-text">{breadcrumb}</h1>
      ) : (
        breadcrumb
      )}
      {showProjectChip ? <ProjectChip /> : null}
      <span className="flex-1" />
      {rightExtra}
      <span className="font-mono text-aux whitespace-nowrap text-text-faint">{LOCAL_ONLY_TEXT}</span>
    </header>
  );
}

const CHIP_CLASSES =
  "block h-chip min-w-0 overflow-hidden rounded-chip bg-selected px-2 font-mono text-aux leading-6 text-ellipsis whitespace-nowrap text-text-mono";

// 본문 밖이라 AppShell 공통 스켈레톤이 덮지 않는다 → 칩 안에 자체 스켈레톤(220×10)을 둔다(ui-spec §공통 로딩 예외, ADR-32).
function ProjectChip() {
  const { ready, config } = useSnapshotStore();

  if (!ready || config === null) {
    return (
      <div className={CHIP_CLASSES}>
        <Skeleton className="h-2.5 w-55" aria-label="프로젝트 칩 로딩 중" />
      </div>
    );
  }

  const text = `${PROJECT_CHIP_PREFIX}${config.hostPath}`;
  return (
    <div className={CHIP_CLASSES} title={config.hostPath} data-clamp>
      {text}
    </div>
  );
}
