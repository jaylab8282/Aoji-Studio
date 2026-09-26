/**
 * 02·03·07이 공유하는 "도우미로 터미널 열기" 흐름 (FR-013-AC6·AC9·AC10·E1~E4).
 *
 * 화면마다 다른 것은 **무엇을 열지(`target`)와 팝업에 보여줄 명령**뿐이고, 결과 처리는 같다:
 * - 204 → 아무 것도 표시하지 않는다(터미널은 맥북에서 열린다. 화면 이동도 없다 — ui-spec SCR-02·03).
 * - 무응답(2초·연결 실패·토큰 파일 없음) → `HelperMissingDialog` + 선택한 명령 + `명령 복사`(FR-013-AC9·E1).
 * - 403 → 버튼 옆 인라인 `도우미 인증 실패 · 도우미를 다시 설치하세요`(FR-013-E2).
 * - 400·그 밖의 사유 → 도우미(또는 서버)가 준 `message` 그대로(FR-013-E3, conventions.md §4 MUST).
 *
 * 도우미 주소는 `snapshot.config.helperUrl`을 쓴다(ADR-12). 첫 스냅샷 전에는 주소를 모르므로
 * 호출하지 않는다 — 화면은 `AppShell`이 스냅샷을 받은 뒤에만 본문을 그리고(ADR-32), 02 상단바
 * 버튼만 그 전에도 보인다(ui-spec SCR-02 로딩 열 `활성`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { openHelperSession } from "../../api/helper";
import type { HelperOpenRequest, HelperOpenResult } from "../../api/helper";
import { HELPER_AUTH_FAILED_TEXT } from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";

export interface HelperOpenController {
  /** 미응답 팝업에 실을 명령. `null`이면 팝업이 닫혀 있다. */
  missingCommand: string | null;
  /** 버튼 옆에 붙는 인라인 사유(403 확정 문구 · 도우미 message · `팀장이 없습니다`). */
  errorMessage: string | null;
  /**
   * 도우미 호출. `command`는 무응답일 때 팝업에 보여줄 명령이다.
   * `preflight`가 있으면 먼저 실행하고, `false`면 호출하지 않고 무응답으로 처리한다
   * (07이 `GET /health`로 버튼을 누를 때 다시 확인하는 데 쓴다 — FR-013-AC10).
   */
  open: (
    request: HelperOpenRequest,
    command: string,
    preflight?: () => Promise<boolean>,
  ) => void;
  /** 도우미를 호출하지 않고 사유만 보여준다(FR-013-E4). */
  showError: (message: string) => void;
  closeMissingDialog: () => void;
}

/**
 * @param onResult 호출 결과를 화면이 더 쓰고 싶을 때(07의 `열기 도우미` 행 갱신).
 */
export function useHelperOpen(onResult?: (result: HelperOpenResult) => void): HelperOpenController {
  const { config } = useSnapshotStore();
  const helperUrl = config === null ? null : config.helperUrl;
  const [missingCommand, setMissingCommand] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 응답을 기다리는 동안 다시 눌러도 같은 요청을 두 번 보내지 않는다(버튼은 ui-spec대로 활성이다).
  const pendingRef = useRef(false);
  // 최신 콜백을 `open`의 의존성에 넣지 않기 위한 보관(05-3 `WorkflowDeleteDialog`와 같은 방식).
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });

  const open = useCallback(
    (request: HelperOpenRequest, command: string, preflight?: () => Promise<boolean>) => {
      if (helperUrl === null || pendingRef.current) return;
      pendingRef.current = true;
      setErrorMessage(null);
      setMissingCommand(null);

      void (async () => {
        try {
          const ready = preflight === undefined ? true : await preflight();
          const result: HelperOpenResult = ready
            ? await openHelperSession(helperUrl, request)
            : { kind: "no-response" };

          if (result.kind === "no-response") {
            setMissingCommand(command);
          } else if (result.kind === "auth-failed") {
            setErrorMessage(HELPER_AUTH_FAILED_TEXT);
          } else if (result.kind === "message") {
            setErrorMessage(result.message);
          }
          onResultRef.current?.(result);
        } finally {
          pendingRef.current = false;
        }
      })();
    },
    [helperUrl],
  );

  const showError = useCallback((message: string) => {
    setMissingCommand(null);
    setErrorMessage(message);
  }, []);

  const closeMissingDialog = useCallback(() => setMissingCommand(null), []);

  return { missingCommand, errorMessage, open, showError, closeMissingDialog };
}
