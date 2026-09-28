/**
 * 공용 여러 줄 입력. 06 폼의 `지침 (본문 = 시스템 프롬프트)`처럼 mono 원문을 담는 자리에 쓴다.
 * 색·글꼴·간격은 theme.css 토큰만 쓴다(conventions.md §7).
 * hover·`:focus-visible`은 `bg-selected`(ADR-46 A ① 어두운 표면). 브라우저 기본 포커스 표시는 지우지 않는다.
 */
import type { TextareaHTMLAttributes } from "react";

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export function TextArea(props: TextAreaProps) {
  return (
    <textarea
      {...props}
      className="w-full rounded-control border border-border-strong bg-soft px-3 py-2 font-mono text-body text-text-mono hover:bg-selected focus-visible:bg-selected"
    />
  );
}
