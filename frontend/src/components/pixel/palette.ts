/**
 * ui-spec.md §공통 "디자인 토큰 → 코드 매핑" 마지막 행: 픽셀 캐릭터 색은 `@theme`이 아니라
 * 이 파일의 고정 팔레트로 관리한다(pixel-sprites.md "공통 색" 표 그대로, SVG rect fill 전용).
 */
import type { Status } from "../../api/types";

export const skin = "#E8C9A6";
export const hair = "#2A3242";
export const legs = "#3A4356";
export const desk = "#6B553A";
export const monitorBack = "#3A4356";

export const shirt: Record<Status, string> & { sub: string } = {
  running: "#3DD68C",
  waiting: "#FF9A4D",
  idle: "#55627A",
  sub: "#7FB8A0",
};

export const screen: Record<Status, string> = {
  running: "#2F8F63",
  waiting: "#A8632A",
  idle: "#1B2433",
};
