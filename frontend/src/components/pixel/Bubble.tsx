/**
 * 03 말풍선 (ui-spec SCR-03 오피스 그리드·범례, ADR-67). 높이 22(범례 견본 20), 11px 600.
 * 작업 중 `bg-live-soft text-live` / 권한 요청 `bg-waiting text-page`(주황 채움) / 대기 점선 `text-muted` 400.
 * 문구는 `lib/derive/actionLabel.ts`가 정한다. 칸 폭을 넘으면 한 줄 말줄임 + 같은 요소 `title`.
 */
import type { Status } from "../../api/types";

const TONE_CLASSES: Record<Status, string> = {
  running: "bg-live-soft font-semibold text-live",
  waiting: "bg-waiting font-semibold text-page",
  idle: "border border-dashed border-border-dashed bg-transparent font-normal text-text-muted",
};

interface BubbleProps {
  tone: Status;
  /** 범례 견본(높이 20). */
  legend?: boolean;
  children: string;
}

export function Bubble({ tone, legend = false, children }: BubbleProps) {
  return (
    <span
      data-testid="bubble"
      data-tone={tone}
      title={children}
      className={`inline-flex max-w-full items-center overflow-hidden rounded-chip px-2 text-min text-ellipsis whitespace-nowrap ${
        legend ? "h-bubble-legend" : "h-bubble"
      } ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
