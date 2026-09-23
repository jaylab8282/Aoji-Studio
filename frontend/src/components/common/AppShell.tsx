/**
 * ui-spec.md §공통 AppShell: 사이드바 248px + 상단바 64px + 본문.
 * FR-005-AC9 / SCR-04-2: 첫 `snapshot`(`snapshotStore.ready`) 전에는 본문을 스켈레톤으로 채우고
 * `0`이나 빈 문구를 먼저 보여주지 않는다. `DisconnectBanner`는 여기 한 곳에서만 렌더링한다(conventions.md §7).
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
  children: ReactNode;
}

export function AppShell({ breadcrumb, rightExtra, showProjectChip = false, children }: AppShellProps) {
  const { ready } = useSnapshotStore();

  return (
    <div className="flex min-h-screen bg-page text-text">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar breadcrumb={breadcrumb} rightExtra={rightExtra} showProjectChip={showProjectChip} />
        <DisconnectBanner />
        <main className="flex-1">{ready ? children : <AppShellSkeleton />}</main>
      </div>
    </div>
  );
}

function AppShellSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-page-x py-8" data-testid="app-shell-skeleton">
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
