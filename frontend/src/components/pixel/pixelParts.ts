/** `px-desk` 심볼 좌표·크기 (ADR-67, ui-spec §공통 픽셀 캐릭터). */
export type PixelCharSize = "desk" | "office" | "sub";


/** 렌더 크기(px): 02 책상 66(22격자 × 3), 03 칸 88(× 4), 03 서브 66. `--spacing-char-desk`·`--spacing-char-office`와 같다. */
export const PIXEL_CHAR_PX: Record<PixelCharSize, number> = { desk: 66, office: 88, sub: 66 };

export type PixelPart = "frame" | "screen" | "code" | "hair" | "face" | "shirt" | "desk" | "leg";

export interface PixelRect {
  part: PixelPart;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `px-desk` 심볼의 rect 12개(그리는 순서 그대로). */
export const PIXEL_RECTS: readonly PixelRect[] = [
  { part: "frame", x: 0, y: 1, width: 12, height: 9 },
  { part: "screen", x: 1, y: 2, width: 10, height: 7 },
  { part: "code", x: 2, y: 4, width: 5, height: 1 },
  { part: "code", x: 2, y: 6, width: 7, height: 1 },
  { part: "frame", x: 5, y: 10, width: 2, height: 3 },
  { part: "hair", x: 12, y: 3, width: 6, height: 2 },
  { part: "face", x: 12, y: 5, width: 6, height: 4 },
  { part: "hair", x: 13, y: 6, width: 1, height: 1 },
  { part: "shirt", x: 11, y: 9, width: 8, height: 6 },
  { part: "desk", x: 0, y: 13, width: 22, height: 3 },
  { part: "leg", x: 12, y: 16, width: 2, height: 5 },
  { part: "leg", x: 16, y: 16, width: 2, height: 5 },
];

