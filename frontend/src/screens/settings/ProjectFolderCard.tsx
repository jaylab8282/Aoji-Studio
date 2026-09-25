/**
 * ui-spec.md SCR-07 카드 1 `프로젝트 폴더`(읽기 전용).
 * FR-001-AC4(다시 읽기) · FR-001-AC5(경로는 읽기 전용 텍스트, 입력 요소 없음) ·
 * FR-001-E1(agentsDirMissing → 본문을 04-5로 대체) · FR-001-E2(쓰기 권한 없음) · FR-014-AC4(맥북 경로).
 */
import { useState } from "react";
import { ApiError, apiPost } from "../../api/client";
import type { Registry } from "../../api/types";
import { AgentsDirMissing } from "../../components/ui/AgentsDirMissing";
import { Button } from "../../components/ui/Button";
import { MonoText } from "../../components/ui/MonoText";
import type { SettingsDisplayValues } from "../../lib/derive/settingsValues";
import {
  EMPTY_VALUE_TEXT,
  MIDDLE_DOT_SEPARATOR,
  RESCAN_BUTTON_LABEL,
  RESCAN_BUTTON_LOADING_LABEL,
  SETTINGS_AGENTS_PATH,
  SETTINGS_FORMAT_ERRORS_NONE_TEXT,
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
  settingsAgentsNote,
  settingsFormatErrorsValue,
  settingsSkillsNote,
} from "../../lib/text";
import { snapshotStore } from "../../state/snapshotStore";
import { SettingsCard } from "./SettingsCard";
import { SettingsRow } from "./SettingsRow";

interface ProjectFolderCardProps {
  /** `GET /api/settings` + SSE `registry` 병합 값. 아직 못 받았으면 null(행은 스켈레톤). */
  values: SettingsDisplayValues | null;
  /** `GET /api/settings` 실패 시 `ApiError.message`(conventions.md §4 MUST: 가공 없이 표시). */
  loadErrorMessage: string | null;
}

export function ProjectFolderCard({ values, loadErrorMessage }: ProjectFolderCardProps) {
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

  return (
    <SettingsCard title={SETTINGS_PROJECT_CARD_TITLE} badge={SETTINGS_READ_ONLY_BADGE}>
      {loadErrorMessage === null ? null : <p className="text-body text-danger">{loadErrorMessage}</p>}

      {values !== null && values.agentsDirMissing ? (
        <AgentsDirMissing hostPath={values.hostPath} />
      ) : (
        <>
          {loadErrorMessage === null ? (
            <ValueRows values={values} />
          ) : null}
          <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
            <p className="text-aux text-text-faint">{SETTINGS_PROJECT_FOOTNOTE}</p>
            <Button variant="secondary" size="sm" onClick={handleRescan} disabled={rescanning}>
              {rescanning ? RESCAN_BUTTON_LOADING_LABEL : RESCAN_BUTTON_LABEL}
            </Button>
          </div>
          {rescanErrorMessage === null ? null : (
            <p className="text-aux text-danger">{rescanErrorMessage}</p>
          )}
        </>
      )}
    </SettingsCard>
  );
}

function ValueRows({ values }: { values: SettingsDisplayValues | null }) {
  const loading = values === null;

  return (
    <div className="flex flex-col gap-2.5">
      {/* FR-001-AC5·FR-014-AC4: 맥북 경로를 읽기 전용 텍스트로만 보여준다(입력 요소 없음). */}
      <SettingsRow label={SETTINGS_ROW_MOUNT_PATH} testId="settings-row-mount-path" loading={loading}>
        <MonoText>{values?.hostPath}</MonoText>
      </SettingsRow>
      <SettingsRow label={SETTINGS_ROW_AGENTS} testId="settings-row-agents" loading={loading}>
        <MonoText>{SETTINGS_AGENTS_PATH}</MonoText>
        {MIDDLE_DOT_SEPARATOR}
        {values === null || values.agentCount === null
          ? EMPTY_VALUE_TEXT
          : settingsAgentsNote(values.agentCount)}
      </SettingsRow>
      <SettingsRow label={SETTINGS_ROW_SKILLS} testId="settings-row-skills" loading={loading}>
        <MonoText>{SETTINGS_SKILLS_PATH}</MonoText>
        {MIDDLE_DOT_SEPARATOR}
        {values === null ? null : settingsSkillsNote(values.skillCount)}
      </SettingsRow>
      <SettingsRow label={SETTINGS_ROW_WRITABLE} testId="settings-row-writable" loading={loading}>
        {values === null ? null : values.writable ? (
          SETTINGS_WRITABLE_TRUE_TEXT
        ) : (
          <span className="text-danger">{SETTINGS_WRITABLE_FALSE_TEXT}</span>
        )}
      </SettingsRow>
      <SettingsRow label={SETTINGS_ROW_FORMAT_ERRORS} testId="settings-row-format-errors" loading={loading}>
        {values === null ? null : values.formatErrorCount > 0 ? (
          <span className="text-danger">{settingsFormatErrorsValue(values.formatErrorCount)}</span>
        ) : (
          SETTINGS_FORMAT_ERRORS_NONE_TEXT
        )}
      </SettingsRow>
    </div>
  );
}
