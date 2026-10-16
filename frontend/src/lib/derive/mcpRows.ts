/** 09 행 파생 값 (ui-spec SCR-09, FR-023-AC3). */
import type { McpServer } from "../../api/types";

/** 정의가 없고 호출 기록만 있는 행(`호출 기록만` 점선 칩 하나). */
export function isCalledOnly(server: McpServer): boolean {
  return server.locations.length > 0 && server.locations.every((location) => location.kind === "called-only");
}
