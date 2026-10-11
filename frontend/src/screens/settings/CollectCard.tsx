/**
 * ui-spec.md SCR-07 카드 `수집`(`07-5`). FR-014-AC1(설정 파일은 화면에서 편집하지 않고 복사만) ·
 * FR-014-AC2(설정 예시 복사 = `settings.hookSettingsExample`) · FR-014-AC3(hook 설정 여부) ·
 * ADR-74(`allowedHttpHookUrlsNote` 한 줄).
 */
import type { Settings } from "../../api/types";
import { CopyButton } from "../../components/ui/CopyButton";
import { StatusLabel } from "../../components/ui/StatusLabel";
import {
  EMPTY_VALUE_TEXT,
  MIDDLE_DOT_SEPARATOR,
  SETTINGS_COLLECT_CARD_TITLE,
  SETTINGS_COLLECT_COPY_NOTE,
  SETTINGS_COPY_HOOK_EXAMPLE_LABEL,
  SETTINGS_HOOK_CONFIGURED_TEXT,
  SETTINGS_HOOK_MISSING_TEXT,
  SETTINGS_HOOK_SETTINGS_PATH,
  SETTINGS_RETENTION_SUFFIX,
  SETTINGS_ROW_COLLECT_URL,
  SETTINGS_ROW_HOOK,
  SETTINGS_ROW_RETENTION,
  SETTINGS_ROW_TEAMS,
  SETTINGS_ROW_TRASH,
  SETTINGS_TEAMS_NOTE,
  SETTINGS_TRASH_NOTE,
} from "../../lib/text";
import { CardActions, KvRow, KvTable, Mono, Reason, SettingsCard } from "./SettingsParts";

interface CollectCardProps {
  settings: Settings | null;
  /** SSE `registry`까지 반영한 hook 설정 여부(FR-014-AC3). 로딩 중이면 null. */
  hookConfigured: boolean | null;
  /** `GET /api/settings`가 실패했으면 true: 값 행은 `-`로 두고 복사 버튼은 비활성이다. */
  loadFailed: boolean;
}

export function CollectCard({ settings, hookConfigured, loadFailed }: CollectCardProps) {
  const loading = settings === null && !loadFailed;
  const text = (value: string | undefined) => (value === undefined ? EMPTY_VALUE_TEXT : value);

  return (
    <SettingsCard title={SETTINGS_COLLECT_CARD_TITLE} wf="07-5">
      <KvTable>
        <KvRow label={SETTINGS_ROW_COLLECT_URL} testId="settings-row-collect-url" loading={loading}>
          <Mono>{text(settings?.collectUrl)}</Mono>
        </KvRow>
        <KvRow label={SETTINGS_ROW_HOOK} testId="settings-row-hook" loading={loading}>
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              <Mono>{SETTINGS_HOOK_SETTINGS_PATH}</Mono>
              {MIDDLE_DOT_SEPARATOR}
            </span>
            {hookConfigured === null ? (
              EMPTY_VALUE_TEXT
            ) : hookConfigured ? (
              <StatusLabel status="running" label={SETTINGS_HOOK_CONFIGURED_TEXT} />
            ) : (
              <StatusLabel status="danger" label={SETTINGS_HOOK_MISSING_TEXT} />
            )}
          </span>
        </KvRow>
        <KvRow label={SETTINGS_ROW_TEAMS} testId="settings-row-teams" loading={loading}>
          <Mono>{text(settings?.teamsPath)}</Mono>
          {MIDDLE_DOT_SEPARATOR}
          {SETTINGS_TEAMS_NOTE}
        </KvRow>
        <KvRow label={SETTINGS_ROW_TRASH} testId="settings-row-trash" loading={loading}>
          <Mono>{text(settings?.trashPath)}</Mono>
          {MIDDLE_DOT_SEPARATOR}
          {SETTINGS_TRASH_NOTE}
        </KvRow>
        <KvRow label={SETTINGS_ROW_RETENTION} testId="settings-row-retention" loading={loading}>
          {settings === null ? (
            EMPTY_VALUE_TEXT
          ) : (
            <>
              <Mono>{settings.retentionDays}</Mono>
              {SETTINGS_RETENTION_SUFFIX}
            </>
          )}
        </KvRow>
      </KvTable>

      {/* ADR-74: 서버가 준 한 줄 안내. 줄바꿈하지 않는다. */}
      {settings === null ? null : (
        <p data-testid="settings-hook-note" className="text-aux text-text-muted">
          {settings.allowedHttpHookUrlsNote}
        </p>
      )}

      {/* FR-014-AC1: 화면에서 settings.json을 편집하지 않는다. 복사 버튼만 둔다. */}
      <CardActions>
        <Reason>{SETTINGS_COLLECT_COPY_NOTE}</Reason>
        <CopyButton value={settings === null ? null : settings.hookSettingsExample} label={SETTINGS_COPY_HOOK_EXAMPLE_LABEL} />
      </CardActions>
    </SettingsCard>
  );
}
