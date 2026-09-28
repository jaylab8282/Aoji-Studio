/**
 * 공용 네이티브 select(ui-spec.md SCR-02 층 선택 드롭다운 등에서 재사용).
 * hover·`:focus-visible`은 `bg-selected`(ADR-46 A ① 어두운 표면). 브라우저 기본 포커스 표시는 지우지 않는다.
 */
import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select(props: SelectProps) {
  return (
    <select
      {...props}
      className="h-btn-sm rounded-control border border-border-strong bg-soft px-3 text-body text-text hover:bg-selected focus-visible:bg-selected"
    />
  );
}
