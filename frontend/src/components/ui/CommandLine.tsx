/**
 * ui-spec.md §공통 CommandLine (04-1·04-5·07, 도우미 미설치 창, `_base.css:126`):
 * `bg-inset rounded-chip` 고정폭 aux, 안 여백 6/8, `overflow-wrap: anywhere`.
 */
import type { ReactNode } from "react";

export function CommandLine({ children }: { children: ReactNode }) {
  return (
    <code className="block rounded-chip bg-inset px-2 py-1.5 font-mono text-aux wrap-anywhere text-text-mono">
      {children}
    </code>
  );
}
