/**
 * ui-spec.md SCR-04-5 에이전트 폴더 읽기 실패 (01 KPI 1·2 자리, 02 캔버스 자리, 07 프로젝트 폴더 카드). `NoticeCard error`(`04-5-1`).
 * `registry.agentsDirMissing === true`일 때 쓴다. FR-001-E1, FR-001-AC4.
 *
 * `설정 열기`는 01·02에서만 그린다(07은 이 버튼의 도착지 자신이라 그리지 않는다 — ADR-42,
 * conventions.md §7 MUST). 표시 여부는 화면이 `showOpenSettings`로 알려준다. 이 공용 컴포넌트는
 * 현재 경로를 스스로 읽거나 비교해 판정하지 않는다(ADR-30 `TopBar`와 같은 층위).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost, ApiError } from "../../api/client";
import { snapshotStore } from "../../state/snapshotStore";
import type { Registry } from "../../api/types";
import { Button } from "./Button";
import { CommandLine } from "./CommandLine";
import { Icon } from "./Icon";
import { NoticeCard } from "./NoticeCard";
import {
  AGENTS_DIR_MISSING_BODY,
  AGENTS_DIR_MISSING_TITLE,
  OPEN_SETTINGS_BUTTON_LABEL,
  RESCAN_BUTTON_LABEL,
  RESCAN_BUTTON_LOADING_LABEL,
  UNKNOWN_ERROR_MESSAGE,
  agentsDirMissingPath,
  rescanFailedMessage,
} from "../../lib/text";

interface AgentsDirMissingProps {
  /** 맥북 기준 마운트 경로(`registry.hostPath`). 본문 경로 줄에 그대로 쓴다. */
  hostPath: string;
  /** `설정 열기` 표시 여부. 기본값 `true`(01·02), 07만 `false`를 넘긴다(ADR-42). */
  showOpenSettings?: boolean;
}

export function AgentsDirMissing({ hostPath, showOpenSettings = true }: AgentsDirMissingProps) {
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
    <NoticeCard
      kind="error"
      icon="folder-x"
      title={AGENTS_DIR_MISSING_TITLE}
      wf="04-5-1"
      actions={
        <>
          <Button variant="secondary" onClick={handleRescan} disabled={rescanning}>
            <Icon name="refresh-cw" />
            {rescanning ? RESCAN_BUTTON_LOADING_LABEL : RESCAN_BUTTON_LABEL}
          </Button>
          {showOpenSettings ? (
            <Button variant="accent" onClick={() => navigate("/settings")}>
              <Icon name="settings" />
              {OPEN_SETTINGS_BUTTON_LABEL}
            </Button>
          ) : null}
        </>
      }
    >
      <CommandLine>{agentsDirMissingPath(hostPath)}</CommandLine>
      <p>{AGENTS_DIR_MISSING_BODY}</p>
      {errorMessage ? <p className="text-danger">{errorMessage}</p> : null}
    </NoticeCard>
  );
}
