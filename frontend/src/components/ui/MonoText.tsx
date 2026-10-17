/**
 * ui-spec.md 전반의 mono 표기(경로·명령·시각 등)에 쓰는 공용 span.
 */
import type { ReactNode } from "react";

interface MonoTextProps {
  children: ReactNode;
  className?: string;
  title?: string;
  /** 의도한 말줄임(`text-overflow: ellipsis`) 요소 표식 `data-clamp`(E2E-16 넘침 판정 제외 대상). */
  clamp?: boolean;
}

export function MonoText({ children, className = "", title, clamp = false }: MonoTextProps) {
  return (
    <span className={`font-mono text-text-mono ${className}`} title={title} data-clamp={clamp ? "" : undefined}>
      {children}
    </span>
  );
}
