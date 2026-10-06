/**
 * ui-spec.md §공통 Tooltip (레일·말줄임).
 * - 기본(`bubble` 없음): 말줄임 글자는 같은 요소의 `title`로 전체를 보여 준다(ui-rules.md 4).
 * - `bubble="rail"`: 레일 메뉴·수집 축약이 `rail:`에서 hover·focus 때 오른쪽에 `bg-selected` 상자로 `content`를 보여 준다.
 *   `bubble="always"`는 폭과 관계없이 같은 상자를 쓴다. 글자는 래퍼 `data-tip`의 CSS `::after`로 그린다(`layout.css` `tooltip`).
 *   `edge="bottom"`이면 항목 아래 끝에 맞춘다. 래퍼 배치는 `className`(배치 유틸리티만)으로 정한다.
 *   초점은 감싼 요소가 받는다(`:focus-within`) — 감싼 요소가 포커스를 받지 못하면 키보드 사용자는 상자를 볼 수 없다.
 */
import type { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  bubble?: "rail" | "always";
  edge?: "bottom";
  className?: string;
}

export function Tooltip({ content, children, bubble, edge, className = "" }: TooltipProps) {
  if (bubble === undefined) return <span title={content}>{children}</span>;
  return (
    <span
      data-tip={content}
      data-tip-edge={edge}
      className={`${bubble === "rail" ? "tooltip-rail" : "tooltip"} ${className}`}
    >
      {children}
    </span>
  );
}
