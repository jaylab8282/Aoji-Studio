/**
 * ui-spec.md §공통 Skeleton (`_base.css:135-136`): `bg-soft` `rounded-chip`(4px), 기본 높이 12, `big` 28,
 * 애니메이션 없음. 호출부가 높이 클래스(`h-…`·`size-…`)를 넘기면 그 높이를 따른다(화면별 자리 크기, ADR-70).
 */
interface SkeletonProps {
  className?: string;
  /** 큰 값(KPI 수치 등) 자리. 높이 28. */
  big?: boolean;
  "aria-label"?: string;
  /** 표 칸처럼 개수가 많은 자리: 보조 기술에 알리지 않는다(`aria-hidden`, 역할 없음). 영역 단위로 `aria-busy`를 둔다. */
  decorative?: boolean;
}

const OWN_HEIGHT = /(?:^|\s)(?:h|size|min-h)-/;

export function Skeleton({ className = "", big = false, "aria-label": ariaLabel, decorative = false }: SkeletonProps) {
  const height = OWN_HEIGHT.test(className) ? "" : big ? "h-7" : "h-3";
  return (
    <div
      {...(decorative ? { "aria-hidden": true } : { role: "status", "aria-label": ariaLabel ?? "로딩 중" })}
      data-skeleton=""
      className={`rounded-chip bg-soft ${height} ${className}`}
    />
  );
}
