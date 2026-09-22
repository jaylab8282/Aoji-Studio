/**
 * ui-spec.md §공통 Skeleton: `bg-soft` 블록, 애니메이션 없음.
 */
interface SkeletonProps {
  className?: string;
  "aria-label"?: string;
}

export function Skeleton({ className = "", "aria-label": ariaLabel }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel ?? "로딩 중"}
      className={`bg-soft rounded-control ${className}`}
    />
  );
}
