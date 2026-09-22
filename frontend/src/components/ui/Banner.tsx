/**
 * 공통 배너 컨테이너. `DisconnectBanner`(04-3)·04-1·04-4 등에서 쓴다.
 */
import type { ReactNode } from "react";

export type BannerTone = "danger" | "soft";

const TONE_CLASSES: Record<BannerTone, string> = {
  danger: "bg-danger-soft border-danger-border text-danger",
  soft: "bg-soft border-border text-text-secondary",
};

interface BannerProps {
  tone: BannerTone;
  children: ReactNode;
}

export function Banner({ tone, children }: BannerProps) {
  return (
    <div role="status" className={`border rounded-card px-page-x py-3 ${TONE_CLASSES[tone]}`}>
      {children}
    </div>
  );
}
