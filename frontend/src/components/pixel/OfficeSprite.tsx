/**
 * ui-spec.md §공통 OfficeSprite (B, 16×20 격자 → 66×82px). pixel-sprites.md "B. 오피스용" 좌표 8칸 그대로.
 * 구성: 말풍선 + 캐릭터 + name 칩 + 상태 글자. 서브에이전트는 `small`(48×60px, 셔츠 `sub` 색).
 * FR-007-AC1·AC2·AC3, conventions.md §7(인라인 SVG·crispEdges·좌표 그대로, 애니메이션 없이 색 전환 200ms).
 *
 * 그리는 순서: 모니터 → 얼굴 → 머리카락 → 몸통 → 책상 → 다리.
 * 좌표표의 얼굴(5,2,6,6)과 머리카락(5,2,6,2)은 같은 자리에서 겹치므로 머리카락을 얼굴 위에 덮어
 * 이마 두 칸이 머리색으로 보이게 한다(02 로비 아이콘과 같은 규칙).
 */
import type { Status } from "../../api/types";
import type { ActionLabelResult } from "../../lib/derive/actionLabel";
import { ellipsis } from "../../lib/format/ellipsis";
import { LEAD_BADGE_TEXT } from "../../lib/text";
import { Tooltip } from "../ui/Tooltip";
import { desk, hair, legs, monitorBack, screen, shirt, skin } from "./palette";

const GRID_WIDTH = 16;
const GRID_HEIGHT = 20;
const RENDER_WIDTH = 66;
const RENDER_HEIGHT = 82;
const SMALL_RENDER_WIDTH = 48;
const SMALL_RENDER_HEIGHT = 60;

// 상태 색 전환만 허용(conventions.md §7 MUST: 애니메이션 금지, 색 전환 200ms 이하).
const COLOR_TRANSITION = { transition: "fill 200ms" } as const;

const BUBBLE_CLASSES: Record<ActionLabelResult["tone"], string> = {
  running: "border-border-strong bg-selected text-text",
  waiting: "border-waiting bg-waiting text-on-accent",
  idle: "border-border bg-soft text-text-muted",
};

const STATUS_TEXT_CLASSES: Record<Status, string> = {
  running: "text-running",
  waiting: "text-waiting",
  idle: "text-text-faint",
};

interface OfficeSpriteProps {
  /** 캐릭터 아래 name 칩(에이전트 name, 정의 없는 서브에이전트는 `agentType`). */
  name: string;
  /** 표시 상태. 04-4 표시 중에는 호출부가 `idle`로 고정해 넘긴다(ADR-17). */
  status: Status;
  action: ActionLabelResult;
  /** 상태 글자(부모 접미 포함). `lib/text.ts` `agentStatusWithParent`로 만든 값. */
  statusText: string;
  isLead?: boolean;
  /** 정의 없는 서브에이전트용 작은 캐릭터(48×60, 셔츠 `sub` 색). */
  small?: boolean;
}

export function OfficeSprite({ name, status, action, statusText, isLead = false, small = false }: OfficeSpriteProps) {
  // 서브에이전트 셔츠는 부모보다 흐린 초록(pixel-sprites.md 공통 색). 대기·권한 대기는 상태색 그대로 쓴다
  // (04-4 표시 중 "셔츠 대기색" 규칙, ui-spec.md SCR-03 작은 캐릭터 행).
  const shirtColor = small && status === "running" ? shirt.sub : shirt[status];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        {isLead ? (
          <span className="rounded-badge bg-running px-1.5 py-0.5 text-min font-semibold text-on-accent">
            {LEAD_BADGE_TEXT}
          </span>
        ) : null}
        <span className={`rounded-chip border px-2 py-0.5 text-aux font-semibold ${BUBBLE_CLASSES[action.tone]}`}>
          {action.label}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${GRID_WIDTH} ${GRID_HEIGHT}`}
        width={small ? SMALL_RENDER_WIDTH : RENDER_WIDTH}
        height={small ? SMALL_RENDER_HEIGHT : RENDER_HEIGHT}
        role="img"
        aria-label={name}
        style={{ shapeRendering: "crispEdges", imageRendering: "pixelated" }}
      >
        {/* 모니터 화면 */}
        <rect x={1} y={1} width={9} height={6} fill={screen[status]} style={COLOR_TRANSITION} />
        {/* 모니터 받침 */}
        <rect x={4} y={7} width={3} height={1} fill={monitorBack} />
        {/* 얼굴 */}
        <rect x={5} y={2} width={6} height={6} fill={skin} />
        {/* 머리카락 */}
        <rect x={5} y={2} width={6} height={2} fill={hair} />
        {/* 몸통(셔츠) */}
        <rect x={4} y={8} width={8} height={6} fill={shirtColor} style={COLOR_TRANSITION} />
        {/* 책상 */}
        <rect x={0} y={13} width={16} height={3} fill={desk} />
        {/* 다리 1 */}
        <rect x={5} y={16} width={2} height={4} fill={legs} />
        {/* 다리 2 */}
        <rect x={9} y={16} width={2} height={4} fill={legs} />
      </svg>

      <Tooltip content={name}>
        <span className="rounded-badge bg-page px-2 py-0.5 font-mono text-min-mono text-text">{ellipsis(name)}</span>
      </Tooltip>
      <span className={`text-min ${STATUS_TEXT_CLASSES[status]}`}>{statusText}</span>
    </div>
  );
}
