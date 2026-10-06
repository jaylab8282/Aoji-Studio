/**
 * ui-spec.md §공통 상태 칩 / 경로 칩 (`_base.css:60-65`): 높이 24·`rounded-chip`·aux 600.
 * 시안(`live`)·주황(`waiting`)·빨강(`danger`)·중립(`neutral`). 칩은 표시 요소라 hover를 주지 않는다(ADR-69).
 * `path`는 경로 칩: 고정폭 400 `text-mono`, 줄지 않고 말줄임(`title`·`data-clamp`는 호출부가 넘긴다).
 * `data-*`·`title` 같은 HTML 속성은 그대로 넘긴다.
 */
import type { HTMLAttributes, ReactNode } from "react";

export type ChipTone = "live" | "waiting" | "danger" | "neutral";

const TONE_CLASSES: Record<ChipTone, string> = {
  live: "bg-live-soft text-live",
  waiting: "bg-waiting-soft text-waiting",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-selected text-text-muted",
};

const BASE_CLASSES = "h-chip rounded-chip px-2 text-aux whitespace-nowrap";

interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  tone?: ChipTone;
  /** 경로 칩(고정폭·말줄임). 색은 중립 바탕 + `text-mono`로 고정이라 `tone`을 받지 않는다. */
  path?: boolean;
  children: ReactNode;
}

export function Chip({ tone = "neutral", path = false, children, ...rest }: ChipProps) {
  const classes = path
    ? `${BASE_CLASSES} block min-w-0 overflow-hidden bg-selected font-mono leading-6 text-ellipsis text-text-mono`
    : `${BASE_CLASSES} inline-flex shrink-0 items-center gap-1.5 font-semibold ${TONE_CLASSES[tone]}`;
  return (
    <span {...rest} className={classes}>
      {children}
    </span>
  );
}
