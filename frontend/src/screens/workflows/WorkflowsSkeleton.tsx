/**
 * ui-spec.md SCR-04-2 첫 로딩 — 02 (ADR-70). 첫 `snapshot` 전(`ready === false`)에 이 화면이 직접 그린다(라우트 `handle.ownLoading`).
 * 정적 글자(`AojiStudio`·`.claude`·수 라벨·버튼 글자·검색 placeholder·로비 제목·설명)와 검색 입력은 로딩 중에도 보이고,
 * 요약 수치·링크·범례·층 드롭다운·로비 칩·층 2개(헤더 줄 + 책상 칸 100×110)는 스켈레톤이다. 상태 색(범례·칩·요약)은 숨긴다.
 * 스냅샷 값(`writable`)을 쓰는 `에이전트 만들기`·`워크플로우 추가`는 값이 오기 전 비활성이고 이유 줄은 없다(ADR-44).
 * 줌 묶음은 활성(값을 쓰지 않는다), 미니맵은 없다. 영역 `aria-busy`, 스켈레톤은 `role=status`로 알린다.
 */
import type { RefObject } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { SearchInput } from "../../components/ui/SearchInput";
import { Skeleton } from "../../components/ui/Skeleton";
import {
  ADD_WORKFLOW_HEADER_BUTTON_LABEL,
  CREATE_AGENT_BUTTON_LABEL,
  FLOOR_CREATE_BUTTON_LABEL,
  FLOOR_IMPORT_BUTTON_LABEL,
  LOBBY_SUBTITLE,
  LOBBY_TITLE,
  SEARCH_PLACEHOLDER,
  SUMMARY_SEPARATOR,
  WORKFLOWS_SUMMARY_AGENT_LABEL,
  WORKFLOWS_SUMMARY_CLAUDE_LABEL,
  WORKFLOWS_SUMMARY_PROJECT_LABEL,
  WORKFLOWS_SUMMARY_SKILL_LABEL,
  WORKFLOWS_SUMMARY_WORKFLOW_LABEL,
} from "../../lib/text";
import { Canvas, ZoomSurface } from "./Canvas";
import { ZoomControls } from "./ZoomControls";

interface WorkflowsSkeletonProps {
  search: string;
  onSearchChange: (value: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}

function FloorSkeleton({ label }: { label: string }) {
  return (
    <section
      aria-label={label}
      className="floor-container overflow-hidden rounded-card border border-border bg-card"
    >
      <div className="grid gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-32" aria-label="층 이름 로딩 중" />
          <Skeleton className="h-chip w-10" aria-label="층 인원 로딩 중" />
          <span className="flex-1" />
          <Skeleton className="h-control w-16" aria-label="상세 로딩 중" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-control w-24" aria-label={`${FLOOR_IMPORT_BUTTON_LABEL} 로딩 중`} />
          <Skeleton className="h-control w-20" aria-label={`${FLOOR_CREATE_BUTTON_LABEL} 로딩 중`} />
        </div>
      </div>
      <div className="desk-grid gap-2 border-t border-border bg-inset px-4 pt-3 pb-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} decorative className="h-27.5 w-desk" />
        ))}
      </div>
    </section>
  );
}

export function WorkflowsSkeleton({
  search,
  onSearchChange,
  scrollRef,
  contentRef,
  zoom,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onZoomFit,
}: WorkflowsSkeletonProps) {
  return (
    <div data-testid="workflows-skeleton" aria-busy="true" className="flex h-full min-h-0 flex-col gap-3 px-gutter pt-4">
      <div data-wf="02-2" className="flex min-w-0 flex-none items-center gap-3 whitespace-nowrap">
        <h2 className="text-section font-bold text-text">{WORKFLOWS_SUMMARY_PROJECT_LABEL}</h2>
        <span className="font-mono text-aux text-text-muted">{WORKFLOWS_SUMMARY_CLAUDE_LABEL}</span>
        <span aria-hidden="true" className="h-5 w-px flex-none bg-border" />
        <span className="flex items-center gap-1.5 text-text-secondary">
          <span>{WORKFLOWS_SUMMARY_AGENT_LABEL}</span>
          <Skeleton className="w-6" aria-label="에이전트 수 로딩 중" />
          <span aria-hidden="true" className="text-text-muted">
            {SUMMARY_SEPARATOR}
          </span>
          <span>{WORKFLOWS_SUMMARY_SKILL_LABEL}</span>
          <Skeleton className="w-6" aria-label="스킬 수 로딩 중" />
          <span aria-hidden="true" className="text-text-muted">
            {SUMMARY_SEPARATOR}
          </span>
          <span>{WORKFLOWS_SUMMARY_WORKFLOW_LABEL}</span>
          <Skeleton className="w-6" aria-label="워크플로우 수 로딩 중" />
        </span>
        <span className="flex-1" />
        <Skeleton className="h-4 w-52" aria-label="워크플로우 밖 에이전트 수 로딩 중" />
        <Button variant="add" disabled>
          <Icon name="plus" />
          {CREATE_AGENT_BUTTON_LABEL}
        </Button>
      </div>

      <div
        data-wf="02-3"
        className="flex flex-none items-center gap-3 whitespace-nowrap portrait:flex-col portrait:items-stretch"
      >
        <div className="flex flex-none items-center gap-4">
          <Skeleton className="h-4 w-16" aria-label="작업 중 수 로딩 중" />
          <Skeleton className="h-4 w-28" aria-label="권한·입력 대기 수 로딩 중" />
          <Skeleton className="h-4 w-16" aria-label="대기 수 로딩 중" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 portrait:justify-start">
          <div className="search-box">
            <SearchInput
              placeholder={SEARCH_PLACEHOLDER}
              aria-label={SEARCH_PLACEHOLDER}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
          <Skeleton className="h-control w-floor-select flex-none" aria-label="층 선택 로딩 중" />
          <Button variant="add" disabled>
            <Icon name="plus" />
            {ADD_WORKFLOW_HEADER_BUTTON_LABEL}
          </Button>
        </div>
      </div>

      <section
        aria-label="로비"
        data-wf="02-4"
        className="flex min-h-lobby min-w-0 flex-none items-center gap-3 rounded-card border border-border bg-card px-4 py-2"
      >
        <h2 className="flex-none text-body font-semibold whitespace-nowrap text-text">{LOBBY_TITLE}</h2>
        <span data-clamp className="min-w-0 truncate text-aux text-text-muted">{LOBBY_SUBTITLE}</span>
        <span aria-hidden="true" className="h-5 w-px flex-none bg-border" />
        <Skeleton className="h-chip w-28 flex-none" aria-label="로비 세션 로딩 중" />
        <Skeleton className="h-chip w-28 flex-none" aria-label="로비 세션 로딩 중" />
      </section>

      <Canvas
        scrollRef={scrollRef}
        zoom={zoom}
        floating={
          <ZoomControls
            canZoomIn={canZoomIn}
            canZoomOut={canZoomOut}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onZoomFit={onZoomFit}
          />
        }
      >
        <ZoomSurface zoom={zoom} contentRef={contentRef}>
          <div className="grid grid-cols-3 items-start gap-3 portrait:grid-cols-2">
            <FloorSkeleton label="층 로딩 중 1" />
            <FloorSkeleton label="층 로딩 중 2" />
          </div>
        </ZoomSurface>
      </Canvas>
    </div>
  );
}
