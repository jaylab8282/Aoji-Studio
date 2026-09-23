/**
 * ui-spec.md SCR-04-5 에이전트 폴더 읽기 실패 (01 KPI 1·2 자리, 02 층 그리드 자리, 07 프로젝트 폴더 카드).
 * `registry.agentsDirMissing === true`일 때 쓴다. FR-001-E1, FR-001-AC4.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost, ApiError } from "../../api/client";
import { snapshotStore } from "../../state/snapshotStore";
import type { Registry } from "../../api/types";
import { Button } from "./Button";
import { MonoText } from "./MonoText";
import {
  AGENTS_DIR_MISSING_BODY_1,
  AGENTS_DIR_MISSING_BODY_2,
  AGENTS_DIR_MISSING_TITLE,
  OPEN_SETTINGS_BUTTON_LABEL,
  RESCAN_BUTTON_LABEL,
  RESCAN_BUTTON_LOADING_LABEL,
  UNKNOWN_ERROR_MESSAGE,
  agentsDirMissingPath,
  rescanFailedMessage,
} from "../../lib/text";

export function AgentsDirMissing({ hostPath }: { hostPath: string }) {
  const navigate = useNavigate();
  const [rescanning, setRescanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRescan() {
    setRescanning(true);
    setErrorMessage(null);
    try {
      const registry = await apiPost<Registry>("/api/registry/rescan");
      snapshotStore.setRegistry(registry);
    } catch (error) {
      // client.ts가 모든 예외를 `ApiError`로 정규화한다. 알 수 없는 오류 문구는
      // conventions.md §4 MUST의 공통 문구 하나만 쓴다.
      const message = error instanceof ApiError ? error.message : UNKNOWN_ERROR_MESSAGE;
      setErrorMessage(rescanFailedMessage(message));
    } finally {
      setRescanning(false);
    }
  }

  return (
    <div className="h-full rounded-card border border-dashed border-danger-border bg-card p-card flex flex-col gap-2 justify-center">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="inline-block h-4 w-4 rounded-badge border border-dashed border-danger" />
        <p className="text-section font-semibold text-text">{AGENTS_DIR_MISSING_TITLE}</p>
      </div>
      <MonoText className="text-aux">{agentsDirMissingPath(hostPath)}</MonoText>
      <p className="text-aux text-text-secondary">{AGENTS_DIR_MISSING_BODY_1}</p>
      <p className="text-aux text-text-secondary">{AGENTS_DIR_MISSING_BODY_2}</p>
      {errorMessage ? <p className="text-aux text-danger">{errorMessage}</p> : null}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={handleRescan} disabled={rescanning}>
          {rescanning ? RESCAN_BUTTON_LOADING_LABEL : RESCAN_BUTTON_LABEL}
        </Button>
        <Button variant="primary" size="sm" onClick={() => navigate("/settings")}>
          {OPEN_SETTINGS_BUTTON_LABEL}
        </Button>
      </div>
    </div>
  );
}
