/**
 * 픽셀 캐릭터 (ui-spec §공통 픽셀 캐릭터, ADR-67). `docs/ui/screens/02-workflows.html`의
 * `<symbol id="px-desk" viewBox="0 0 22 22">` 12개 `rect` 좌표 그대로(옆모습). 02 책상·03 칸·03 정의 없는
 * 서브에이전트가 같은 모양을 쓰고, 부위 색은 `layout.css`의 `pixel-char*` 유틸리티가 `--px-*` 변수로 정한다.
 * 정의 없는 서브에이전트도 같은 상태 색 규칙을 쓴다(별도 셔츠 색 없음, FR-007-AC3).
 * 상태는 옆 글자가 말하므로 `aria-hidden`. 자동 검증용으로 `data-testid`·`data-state`·`data-size`를 단다.
 */
import type { Status } from "../../api/types";
import { PIXEL_CHAR_PX, PIXEL_RECTS, type PixelCharSize } from "./pixelParts";

/** 격자 크기(22×22). */
const GRID = 22;

const STATE_CLASS: Record<Status, string> = {
  running: "pixel-char-running",
  waiting: "pixel-char-waiting",
  idle: "",
};

interface PixelCharProps {
  status: Status;
  size: PixelCharSize;
}

export function PixelChar({ status, size }: PixelCharProps) {
  const px = PIXEL_CHAR_PX[size];
  const className = ["pixel-char", STATE_CLASS[status], size === "sub" ? "pixel-char-sub" : ""]
    .filter((c) => c !== "")
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={px}
      height={px}
      aria-hidden="true"
      shapeRendering="crispEdges"
      className={className}
      data-testid="pixel-char"
      data-state={status}
      data-size={size}
    >
      {PIXEL_RECTS.map((r, i) => (
        <rect key={i} data-part={r.part} x={r.x} y={r.y} width={r.width} height={r.height} />
      ))}
    </svg>
  );
}
