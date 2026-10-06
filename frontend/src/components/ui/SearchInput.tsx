/**
 * ui-spec.md §공통 SearchInput (02·05-R, `_base.css:98-104`): `search` 아이콘이 왼쪽에 있는 `TextInput` 표면.
 * 키보드 초점 링은 `styles/base.css` `:focus-visible`(ADR-69).
 */
import type { InputHTMLAttributes } from "react";
import { Icon } from "./Icon";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">;

export function SearchInput(props: SearchInputProps) {
  return (
    <div className="relative">
      <Icon
        name="search"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
      />
      <input
        type="search"
        {...props}
        className="min-h-control w-full min-w-0 rounded-control border border-border-strong bg-soft pr-3 pl-9 text-body text-text placeholder:text-text-muted aria-invalid:border-danger"
      />
    </div>
  );
}
