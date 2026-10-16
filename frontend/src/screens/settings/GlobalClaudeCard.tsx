/**
 * ui-spec.md SCR-07 카드 `전역 Claude 설정 연결`(`07-7`, v1.2.0, ADR-79). 읽기 전용 표시뿐이다(FR-014-AC7).
 * 항목·쓰는 곳은 정적이고 순서가 고정이다. 상태 = `settings.globalClaude.items[key].connected`:
 * 연결됨 `연결됨 · 읽기 전용`(중립 점), 연결 안 됨 `연결 안 됨`(빨강). 연결 방법 안내는 항상 보인다.
 */
import type { Settings } from "../../api/types";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatusDot } from "../../components/ui/StatusDot";
import {
  EMPTY_VALUE_TEXT,
  SETTINGS_GLOBAL_CARD_TITLE,
  SETTINGS_GLOBAL_CONNECTED_TEXT,
  SETTINGS_GLOBAL_DESC,
  SETTINGS_GLOBAL_DISCONNECTED_TEXT,
  SETTINGS_GLOBAL_HEAD_ITEM,
  SETTINGS_GLOBAL_HEAD_STATUS,
  SETTINGS_GLOBAL_HEAD_USE,
  SETTINGS_GLOBAL_HOW_ENV,
  SETTINGS_GLOBAL_HOW_LEAD,
  SETTINGS_GLOBAL_HOW_TAIL,
  SETTINGS_GLOBAL_ITEMS,
  SETTINGS_READ_ONLY_BADGE,
} from "../../lib/text";
import { Mono, NoteBox, SettingsCard } from "./SettingsParts";

interface GlobalClaudeCardProps {
  settings: Settings | null;
  loadFailed: boolean;
}

export function GlobalClaudeCard({ settings, loadFailed }: GlobalClaudeCardProps) {
  const loading = settings === null && !loadFailed;

  return (
    <SettingsCard
      title={SETTINGS_GLOBAL_CARD_TITLE}
      wf="07-7"
      badge={SETTINGS_READ_ONLY_BADGE}
      orderClass="portrait:order-5"
    >
      <p className="text-text-muted">{SETTINGS_GLOBAL_DESC}</p>

      <div className="gl7-grid text-aux">
        <span className="font-semibold text-text-muted">{SETTINGS_GLOBAL_HEAD_ITEM}</span>
        <span className="font-semibold text-text-muted">{SETTINGS_GLOBAL_HEAD_USE}</span>
        <span className="font-semibold text-text-muted">{SETTINGS_GLOBAL_HEAD_STATUS}</span>
        {SETTINGS_GLOBAL_ITEMS.map((item) => {
          const connected =
            settings === null ? null : settings.globalClaude.items.find((entry) => entry.key === item.key)?.connected ?? false;
          return (
            <GlobalRow key={item.key} path={item.path} use={item.use} connected={connected} loading={loading} />
          );
        })}
      </div>

      <NoteBox>
        {SETTINGS_GLOBAL_HOW_LEAD}
        <Mono>{SETTINGS_GLOBAL_HOW_ENV}</Mono>
        {SETTINGS_GLOBAL_HOW_TAIL}
      </NoteBox>
    </SettingsCard>
  );
}

function GlobalRow({
  path,
  use,
  connected,
  loading,
}: {
  path: string;
  use: string;
  connected: boolean | null;
  loading: boolean;
}) {
  return (
    <>
      <Mono>{path}</Mono>
      <span className="text-text-secondary">{use}</span>
      {loading ? (
        <Skeleton className="h-4 w-28" aria-label={`${path} 상태 로딩 중`} />
      ) : connected === null ? (
        <span className="text-text-muted">{EMPTY_VALUE_TEXT}</span>
      ) : connected ? (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-text-secondary">
          <StatusDot status="idle" />
          {SETTINGS_GLOBAL_CONNECTED_TEXT}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-danger">
          <StatusDot status="danger" />
          {SETTINGS_GLOBAL_DISCONNECTED_TEXT}
        </span>
      )}
    </>
  );
}
