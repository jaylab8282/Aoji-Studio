/**
 * ui-spec.md SCR-02 검색 입력(돋보기 아이콘). ui-rules.md 4: 검색 입력 + 층 선택 드롭다운 조합으로 쓴다.
 * hover·`:focus-visible`은 `bg-selected`(ADR-46 A ① 어두운 표면). 브라우저 기본 포커스 표시는 지우지 않는다.
 */
import type { InputHTMLAttributes } from "react";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function SearchInput(props: SearchInputProps) {
  return (
    <div className="relative">
      <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint">
        ⌕
      </span>
      <input
        type="search"
        {...props}
        className="h-btn-sm w-full rounded-control border border-border-strong bg-soft pl-8 pr-3 text-body text-text hover:bg-selected focus-visible:bg-selected"
      />
    </div>
  );
}
