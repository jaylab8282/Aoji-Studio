/**
 * 공통 배너. ui-spec §공통 `DisconnectBanner`(04-3, `04-3-1`)·`Banner`(04-4, `04-4-1`)의 띠 모양과
 * 02 저장 후 안내 줄(`soft`)이 쓴다.
 *
 * - `danger`: 상단 바 바로 아래 전체 폭 띠. `bg-danger-soft` + 아래 `border-danger-border`, 글자 `danger`,
 *   최소 높이 48, 좌우 `gutter`, 한 줄(`whitespace-nowrap`), `role="status"`.
 * - `soft`: 화면 본문 안 안내 줄(카드 모양). 02 화면 개편(T-R3-16) 때 `box`로 바뀐다.
 * `wf`는 화면 원본의 `data-wf` 영역 이름이다(`04-3-1`·`04-4-1`).
 */
import type { ReactNode } from "react";

export type BannerTone = "danger" | "soft";

const TONE_CLASSES: Record<BannerTone, string> = {
  danger:
    "flex min-h-banner min-w-0 shrink-0 items-center gap-3 border-b border-danger-border bg-danger-soft px-gutter py-2 whitespace-nowrap text-danger",
  soft: "border rounded-card px-page-x py-3 bg-soft border-border text-text-secondary",
};

interface BannerProps {
  tone: BannerTone;
  wf?: string;
  children: ReactNode;
}

export function Banner({ tone, wf, children }: BannerProps) {
  return (
    <div role="status" data-wf={wf} className={TONE_CLASSES[tone]}>
      {children}
    </div>
  );
}
