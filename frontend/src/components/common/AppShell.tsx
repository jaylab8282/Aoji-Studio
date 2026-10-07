/**
 * ui-spec.md §공통 AppShell: 그리드 `[사이드 탭 232 | 본문 열]`(`rail:` `[레일 64 | 본문 열]`), 높이 100vh.
 * 본문 열 = `TopBar` → `DisconnectBanner`(끊김 시) → 화면(본문). 04-3 띠는 여기서 한 번만 그린다(conventions.md §7).
 * FR-005-AC9 / SCR-04-2: 첫 `snapshot`(`snapshotStore.ready`) 전에는 본문을 스켈레톤으로 채우고
 * `0`이나 빈 문구를 먼저 보여주지 않는다.
 * 본문 스크롤: 이행 중인 화면(T-R3-13~T-R3-19가 화면별 스크롤로 바꾼다)은 본문 칸이 세로 스크롤을 맡는다.
 * 01은 `ownLoading`으로 자기 스켈레톤(04-2)을 그린다(T-R3-12).
 */
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { DisconnectBanner } from "./DisconnectBanner";
import { Skeleton } from "../ui/Skeleton";
import { useSnapshotStore } from "../../state/snapshotStore";

interface AppShellProps {
  breadcrumb: ReactNode;
  rightExtra?: ReactNode;
  /** 프로젝트 칩 표시 여부(01·02만 true). 라우트 handle에서 내려온다(ADR-30). */
  showProjectChip?: boolean;
  /** 상단 바 `data-wf` 영역 이름(`01-1` 등). 라우트 handle에서 내려온다. */
  topBarWf?: string;
  /** 화면이 첫 `snapshot` 전 스켈레톤(04-2)을 직접 그린다(01). true면 `ready` 전에도 화면을 그린다. 라우트 handle에서 내려온다. */
  ownLoading?: boolean;
  children: ReactNode;
}

export function AppShell({ breadcrumb, rightExtra, showProjectChip = false, topBarWf, ownLoading = false, children }: AppShellProps) {
  const { ready } = useSnapshotStore();

  return (
    <div className="app-grid bg-page text-text">
      <Sidebar />
      <div className="flex h-screen min-h-0 min-w-0 flex-col">
        <TopBar breadcrumb={breadcrumb} rightExtra={rightExtra} showProjectChip={showProjectChip} wf={topBarWf} />
        <DisconnectBanner />
        <main className="min-h-0 flex-1 overflow-y-auto">{ready || ownLoading ? children : <AppShellSkeleton />}</main>
      </div>
    </div>
  );
}

function AppShellSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-gutter py-8" data-testid="app-shell-skeleton">
      <Skeleton className="h-8 w-64" aria-label="제목 로딩 중" />
      <div className="grid grid-cols-4 gap-4">
        <Skeleton className="h-24" aria-label="KPI 1 로딩 중" />
        <Skeleton className="h-24" aria-label="KPI 2 로딩 중" />
        <Skeleton className="h-24" aria-label="KPI 3 로딩 중" />
        <Skeleton className="h-24" aria-label="KPI 4 로딩 중" />
      </div>
      <Skeleton className="h-40" aria-label="본문 로딩 중" />
    </div>
  );
}
