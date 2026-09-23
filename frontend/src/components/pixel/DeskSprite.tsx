/**
 * ui-spec.md §공통 DeskSprite (A, 22×22 → 46px). pixel-sprites.md "A. 층 뷰용" 좌표 8칸 그대로.
 * FR-006-AC1(팀장 배지)·AC4(12자 초과 말줄임 + title 전체)·AC10.
 */
import type { Status } from "../../api/types";
import { agentStatusWithParent, LEAD_BADGE_TEXT } from "../../lib/text";
import { ellipsis } from "../../lib/format/ellipsis";
import { Tooltip } from "../ui/Tooltip";
import { desk, hair, legs, monitorBack, screen, shirt, skin } from "./palette";

const GRID_SIZE = 22;
const RENDER_SIZE = 46;

const STATUS_TEXT_CLASS: Record<Status, string> = {
  running: "text-running",
  waiting: "text-waiting",
  idle: "text-text-faint",
};

interface DeskSpriteProps {
  name: string;
  status: Status;
  isLead: boolean;
  parentLabel: string | null;
}

export function DeskSprite({ name, status, isLead, parentLabel }: DeskSpriteProps) {
  return (
    <div className="relative flex w-fit flex-col items-center gap-1">
      {isLead ? (
        <span className="absolute -top-2 -left-1 rounded-badge bg-running px-1.5 py-0.5 text-min font-semibold text-on-accent">
          {LEAD_BADGE_TEXT}
        </span>
      ) : null}
      <svg
        viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
        width={RENDER_SIZE}
        height={RENDER_SIZE}
        role="img"
        aria-label={name}
        style={{ shapeRendering: "crispEdges", imageRendering: "pixelated" }}
      >
        {/* 모니터 화면 */}
        <rect x={1} y={2} width={10} height={7} fill={screen[status]} />
        {/* 모니터 받침 */}
        <rect x={5} y={9} width={2} height={2} fill={monitorBack} />
        {/* 머리 */}
        <rect x={12} y={3} width={6} height={2} fill={hair} />
        {/* 얼굴 */}
        <rect x={12} y={5} width={6} height={4} fill={skin} />
        {/* 몸통(셔츠) */}
        <rect x={11} y={9} width={8} height={6} fill={shirt[status]} />
        {/* 책상 상판 */}
        <rect x={0} y={13} width={22} height={3} fill={desk} />
        {/* 다리 1 */}
        <rect x={12} y={16} width={2} height={5} fill={legs} />
        {/* 다리 2 */}
        <rect x={16} y={16} width={2} height={5} fill={legs} />
      </svg>
      <Tooltip content={name}>
        <span className="font-mono text-min-mono text-text-mono">{ellipsis(name)}</span>
      </Tooltip>
      <span className={`text-min ${STATUS_TEXT_CLASS[status]}`}>{agentStatusWithParent(status, parentLabel)}</span>
    </div>
  );
}
