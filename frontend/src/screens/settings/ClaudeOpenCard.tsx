/**
 * ui-spec.md SCR-07 카드 2 `Claude 열기`. FR-013-AC5(두 명령 표시) · FR-014-AC5(명령 복사) ·
 * FR-013-AC10(`테스트로 열기` 비활성 조건).
 *
 * `팀장으로 열기` 행은 `settings.leadSessionCommandTemplate` 값을 가공 없이 보여준다. 값에 든
 * `<팀장 name>`은 서버가 준 템플릿 문자열의 일부이며 ADR-33 (a)의 유일한 괄호 노출 사례다
 * (FR-013-AC2 확정 문구) — 프론트가 지우거나 치환하지 않는다.
 *
 * 도우미 상태(`GET /health`)와 `테스트로 열기`의 실제 호출(`POST /open`)은 T-021 범위다.
 * 이 카드는 상태를 prop으로 받아 표시만 하고, 호출할 수 있는 상태(`installed` + `onTestOpen`)가
 * 아니면 버튼을 비활성으로 둔다 — 눌러도 아무 일이 없는 활성 버튼을 만들지 않는다(ui-rules 2).
 */
import type { Settings } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { MonoText } from "../../components/ui/MonoText";
import { StatusDot } from "../../components/ui/StatusDot";
import { formatHms } from "../../lib/format/time";
import {
  HELPER_MISSING_REASON,
  SETTINGS_CLAUDE_CARD_DESCRIPTION,
  SETTINGS_CLAUDE_CARD_TITLE,
  SETTINGS_COPY_COMMAND_LABEL,
  SETTINGS_HELPER_CHECKING_TEXT,
  SETTINGS_HELPER_MISSING_TEXT,
  SETTINGS_HELPER_NO_TOKEN_TEXT,
  SETTINGS_LEAD_SESSION_HINT,
  SETTINGS_ROW_DEFAULT_SESSION,
  SETTINGS_ROW_HELPER,
  SETTINGS_ROW_LEAD_SESSION,
  SETTINGS_ROW_TERMINAL_APP,
  SETTINGS_TEST_OPEN_BUTTON_LABEL,
  settingsHelperInstalledText,
} from "../../lib/text";
import type { HelperStatus } from "./helperStatus";
import { SettingsCard } from "./SettingsCard";
import { SettingsRow } from "./SettingsRow";

interface ClaudeOpenCardProps {
  /** `GET /api/settings` 응답. 아직 못 받았으면 null(값 행은 스켈레톤). */
  settings: Settings | null;
  loadErrorMessage: string | null;
  helperStatus: HelperStatus;
  /** 도우미 `POST /open {target:'default'}`. T-021이 넘긴다. */
  onTestOpen?: () => void;
}

export function ClaudeOpenCard({
  settings,
  loadErrorMessage,
  helperStatus,
  onTestOpen,
}: ClaudeOpenCardProps) {
  const loading = settings === null;
  const canTestOpen = helperStatus.kind === "installed" && onTestOpen !== undefined;
  const helperUnavailable = helperStatus.kind === "missing" || helperStatus.kind === "no-token";

  return (
    <SettingsCard title={SETTINGS_CLAUDE_CARD_TITLE}>
      <p className="text-body text-text-secondary">{SETTINGS_CLAUDE_CARD_DESCRIPTION}</p>

      {loadErrorMessage === null ? (
        <div className="flex flex-col gap-2.5">
          <SettingsRow label={SETTINGS_ROW_TERMINAL_APP} testId="settings-row-terminal-app" loading={loading}>
            {settings?.terminalApp}
          </SettingsRow>
          <SettingsRow label={SETTINGS_ROW_DEFAULT_SESSION} testId="settings-row-default-session" loading={loading}>
            <MonoText>{settings?.defaultSessionCommand}</MonoText>
          </SettingsRow>
          <SettingsRow
            label={SETTINGS_ROW_LEAD_SESSION}
            testId="settings-row-lead-session"
            loading={loading}
            hint={SETTINGS_LEAD_SESSION_HINT}
          >
            <MonoText>{settings?.leadSessionCommandTemplate}</MonoText>
          </SettingsRow>
          <SettingsRow label={SETTINGS_ROW_HELPER} testId="settings-row-helper">
            <HelperStatusText status={helperStatus} />
          </SettingsRow>
        </div>
      ) : (
        <p className="text-body text-danger">{loadErrorMessage}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="terminal"
          size="sm"
          disabled={!canTestOpen}
          disabledReason={helperUnavailable ? HELPER_MISSING_REASON : undefined}
          onClick={canTestOpen ? onTestOpen : undefined}
        >
          {SETTINGS_TEST_OPEN_BUTTON_LABEL}
        </Button>
        <CopyButton value={settings?.defaultSessionCommand ?? null} label={SETTINGS_COPY_COMMAND_LABEL} />
      </div>
    </SettingsCard>
  );
}

function HelperStatusText({ status }: { status: HelperStatus }) {
  if (status.kind === "checking") {
    return <>{SETTINGS_HELPER_CHECKING_TEXT}</>;
  }
  if (status.kind === "installed") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <StatusDot status="running" />
        {settingsHelperInstalledText(formatHms(status.checkedAt))}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot status="idle" />
      {status.kind === "no-token" ? SETTINGS_HELPER_NO_TOKEN_TEXT : SETTINGS_HELPER_MISSING_TEXT}
    </span>
  );
}
