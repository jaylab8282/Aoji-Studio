/**
 * ui-spec.md 전반의 mono 표기(경로·명령·시각 등)에 쓰는 공용 span.
 */
import type { ReactNode } from "react";

interface MonoTextProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function MonoText({ children, className = "", title }: MonoTextProps) {
  return (
    <span className={`font-mono text-text-mono ${className}`} title={title}>
      {children}
    </span>
  );
}
