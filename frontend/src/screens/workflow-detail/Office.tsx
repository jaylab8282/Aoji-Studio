/**
 * ui-spec.md SCR-03 오피스 카드 (`03-3`): 머리 `오피스` + 설명 → 그리드(`bg-inset`, 안 여백 8, 간격 12) → 범례 `동작 매핑`(`03-7`).
 * FR-007-AC1~AC3. 열 수(칸 최소 184px, 최대 6열)·칸 높이 180은 `office-grid`(CSS)가 정한다.
 * 가로형은 그리드만 카드 안에서 스크롤하고, 세로형은 오피스가 줄 수만큼 늘며 화면 본문이 스크롤한다(ADR-66).
 *
 * 칸 배치는 `lib/derive/officeSeats.ts`(마지막 줄 `빈 자리`는 그리드 열 수로 채운다), 말풍선은 `actionLabel.ts`,
 * 04-4 표시 고정은 `collectorDown.ts`가 맡는다(conventions.md §3 MUST: 컴포넌트에서 집계·라벨 금지).
 * 04-4 띠는 상단 바 아래(`WorkflowDetailScreen`)에 나오고 이 카드 안에는 없다.
 */
import { useRef, type ReactNode } from "react";
import type { Live, Workflow } from "../../api/types";
import { Bubble } from "../../components/pixel/Bubble";
import { Skeleton } from "../../components/ui/Skeleton";
import { officeSeats } from "../../lib/derive/officeSeats";
import {
  OFFICE_LEGEND_ITEMS,
  OFFICE_LEGEND_SUBAGENT,
  OFFICE_LEGEND_TITLE,
  OFFICE_SUBTITLE,
  OFFICE_TITLE,
} from "../../lib/text";
import { OfficeCell } from "./OfficeCell";
import { useGridColumns } from "./useGridColumns";

const GRID_CLASSES =
  "office-grid min-h-0 flex-1 content-start overflow-auto rounded-card bg-inset p-2 portrait:flex-none portrait:overflow-visible";

function OfficeFrame({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <section
      aria-label={OFFICE_TITLE}
      aria-busy={busy ? true : undefined}
      data-wf="03-3"
      className="flex min-h-0 min-w-0 flex-col gap-3 rounded-card border border-border bg-card p-3 portrait:min-h-auto"
    >
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <h2 className="text-section font-semibold text-text">{OFFICE_TITLE}</h2>
        <p className="min-w-0 truncate text-aux text-text-muted">{OFFICE_SUBTITLE}</p>
      </div>
      {children}
      <div data-wf="03-7" className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 text-aux text-text-secondary">
        <b className="font-semibold text-text">{OFFICE_LEGEND_TITLE}</b>
        {OFFICE_LEGEND_ITEMS.map((item) => (
          <span key={item.sample} className="inline-flex items-center gap-1.5">
            <Bubble legend tone={item.tone}>
              {item.sample}
            </Bubble>
            <span>{item.meaning}</span>
          </span>
        ))}
        <span>{OFFICE_LEGEND_SUBAGENT}</span>
      </div>
    </section>
  );
}

interface OfficeProps {
  workflow: Workflow;
  live: Live;
  /** 04-4 표시 중이면 캐릭터·말풍선·상태 글자를 모두 대기로 고정한다(ADR-68). */
  collectorDown: boolean;
  selectedName: string | null;
  onSelect: (name: string) => void;
}

export function Office({ workflow, live, collectorDown, selectedName, onSelect }: OfficeProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(gridRef);
  const seats = officeSeats({
    lead: workflow.lead,
    members: workflow.members,
    undefinedSubagents: live.undefinedSubagents,
    columns,
  });

  return (
    <OfficeFrame>
      <div ref={gridRef} className={GRID_CLASSES}>
        {seats.map((seat) => (
          <OfficeCell
            key={seat.key}
            seat={seat}
            live={live}
            collectorDown={collectorDown}
            selectedName={selectedName}
            onSelect={onSelect}
          />
        ))}
      </div>
    </OfficeFrame>
  );
}

/** 03 첫 스냅샷 전(04-2): 카드 머리·범례는 보이고 칸 자리만 첫 줄 칸 수만큼 스켈레톤. */
export function OfficeSkeleton() {
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(gridRef);

  return (
    <OfficeFrame busy>
      <div ref={gridRef} className={GRID_CLASSES}>
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} decorative className="h-office-cell" />
        ))}
      </div>
    </OfficeFrame>
  );
}
