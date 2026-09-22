/**
 * ui-rules.md 4: 12자 넘는 name은 말줄임하고 마우스를 올리면 전체를 보여준다.
 * 네이티브 `title` 속성으로 구현한다(추가 스크립트 없이 접근성 기본 동작 사용).
 */
import type { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return <span title={content}>{children}</span>;
}
