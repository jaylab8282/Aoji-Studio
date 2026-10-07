/**
 * 03 오피스 그리드의 현재 열 수 (ui-spec SCR-03 크기별 배치, ADR-66).
 * 열 수는 CSS(`office-grid`: 칸 최소 폭 `max(184px, (폭 − 5×12)/6)`, 최대 6열)가 정하고, 마지막 줄의 `빈 자리` 수를 맞추려고
 * 계산된 `grid-template-columns`의 트랙 수를 읽는다. 창 크기를 JS로 판정하지 않는다.
 */
import { useLayoutEffect, useState, type RefObject } from "react";

/** 측정 전·레이아웃이 없는 환경(jsdom)에서 쓰는 값 = 최대 열 수. */
export const MAX_OFFICE_COLUMNS = 6;

/** 계산된 `grid-template-columns` 값(`"281px 281px …"`)에서 트랙 수를 센다. 읽을 수 없으면 null. */
export function countGridColumns(template: string): number | null {
  const tracks = template.trim();
  if (tracks === "" || tracks === "none" || tracks.includes("(")) return null;
  return tracks.split(/\s+/).length;
}

export function useGridColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(MAX_OFFICE_COLUMNS);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const measure = () => {
      const count = countGridColumns(getComputedStyle(element).gridTemplateColumns);
      if (count !== null) setColumns(count);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}
