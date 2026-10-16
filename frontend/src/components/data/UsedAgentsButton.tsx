/**
 * ui-spec.md §공통 `UsedAgentsButton`(`nag`, 08·09): `사용 에이전트 N명` 링크 모양 버튼(aux 600 `text-link` + 밑줄 `action-border`, 높이 34).
 * N = 0이면 `text-muted` 400 밑줄 없음. 누르면 그 행 펼침/접음(행의 펼침 버튼과 같은 `aria-expanded`).
 */
import { usedAgentsLabel } from "../../lib/text";

interface UsedAgentsButtonProps {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  /** 펼치는 영역 id(`aria-controls`). */
  controls?: string;
}

const BASE = "inline-flex min-h-control items-center p-0 text-aux whitespace-nowrap";
const ACTIVE = "font-semibold text-link underline decoration-action-border underline-offset-3";
const ZERO = "font-normal text-text-muted no-underline";

export function UsedAgentsButton({ count, expanded, onToggle, controls }: UsedAgentsButtonProps) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      data-zero={count === 0 ? "" : undefined}
      onClick={onToggle}
      className={`${BASE} ${count === 0 ? ZERO : ACTIVE}`}
    >
      {usedAgentsLabel(count)}
    </button>
  );
}
