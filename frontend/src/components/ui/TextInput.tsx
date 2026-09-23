/**
 * 공용 한 줄 텍스트 입력. `Field`와 함께 05·06 팝업에서 쓴다.
 * 색·글꼴·간격은 theme.css 토큰만 쓴다(conventions.md §7). 크기는 보조 컨트롤 높이(`h-btn-sm`)로
 * `SearchInput`·`Select`와 맞춘다(NFR-12 최소 34px).
 */
import type { InputHTMLAttributes } from "react";

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">;

export function TextInput(props: TextInputProps) {
  return (
    <input
      type="text"
      {...props}
      className="h-btn-sm w-full rounded-control border border-border-strong bg-soft px-3 text-body text-text"
    />
  );
}
