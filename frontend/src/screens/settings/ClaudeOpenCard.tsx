/**
 * ui-spec.md SCR-07 카드 `Claude 열기`(`07-4`). FR-013-AC5(두 명령 표시) · FR-014-AC5(명령 복사) ·
 * FR-013-AC10(`테스트로 열기` 비활성 조건).
 *
 * `팀장으로 열기` 행은 `settings.leadSessionCommandTemplate` 값을 가공 없이 보여준다. 값에 든
 * `<팀장 name>`은 서버가 준 템플릿 문자열의 일부이며 ADR-33의 유일한 괄호 노출 사례다 —
 * 프론트가 지우거나 치환하지 않는다.
 *
 * 도우미 상태 확인과 `테스트로 열기`의 실제 호출은 `SettingsScreen`이 한다. 이 카드는 상태를 prop으로
 * 받아 표시만 하고, 호출할 수 있는 상태(`installed` + `onTestOpen`)가 아니면 버튼을 비활성으로 둔다.
 */
import type { Settings } from "../../api/types";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { CommandLine } from "../../components/ui/CommandLine";
import { CopyButton } from "../../components/ui/CopyButton";
import { Icon } from "../../components/ui/Icon";
import { StatusLabel } from "../../components/ui/StatusLabel";
import { helperHostPort } from "../../lib/derive/settingsValues";
import {
  COPY_COMMAND_LABEL,
  EMPTY_VALUE_TEXT,
  HELPER_MISSING_REASON,
  MIDDLE_DOT_SEPARATOR,
  SETTINGS_CLAUDE_CARD_TITLE,
  SETTINGS_CLAUDE_DESC_1,
  SETTINGS_CLAUDE_DESC_2,
  SETTINGS_CLAUDE_DESC_3,
  SETTINGS_CLAUDE_DESC_BTN_1,
  SETTINGS_CLAUDE_DESC_BTN_2,
  SETTINGS_COMMAND_COPY_NOTE,
  SETTINGS_HELPER_CHECKING_TEXT,
  SETTINGS_HELPER_INSTALLED_TEXT,
  SETTINGS_HELPER_MISSING_TEXT,
  SETTINGS_HELPER_NO_TOKEN_TEXT,
  SETTINGS_LEAD_SESSION_HINT,
  SETTINGS_ROW_DEFAULT_SESSION,
  SETTINGS_ROW_HELPER,
  SETTINGS_ROW_LEAD_SESSION,
  SETTINGS_ROW_TERMINAL_APP,
  SETTINGS_TEST_OPEN_BUTTON_LABEL,
} from "../../lib/text";
import type { HelperStatus } from "./helperStatus";
import { CardActions, KvRow, KvTable, Mono, Reason, SettingsCard } from "./SettingsParts";

interface ClaudeOpenCardProps {
  /** `GET /api/settings` 응답. 아직 못 받았으면 null(값 행은 스켈레톤). */
  settings: Settings | null;
  /** `GET /api/settings`가 실패했으면 true: 값 행은 `-`로 두고 값이 필요한 버튼은 비활성이다. */
  loadFailed: boolean;
  helperStatus: HelperStatus;
  /** `테스트로 열기`가 받은 사유(403 확정 문구·도우미 message). 버튼 줄 아래 한 줄로 보여준다. */
  openErrorMessage?: string | null;
  /** 도우미 `POST /open {target:'default'}`. */
  onTestOpen?: () => void;
}

export function ClaudeOpenCard({
  settings,
  loadFailed,
  helperStatus,
  openErrorMessage = null,
  onTestOpen,
}: ClaudeOpenCardProps) {
  const loading = settings === null && !loadFailed;
  const canTestOpen = helperStatus.kind === "installed" && settings !== null && onTestOpen !== undefined;
  const helperUnavailable = helperStatus.kind === "missing" || helperStatus.kind === "no-token";

  return (
    <SettingsCard title={SETTINGS_CLAUDE_CARD_TITLE} wf="07-4">
      <p className="text-text-muted">
        {SETTINGS_CLAUDE_DESC_1}
        <b className="font-semibold text-text">{SETTINGS_CLAUDE_DESC_BTN_1}</b>
        {SETTINGS_CLAUDE_DESC_2}
        <b className="font-semibold text-text">{SETTINGS_CLAUDE_DESC_BTN_2}</b>
        {SETTINGS_CLAUDE_DESC_3}
      </p>

      <KvTable>
        <KvRow label={SETTINGS_ROW_TERMINAL_APP} testId="settings-row-terminal-app" loading={loading}>
          {settings === null ? EMPTY_VALUE_TEXT : settings.terminalApp}
        </KvRow>
        <KvRow label={SETTINGS_ROW_DEFAULT_SESSION} testId="settings-row-default-session" loading={loading}>
          <CommandLine>{settings === null ? EMPTY_VALUE_TEXT : settings.defaultSessionCommand}</CommandLine>
        </KvRow>
        <KvRow label={SETTINGS_ROW_LEAD_SESSION} testId="settings-row-lead-session" loading={loading}>
          <div className="grid gap-1">
            <CommandLine>{settings === null ? EMPTY_VALUE_TEXT : settings.leadSessionCommandTemplate}</CommandLine>
            <span className="text-aux text-text-muted">{SETTINGS_LEAD_SESSION_HINT}</span>
          </div>
        </KvRow>
        <KvRow label={SETTINGS_ROW_HELPER} testId="settings-row-helper">
          <HelperStatusText status={helperStatus} helperUrl={settings === null ? null : settings.helperUrl} />
        </KvRow>
      </KvTable>

      <CardActions>
        <Button
          variant="secondary"
          disabled={!canTestOpen}
          disabledReason={helperUnavailable ? HELPER_MISSING_REASON : undefined}
          onClick={canTestOpen ? onTestOpen : undefined}
        >
          <Icon name="square-terminal" />
          {SETTINGS_TEST_OPEN_BUTTON_LABEL}
        </Button>
        <CopyButton value={settings === null ? null : settings.defaultSessionCommand} label={COPY_COMMAND_LABEL} />
        <Reason>{SETTINGS_COMMAND_COPY_NOTE}</Reason>
      </CardActions>

      {openErrorMessage === null ? null : <Alert message={openErrorMessage} />}
    </SettingsCard>
  );
}

function HelperStatusText({ status, helperUrl }: { status: HelperStatus; helperUrl: string | null }) {
  if (status.kind === "checking") {
    return <>{SETTINGS_HELPER_CHECKING_TEXT}</>;
  }
  if (status.kind === "installed") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <StatusLabel status="running" label={SETTINGS_HELPER_INSTALLED_TEXT} />
        {helperUrl === null ? null : (
          <span>
            {MIDDLE_DOT_SEPARATOR}
            <Mono>{helperHostPort(helperUrl)}</Mono>
          </span>
        )}
      </span>
    );
  }
  return (
    <StatusLabel
      status="danger"
      label={status.kind === "no-token" ? SETTINGS_HELPER_NO_TOKEN_TEXT : SETTINGS_HELPER_MISSING_TEXT}
    />
  );
}
