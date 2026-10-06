/**
 * ui-spec.md §공통 Select (`_base.css:105-106`): 네이티브 select 위에 `chevron-down`을 얹는다. 높이 34, 선택 값 600·말줄임,
 * 비활성은 점선 `border-dashed` + `bg-card` + `text-muted` 400 + `cursor-not-allowed`. 초점 링은 `styles/base.css` `:focus-visible`.
 */
import type { SelectHTMLAttributes } from "react";
import { Icon } from "./Icon";

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">;

export function Select(props: SelectProps) {
  return (
    <span className="relative inline-flex max-w-full min-w-0">
      <select
        {...props}
        className="min-h-control w-full min-w-0 cursor-pointer appearance-none truncate rounded-control border border-border-strong bg-soft pr-9 pl-3 text-body font-semibold text-text aria-invalid:border-danger disabled:cursor-not-allowed disabled:border-dashed disabled:border-border-dashed disabled:bg-card disabled:font-normal disabled:text-text-muted"
      />
      <Icon
        name="chevron-down"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-muted"
      />
    </span>
  );
}
