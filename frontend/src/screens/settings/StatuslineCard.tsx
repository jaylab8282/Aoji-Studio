/**
 * ui-spec.md SCR-07 카드 `상태줄 연동`(`07-6`, v1.2.0). FR-014-AC6(설정 예시 = 서버 값 그대로, 복사만) ·
 * FR-027-E1(`받은 적 없음`) · FR-014-AC7(입력 요소 없음, 웹은 쓰지 않는다).
 *
 * 예시의 `<쓰던 상태줄 명령>`은 서버가 준 문자열의 일부이며 ADR-33의 예외다 — 지우거나 치환하지 않는다.
 * `N분 전`은 화면에 떠 있는 동안 맞도록 `useNow`로 현재 시각을 갱신한다(서버 조회와 무관).
 */
import type { Settings } from "../../api/types";
import { CopyButton } from "../../components/ui/CopyButton";
import { formatHms } from "../../lib/format/time";
import {
  EMPTY_VALUE_TEXT,
  MIDDLE_DOT_SEPARATOR,
  SETTINGS_COPY_HOOK_EXAMPLE_LABEL,
  SETTINGS_ROW_STATUSLINE_EXAMPLE,
  SETTINGS_ROW_STATUSLINE_PREVIOUS,
  SETTINGS_ROW_STATUSLINE_RECEIVED,
  SETTINGS_STATUSLINE_CARD_TITLE,
  SETTINGS_STATUSLINE_CLI_NOTE,
  SETTINGS_STATUSLINE_COPY_NOTE,
  SETTINGS_STATUSLINE_DESC,
  SETTINGS_STATUSLINE_NEVER_RECEIVED,
  SETTINGS_STATUSLINE_PLACEHOLDER,
  SETTINGS_STATUSLINE_PREVIOUS_LEAD,
  SETTINGS_STATUSLINE_PREVIOUS_TAIL,
  settingsMinutesAgo,
} from "../../lib/text";
import { useNow } from "../cost/useNow";
import { CardActions, KvRow, KvTable, Mono, NoteBox, Reason, SettingsCard } from "./SettingsParts";

interface StatuslineCardProps {
  settings: Settings | null;
  /** `GET /api/settings`가 실패했으면 true: 값 행은 `-`로 두고 복사 버튼은 비활성이다. */
  loadFailed: boolean;
}

export function StatuslineCard({ settings, loadFailed }: StatuslineCardProps) {
  const now = useNow();
  const loading = settings === null && !loadFailed;
  const received = settings === null ? null : settings.statusline.lastReceivedAt;

  return (
    <SettingsCard title={SETTINGS_STATUSLINE_CARD_TITLE} wf="07-6" orderClass="portrait:order-4">
      <p className="text-text-muted">{SETTINGS_STATUSLINE_DESC}</p>

      <KvTable>
        <KvRow label={SETTINGS_ROW_STATUSLINE_EXAMPLE} testId="settings-row-statusline-example" loading={loading}>
          {settings === null ? (
            EMPTY_VALUE_TEXT
          ) : (
            <pre className="m-0 whitespace-pre-wrap rounded-chip bg-inset px-3 py-2 font-mono text-aux wrap-anywhere text-text-mono">
              {settings.statusline.settingsExample}
            </pre>
          )}
        </KvRow>
        <KvRow label={SETTINGS_ROW_STATUSLINE_RECEIVED} testId="settings-row-statusline-received" loading={loading}>
          {settings === null ? (
            EMPTY_VALUE_TEXT
          ) : received === null ? (
            <span className="text-text-muted">{SETTINGS_STATUSLINE_NEVER_RECEIVED}</span>
          ) : (
            <>
              <Mono>{formatHms(received)}</Mono>
              {MIDDLE_DOT_SEPARATOR}
              {settingsMinutesAgo(Math.max(0, Math.floor((now.getTime() - new Date(received).getTime()) / 60_000)))}
            </>
          )}
        </KvRow>
        <KvRow label={SETTINGS_ROW_STATUSLINE_PREVIOUS} testId="settings-row-statusline-previous">
          <span className="text-aux text-text-muted">
            {SETTINGS_STATUSLINE_PREVIOUS_LEAD}
            <Mono>{SETTINGS_STATUSLINE_PLACEHOLDER}</Mono>
            {SETTINGS_STATUSLINE_PREVIOUS_TAIL}
          </span>
        </KvRow>
      </KvTable>

      <NoteBox>{SETTINGS_STATUSLINE_CLI_NOTE}</NoteBox>

      <CardActions>
        <Reason>{SETTINGS_STATUSLINE_COPY_NOTE}</Reason>
        <CopyButton
          value={settings === null ? null : settings.statusline.settingsExample}
          label={SETTINGS_COPY_HOOK_EXAMPLE_LABEL}
        />
      </CardActions>
    </SettingsCard>
  );
}
