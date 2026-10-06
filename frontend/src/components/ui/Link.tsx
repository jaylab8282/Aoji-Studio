/**
 * ui-spec.md §공통 Link (01·02), ADR-69: `text-link` 600 + 밑줄(`decoration-action-border`, offset 3),
 * hover 밑줄 `text-link`. 높이 34. 화살표는 글자 뒤(`trailingIcon="arrow-right"`).
 */
import { Link as RouterLink, type LinkProps as RouterLinkProps } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

interface LinkProps extends Omit<RouterLinkProps, "className"> {
  /** 글자 뒤에 놓는 아이콘(ui-rules 아이콘 표 이름). */
  trailingIcon?: IconName;
}

export function Link({ trailingIcon, children, ...rest }: LinkProps) {
  return (
    <RouterLink
      {...rest}
      className="inline-flex min-h-control items-center gap-1.5 font-semibold whitespace-nowrap text-link underline decoration-action-border underline-offset-3 transition-colors duration-120 ease-standard hover:decoration-link"
    >
      {children}
      {trailingIcon === undefined ? null : <Icon name={trailingIcon} />}
    </RouterLink>
  );
}
