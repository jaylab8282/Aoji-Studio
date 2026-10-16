/**
 * ui-spec.md SCR-07 카드 `프로젝트 폴더`(`07-3`, 읽기 전용).
 * FR-001-AC4(다시 읽기) · FR-001-AC5(경로는 읽기 전용 텍스트, 입력 요소 없음) ·
 * FR-001-E1(agentsDirMissing → 본문을 04-5로 대체, 07에서는 `설정 열기` 없음 — ADR-42) ·
 * FR-001-E2(쓰기 권한 없음) · FR-014-AC4(맥북 경로).
 */
import { useState } from "react";
import { ApiError, apiPost } from "../../api/client";
import type { Registry } from "../../api/types";
import { Alert } from "../../components/ui/Alert";
import { AgentsDirMissing } from "../../components/ui/AgentsDirMissing";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import type { SettingsDisplayValues } from "../../lib/derive/settingsValues";
import {
  MIDDLE_DOT_SEPARATOR,
  RESCAN_BUTTON_LABEL,
  RESCAN_BUTTON_LOADING_LABEL,
  RETRY_BUTTON_LABEL,
  SETTINGS_AGENTS_COUNT_PREFIX,
  SETTINGS_AGENTS_PATH,
  SETTINGS_COUNT_SUFFIX,
  SETTINGS_FORMAT_ERRORS_PREFIX,
  SETTINGS_PROJECT_CARD_TITLE,
  SETTINGS_PROJECT_FOOTNOTE,
  SETTINGS_READ_ONLY_BADGE,
  SETTINGS_ROW_AGENTS,
  SETTINGS_ROW_FORMAT_ERRORS,
  SETTINGS_ROW_MOUNT_PATH,
  SETTINGS_ROW_SKILLS,
  SETTINGS_ROW_WRITABLE,
  SETTINGS_SKILLS_PATH,
  SETTINGS_WRITABLE_FALSE_TEXT,
  SETTINGS_WRITABLE_TRUE_TEXT,
  UNKNOWN_ERROR_MESSAGE,
  rescanFailedMessage,
} from "../../lib/text";
import { snapshotStore } from "../../state/snapshotStore";
import { CardActions, KvRow, KvTable, Mono, Reason, SettingsCard } from "./SettingsParts";

interface ProjectFolderCardProps {
  /** `GET /api/settings` + SSE `registry` 병합 값. 아직 못 받았으면 null(행은 스켈레톤). */
  values: SettingsDisplayValues | null;
  /** `GET /api/settings` 실패 시 `ApiError.message`(conventions.md §4 MUST: 가공 없이 표시). */
  loadErrorMessage: string | null;
  /** `다시 시도`: `GET /api/settings`를 다시 부른다. */
  onRetry: () => void;
}

export function ProjectFolderCard({ values, loadErrorMessage, onRetry }: ProjectFolderCardProps) {
  const [rescanning, setRescanning] = useState(false);
  const [rescanErrorMessage, setRescanErrorMessage] = useState<string | null>(null);

  async function handleRescan() {
    setRescanning(true);
    setRescanErrorMessage(null);
    try {
      const registry = await apiPost<Registry>("/api/registry/rescan");
      snapshotStore.setRegistry(registry);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : UNKNOWN_ERROR_MESSAGE;
      setRescanErrorMessage(rescanFailedMessage(message));
    } finally {
      setRescanning(false);
    }
  }

  if (values !== null && values.agentsDirMissing) {
    // ADR-42: 07이 `설정 열기`의 도착지 자신이라 이 화면에서는 그리지 않는다(`다시 읽기`만 남는다).
    return (
      <SettingsCard title={SETTINGS_PROJECT_CARD_TITLE} wf="07-3" badge={SETTINGS_READ_ONLY_BADGE} orderClass="portrait:order-1">
        <AgentsDirMissing hostPath={values.hostPath} showOpenSettings={false} />
      </SettingsCard>
    );
  }

  return (
    <SettingsCard title={SETTINGS_PROJECT_CARD_TITLE} wf="07-3" badge={SETTINGS_READ_ONLY_BADGE} orderClass="portrait:order-1">
      {loadErrorMessage === null ? (
        <ValueRows values={values} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <Alert message={loadErrorMessage} />
          </div>
          <Button variant="secondary" onClick={onRetry}>
            {RETRY_BUTTON_LABEL}
          </Button>
        </div>
      )}
      <CardActions>
        <Reason>{SETTINGS_PROJECT_FOOTNOTE}</Reason>
        <Button variant="secondary" onClick={() => void handleRescan()} disabled={rescanning}>
          <Icon name="refresh-cw" />
          {rescanning ? RESCAN_BUTTON_LOADING_LABEL : RESCAN_BUTTON_LABEL}
        </Button>
      </CardActions>
      {rescanErrorMessage === null ? null : <Alert message={rescanErrorMessage} />}
    </SettingsCard>
  );
}

function ValueRows({ values }: { values: SettingsDisplayValues | null }) {
  const loading = values === null;
  const formatErrorCount = values === null ? 0 : values.formatErrorCount;

  return (
    <KvTable>
      {/* FR-001-AC5·FR-014-AC4: 맥북 경로를 읽기 전용 텍스트로만 보여준다(입력 요소 없음). */}
      <KvRow label={SETTINGS_ROW_MOUNT_PATH} testId="settings-row-mount-path" loading={loading}>
        <Mono>{values?.hostPath}</Mono>
      </KvRow>
      <KvRow label={SETTINGS_ROW_AGENTS} testId="settings-row-agents" loading={loading}>
        <Mono>{SETTINGS_AGENTS_PATH}</Mono>
        {MIDDLE_DOT_SEPARATOR}
        {SETTINGS_AGENTS_COUNT_PREFIX} <Mono>{values?.agentCount}</Mono>
        {SETTINGS_COUNT_SUFFIX}
      </KvRow>
      <KvRow label={SETTINGS_ROW_SKILLS} testId="settings-row-skills" loading={loading}>
        <Mono>{SETTINGS_SKILLS_PATH}</Mono>
        {MIDDLE_DOT_SEPARATOR}
        <Mono>{values?.skillCount}</Mono>
        {SETTINGS_COUNT_SUFFIX}
      </KvRow>
      <KvRow label={SETTINGS_ROW_WRITABLE} testId="settings-row-writable" loading={loading}>
        {values === null || values.writable ? (
          SETTINGS_WRITABLE_TRUE_TEXT
        ) : (
          <span className="text-danger">{SETTINGS_WRITABLE_FALSE_TEXT}</span>
        )}
      </KvRow>
      <KvRow label={SETTINGS_ROW_FORMAT_ERRORS} testId="settings-row-format-errors" loading={loading}>
        {formatErrorCount > 0 ? (
          <span className="text-danger">
            {SETTINGS_FORMAT_ERRORS_PREFIX} {formatErrorCount}
            {SETTINGS_COUNT_SUFFIX}
          </span>
        ) : (
          <>
            {SETTINGS_FORMAT_ERRORS_PREFIX} <Mono>{formatErrorCount}</Mono>
            {SETTINGS_COUNT_SUFFIX}
          </>
        )}
      </KvRow>
    </KvTable>
  );
}
