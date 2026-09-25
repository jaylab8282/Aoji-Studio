/**
 * ui-spec.md SCR-07 카드 3 `수집`. FR-014-AC1(설정 파일은 화면에서 편집하지 않고 복사만) ·
 * FR-014-AC2(설정 예시 복사 = `settings.hookSettingsExample`) · FR-014-AC3(hook 설정 여부).
 */
import type { Settings } from "../../api/types";
import { CopyButton } from "../../components/ui/CopyButton";
import { MonoText } from "../../components/ui/MonoText";
import { StatusDot } from "../../components/ui/StatusDot";
import {
  MIDDLE_DOT_SEPARATOR,
  SETTINGS_COLLECT_CARD_TITLE,
  SETTINGS_COPY_HOOK_EXAMPLE_LABEL,
  SETTINGS_HOOK_CONFIGURED_TEXT,
  SETTINGS_HOOK_MISSING_TEXT,
  SETTINGS_HOOK_SETTINGS_PATH,
  SETTINGS_ROW_COLLECT_URL,
  SETTINGS_ROW_HOOK,
  SETTINGS_ROW_RETENTION,
  SETTINGS_ROW_TEAMS,
  SETTINGS_ROW_TRASH,
  SETTINGS_TEAMS_NOTE,
  SETTINGS_TRASH_NOTE,
  settingsRetentionValue,
} from "../../lib/text";
import { SettingsCard } from "./SettingsCard";
import { SettingsRow } from "./SettingsRow";

interface CollectCardProps {
  settings: Settings | null;
  /** SSE `registry`까지 반영한 hook 설정 여부(FR-014-AC3). 로딩 중이면 null. */
  hookConfigured: boolean | null;
  loadErrorMessage: string | null;
}

export function CollectCard({ settings, hookConfigured, loadErrorMessage }: CollectCardProps) {
  const loading = settings === null;

  if (loadErrorMessage !== null) {
    return (
      <SettingsCard title={SETTINGS_COLLECT_CARD_TITLE}>
        <p className="text-body text-danger">{loadErrorMessage}</p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard title={SETTINGS_COLLECT_CARD_TITLE}>
      <div className="flex flex-col gap-2.5">
        <SettingsRow label={SETTINGS_ROW_COLLECT_URL} testId="settings-row-collect-url" loading={loading}>
          <MonoText>{settings?.collectUrl}</MonoText>
        </SettingsRow>

        {/* 와이어프레임 p.4: `설정 예시 복사`는 카드 우측 끝이 아니라 hook 설정 값 바로 뒤 인라인이다
            (같은 카드의 `다시 읽기`만 우측 끝). 값 로딩 중에도 버튼은 비활성으로 남아야 하므로
            SettingsRow 안(로딩 시 스켈레톤으로 대체되는 자리)이 아니라 행 옆에 둔다. */}
        <div className="flex items-center gap-4">
          <SettingsRow
            label={SETTINGS_ROW_HOOK}
            testId="settings-row-hook"
            loading={loading || hookConfigured === null}
          >
            <span className="inline-flex items-center gap-1.5">
              <MonoText>{SETTINGS_HOOK_SETTINGS_PATH}</MonoText>
              {MIDDLE_DOT_SEPARATOR}
              <StatusDot status={hookConfigured === true ? "running" : "idle"} />
              {hookConfigured === true ? (
                <span className="text-running">{SETTINGS_HOOK_CONFIGURED_TEXT}</span>
              ) : (
                <span className="text-danger">{SETTINGS_HOOK_MISSING_TEXT}</span>
              )}
            </span>
          </SettingsRow>
          {/* FR-014-AC1: 화면에서 settings.json을 편집하지 않는다. 복사 버튼만 둔다. */}
          <CopyButton
            value={settings?.hookSettingsExample ?? null}
            label={SETTINGS_COPY_HOOK_EXAMPLE_LABEL}
          />
        </div>

        <p className="text-aux text-text-faint">{settings?.allowedHttpHookUrlsNote}</p>

        <SettingsRow label={SETTINGS_ROW_TEAMS} testId="settings-row-teams" loading={loading}>
          <MonoText>{settings?.teamsPath}</MonoText>
          {MIDDLE_DOT_SEPARATOR}
          {SETTINGS_TEAMS_NOTE}
        </SettingsRow>
        <SettingsRow label={SETTINGS_ROW_TRASH} testId="settings-row-trash" loading={loading}>
          <MonoText>{settings?.trashPath}</MonoText>
          {MIDDLE_DOT_SEPARATOR}
          {SETTINGS_TRASH_NOTE}
        </SettingsRow>
        <SettingsRow label={SETTINGS_ROW_RETENTION} testId="settings-row-retention" loading={loading}>
          {settings === null ? null : settingsRetentionValue(settings.retentionDays)}
        </SettingsRow>
      </div>
    </SettingsCard>
  );
}
