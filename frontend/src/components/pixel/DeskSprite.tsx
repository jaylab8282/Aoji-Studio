/**
 * ui-spec.md §공통 DeskSprite (A, 22×22 → 46px). pixel-sprites.md "A. 층 뷰용" 좌표 8칸 그대로.
 * FR-006-AC1(팀장 배지)·AC4(12자 초과 말줄임 + title 전체)·AC10.
 *
 * 루트는 그리드 칸 폭을 받고(`w-full min-w-0` — `w-fit` 금지) 이름 칩 줄과 상태 글자 줄은 각자
 * CSS 한 줄 clamp(`w-full min-w-0 truncate`)로 칸 폭에서 자른다. 부모 접미(`· 부모 <라벨>`)가 붙은 상태 줄은
 * **같은 요소의 네이티브 `title`**로 전체 문구를 준다 — 공용 `Tooltip`은 폭 제약이 없는 래퍼를
 * 하나 더 만들어 clamp 기준 폭을 없애므로 이 자리에 쓰지 않는다(ADR-50 B, conventions.md §7 MUST).
 * **DOM 텍스트는 자르지 않는다**: `agentStatusWithParent()` 결과 문자열이 그대로 들어간다
 * (이름 칩의 12자 말줄임만 FR-006-AC4대로 `ellipsis.ts`가 담당한다).
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
  const statusText = agentStatusWithParent(status, parentLabel);

  return (
    <div className="relative flex w-full min-w-0 flex-col items-center gap-1">
      {/*
        팀장 배지는 루트(= 그리드 칸 폭)를 기준으로 왼쪽 위에 붙는다. 루트가 `w-fit`에서 `w-full`이 되면서
        (ADR-50 B) 배지 기준이 칸 왼쪽 끝으로 바뀌어 **왼쪽으로 이동**한다 — 실측 span-1(74.84px 열)에서
        8.2px, span-3(118px 열)에서 30px. 이동 뒤 배지 왼쪽은 책상 상판 왼쪽 기준 −36px로, 기준 PNG
        (`docs/ui/screens/02-workflows.png`)의 −36px과 **같다**(이전은 −6px). 배지 위치가 더 이상 그
        책상 글자 폭에 따라 흔들리지 않는다.
      */}
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
      {/*
        이름 칩 줄. clamp는 **줄 요소인 이 블록**에 건다 — `Tooltip`이 만드는 `<span>`은 inline이라
        `overflow` clamp가 걸리지 않고(실측: 클래스를 안쪽 span에 두면 `nowrap`만 먹어 13자 이름이
        81.91px로 칸 폭 74.84px를 넘어 번졌다) 칸 폭도 내려주지 못한다. 안쪽 글자 요소를
        `inline-block`으로 바꾸는 방법도 자르기는 하지만 `overflow`가 있는 inline-block은 기준선이
        아래 여백 끝으로 바뀌어 이름 칩이 세로로 2px 움직인다(기준 캡처 대조에서 실측). 그래서
        글자 요소는 inline 그대로 두고 줄 자체를 자른다 — 렌더 픽셀 변화 0, 전체 이름은 기존
        `Tooltip`(문자열 말줄임 방식)이 그대로 담당한다.
      */}
      <div className="w-full min-w-0 truncate text-center">
        <Tooltip content={name}>
          <span className="font-mono text-min-mono text-text-mono">{ellipsis(name)}</span>
        </Tooltip>
      </div>
      <span
        className={`w-full min-w-0 truncate text-center text-min ${STATUS_TEXT_CLASS[status]}`}
        // 부모 접미가 붙은 줄만 칸 폭을 넘을 수 있다 → 그 경우에만 전체 문구를 title로 준다(ADR-50 B).
        title={parentLabel === null ? undefined : statusText}
      >
        {statusText}
      </span>
    </div>
  );
}
