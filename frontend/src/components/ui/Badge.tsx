/**
 * ui-spec.md §공통 Badge (`팀장`, 02·03): 높이 18, `bg-selected text-text`, 11px 600 (`_base.css:66`).
 * 클릭 동작이 없어 hover를 주지 않는다(ADR-69).
 */
import type { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-badge shrink-0 items-center rounded-chip bg-selected px-1.5 text-min font-semibold whitespace-nowrap text-text">
      {children}
    </span>
  );
}
