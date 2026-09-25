/**
 * ui-spec.md SCR-07 `열기 도우미` 행이 표시하는 네 상태(FR-013-AC10).
 * 값을 만드는 쪽(도우미 `GET /health` · `GET /api/helper/token` 호출)은 T-021이 붙이고,
 * 이 타입은 화면이 그 결과를 어떤 모양으로 보여줄지만 정한다.
 */
export type HelperStatus =
  /** 응답을 기다리는 동안(로딩) */
  | { kind: "checking" }
  /** 도우미가 응답함. `checkedAt`은 응답을 확인한 시각(ISO-8601 offset) */
  | { kind: "installed"; checkedAt: string }
  /** 2초 안에 응답 없음 → 미설치로 표시 */
  | { kind: "missing" }
  /** `GET /api/helper/token`이 null → 토큰 파일 없음 */
  | { kind: "no-token" };
