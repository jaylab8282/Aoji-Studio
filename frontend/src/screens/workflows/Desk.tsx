/**
 * ui-spec.md SCR-02 책상(`02-7`): 링크 하나 = 팀장 배지 + `PixelChar desk`(66) + name + 상태 줄. ADR-67·ADR-69.
 * FR-006-AC1(팀장 배지)·AC4(12자 초과 말줄임 + `title` 전체)·AC10(칸 폭 100px, 상태 줄 clamp + `title`).
 *
 * 칸 폭은 100px 고정(`repeat(auto-fill, 100px)`, 상위 `Floor`)이고 이 칸이 이름 줄·상태 줄 clamp의 기준 폭이다.
 * 이름 줄은 `max-w-desk`(100) 안에서, 상태 줄은 `max-w-desk-status`(96) 안에서 CSS 한 줄 clamp(`truncate`)로 자른다.
 * **DOM 텍스트는 자르지 않는다**: `agentStatusWithParent()` 결과 문자열이 그대로 들어간다(이름의 12자 말줄임만
 * FR-006-AC4대로 `ellipsis.ts`가 담당한다). 전체 문구는 같은 요소의 네이티브 `title`로 준다 — 폭 제약이 없는
 * 래퍼(`Tooltip`)를 끼우면 clamp 기준 폭이 사라진다(conventions.md §7 MUST).
 * 책상 칸 안은 `<button>`이라 phrasing 요소(span)만 쓴다. hover는 `bg-soft` 하나(ADR-69), 키보드 초점은 공통 링.
 * `data-agent-name`은 `<button>` 자신에 있고 캐릭터 SVG가 그 바로 아래 자식이다(E2E 선택자 `[data-agent-name] > svg`).
 */
import type { Status } from "../../api/types";
import { PixelChar } from "../../components/pixel/PixelChar";
import { StatusDot } from "../../components/ui/StatusDot";
import { ellipsis } from "../../lib/format/ellipsis";
import { agentStatusWithParent, LEAD_BADGE_TEXT } from "../../lib/text";

const STATUS_TEXT_CLASS: Record<Status, string> = {
  running: "text-live",
  waiting: "text-waiting",
  idle: "text-text-muted",
};

interface DeskProps {
  name: string;
  status: Status;
  isLead: boolean;
  parentLabel: string | null;
  onOpen: () => void;
}

export function Desk({ name, status, isLead, parentLabel, onOpen }: DeskProps) {
  const statusText = agentStatusWithParent(status, parentLabel);
  const label = `${name} · ${statusText}${isLead ? ` · ${LEAD_BADGE_TEXT}` : ""} · 상세에서 보기`;

  return (
    <button
      type="button"
      data-wf="02-7"
      data-agent-name={name}
      aria-label={label}
      onClick={onOpen}
      className="relative flex w-desk flex-col items-center gap-0.5 rounded-control pt-5.5 pb-1 transition-colors duration-120 ease-standard hover:bg-soft"
    >
      {isLead ? (
        <span className="absolute top-0.5 left-1/2 inline-flex h-badge -translate-x-1/2 items-center rounded-chip bg-selected px-1.5 text-min font-semibold whitespace-nowrap text-text">
          {LEAD_BADGE_TEXT}
        </span>
      ) : null}
      <PixelChar status={status} size="desk" />
      <span
        className="mt-0.5 block max-w-desk truncate font-mono text-min desk-line tracking-desk text-text-mono"
        title={name}
        data-clamp=""
      >
        {ellipsis(name)}
      </span>
      <span
        className={`block max-w-desk-status truncate text-center text-min desk-line font-semibold ${STATUS_TEXT_CLASS[status]}`}
        // 부모 접미가 붙은 줄만 칸 폭을 넘을 수 있다 → 그 경우에만 전체 문구를 title로 준다.
        title={parentLabel === null ? undefined : statusText}
        data-clamp={parentLabel === null ? undefined : ""}
      >
        <span className="mr-1 inline-block">
          <StatusDot status={status} />
        </span>
        {statusText}
      </span>
    </button>
  );
}
