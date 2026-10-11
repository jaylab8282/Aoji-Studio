/**
 * ui-spec.md SCR-02 캔버스(`02-5`): `bg-page` + 24px 격자(`canvas-grid`), 위쪽만 둥근 테두리, 안 여백 16, 자체 스크롤,
 * 남은 높이를 모두 쓴다. 줌 묶음·미니맵은 이 캔버스 **위에 떠 있고**(캔버스 형제 `absolute`, 16px) 스크롤하지 않는다 — 마지막 층 아래
 * 여백 160(`pb-canvas-tail`, 줌 배율과 같이 커진다)으로 가려진 층도 스크롤해 줌·미니맵 위로 올려 볼 수 있다(ADR-66, FR-006-AC10 가림 없음).
 * `center`는 04-5·04-7 가운데 카드 배치(카드 폭 `min(620, 100%)`, 위 24)다.
 */
import type { CSSProperties, ReactNode, RefObject } from "react";
import { canvasLabel } from "../../lib/text";

interface CanvasProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  center?: boolean;
  /** 캔버스 위에 떠 있는 요소(줌 묶음·미니맵). */
  floating?: ReactNode;
  children: ReactNode;
}

export function Canvas({ scrollRef, zoom, center = false, floating, children }: CanvasProps) {
  return (
    <div data-wf="02-5" className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        role="region"
        tabIndex={0}
        aria-label={canvasLabel(zoom)}
        data-testid="floor-scroll-area"
        className={`canvas-grid min-h-0 flex-1 overflow-auto rounded-t-card border border-b-0 border-border bg-page grid content-start gap-3 p-4 ${
          center ? "justify-items-center" : ""
        }`}
      >
        {children}
      </div>
      {floating}
    </div>
  );
}

interface ZoomSurfaceProps {
  zoom: number;
  /** 층 그리드만 감싸는 안쪽 요소(`맞춤` 계산 대상, 아래 여백 160 제외). */
  contentRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

/**
 * 줌 대상(ui-spec 줌 묶음 행): 층 그리드(04-6 카드·로비 제외)에 `transform: scale`을 건다. 아래 여백 160은 같이 커지므로
 * 어느 배율에서도 마지막 층 아래로 줌·미니맵 높이보다 긴 여백이 남는다.
 */
export function ZoomSurface({ zoom, contentRef, children }: ZoomSurfaceProps) {
  return (
    <div className="pb-canvas-tail zoom-surface" style={{ "--zoom-scale": zoom / 100 } as CSSProperties}>
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
