/**
 * 03 패널 `작업 폴더` 요약 (ui-spec.md SCR-03 패널 표 행: "경로는 hostPath 접두를 잘라 요약, title로 전체").
 * 순수 함수(ADR-15). 전체 경로는 호출부가 `title`로 그대로 보여준다.
 */

/** 마운트 폴더(`config.hostPath`) 접두를 잘라낸 표시용 경로. 접두가 아니면 원본 그대로. */
export function pathSummary(path: string, hostPath: string): string {
  if (path === hostPath) {
    const segments = hostPath.split("/").filter((segment) => segment !== "");
    return segments.at(-1) ?? path;
  }
  if (path.startsWith(`${hostPath}/`)) {
    return path.slice(hostPath.length + 1);
  }
  return path;
}
