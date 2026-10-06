/**
 * ui-spec.md SCR-02 책상 안쪽: 팀장 배지 + `PixelChar desk`(66) + name + 상태 줄 (ADR-67).
 * FR-006-AC1(팀장 배지)·AC4(12자 초과 말줄임 + title 전체)·AC10. 배치 자체는 T-R3-13 몫이라 그대로 둔다.
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
import { PixelChar } from "../../components/pixel/PixelChar";
import { Tooltip } from "../../components/ui/Tooltip";

const STATUS_TEXT_CLASS: Record<Status, string> = {
  running: "text-running",
  waiting: "text-waiting",
  idle: "text-text-faint",
};

interface DeskFigureProps {
  name: string;
  status: Status;
  isLead: boolean;
  parentLabel: string | null;
}

export function DeskFigure({ name, status, isLead, parentLabel }: DeskFigureProps) {
  const statusText = agentStatusWithParent(status, parentLabel);

  return (
    <div data-agent-name={name} className="relative flex w-full min-w-0 flex-col items-center gap-1">
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
      <PixelChar status={status} size="desk" />
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
