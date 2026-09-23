/**
 * ui-spec.md SCR-03 오른쪽 선택 패널(360px): 제목 → name·경로 → 상태 표 → 최근 이벤트 →
 * `정의 수정`·`제거` → 각주 두 줄. FR-007-AC4·AC5·AC6·AC7, FR-011-AC5, FR-012-AC6, FR-001-E2.
 *
 * 04-4 표시 중에는 `상태`·`현재 도구`만 대기로 고정하고 세션 시작·서브에이전트·작업 폴더는 값 그대로다(ADR-17).
 * 수정·제거 버튼의 비활성 판정은 표시 상태가 아니라 실제 `live` 상태를 쓴다 — 서버가 `AGENT_BUSY`로
 * 막는 조건과 같아야 하고, ADR-17의 고정 범위는 표시 요소(캐릭터·상태 글자·패널 상태·현재 도구)뿐이다.
 */
import { useEffect, useRef, type ReactNode } from "react";
import type { AgentDef, AgentLive, Live, Registry } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { MonoText } from "../../components/ui/MonoText";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatusLabel } from "../../components/ui/StatusLabel";
import { displayStatus } from "../../lib/derive/collectorDown";
import { pathSummary } from "../../lib/derive/pathSummary";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import { ellipsis } from "../../lib/format/ellipsis";
import { formatHm, formatHms } from "../../lib/format/time";
import {
  EDIT_AGENT_BUSY_REASON,
  EDIT_AGENT_BUTTON_LABEL,
  EMPTY_VALUE_TEXT,
  LEAD_BADGE_TEXT,
  PANEL_FOOTNOTE_TERMINAL_EMPHASIS,
  PANEL_FOOTNOTE_TERMINAL_PREFIX,
  PANEL_FOOTNOTE_TERMINAL_SUFFIX,
  PANEL_FOOTNOTE_TRASH,
  PANEL_NO_AGENT_TEXT,
  PANEL_RECENT_EVENTS_EMPTY,
  PANEL_RECENT_EVENTS_ERROR,
  PANEL_RECENT_EVENTS_TITLE,
  PANEL_ROW_CHILD_COUNT,
  PANEL_ROW_CURRENT_TOOL,
  PANEL_ROW_CWD,
  PANEL_ROW_SESSION_STARTED,
  PANEL_ROW_STATUS,
  PANEL_SUBTITLE,
  PANEL_TITLE,
  REMOVE_AGENT_BUSY_REASON,
  REMOVE_AGENT_BUTTON_LABEL,
  RETRY_BUTTON_LABEL,
  WRITABLE_FALSE_REASON,
  FLOOR_NO_LEAD_TEXT,
  currentToolLabel,
  leadAgentCommand,
} from "../../lib/text";
import { agentEventsStore, useAgentEventsStore } from "../../state/agentEventsStore";
import { useConnectionStore } from "../../state/connectionStore";

const EVENTS_SKELETON_ROWS = 4;

interface PanelProps {
  selectedName: string | null;
  registry: Registry;
  live: Live;
  hostPath: string;
  lead: string | null;
  /** 04-4 표시 중이면 `상태`·`현재 도구`만 대기로 고정한다(ADR-17). */
  collectorDown: boolean;
}

export function Panel({ selectedName, registry, live, hostPath, lead, collectorDown }: PanelProps) {
  return (
    <aside className="flex h-full w-panel shrink-0 flex-col rounded-card border border-border bg-card">
      <div className="flex items-baseline gap-3 border-b border-border px-card py-3">
        <h2 className="text-section font-semibold text-text">{PANEL_TITLE}</h2>
        <p className="text-aux text-text-muted">{PANEL_SUBTITLE}</p>
      </div>

      {selectedName === null ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-card py-4">
          <p className="text-body text-text-secondary">{PANEL_NO_AGENT_TEXT}</p>
        </div>
      ) : (
        <PanelBody
          selectedName={selectedName}
          agentDef={registry.agents.find((agent) => agent.name === selectedName)}
          agentLive={live.agents[selectedName]}
          collectorDown={collectorDown}
          writable={registry.writable}
          hostPath={hostPath}
          isLead={lead === selectedName}
        />
      )}

      <div className="flex flex-col gap-2 border-t border-border px-card py-4">
        <p className="text-aux text-text-faint">{PANEL_FOOTNOTE_TRASH}</p>
        <p className="text-aux text-text-faint">
          {PANEL_FOOTNOTE_TERMINAL_PREFIX}
          <span className="font-semibold text-running">{PANEL_FOOTNOTE_TERMINAL_EMPHASIS}</span>
          {PANEL_FOOTNOTE_TERMINAL_SUFFIX}
          {lead === null ? FLOOR_NO_LEAD_TEXT : <MonoText>{leadAgentCommand(lead)}</MonoText>}
        </p>
      </div>
    </aside>
  );
}

interface PanelBodyProps {
  selectedName: string;
  agentDef: AgentDef | undefined;
  agentLive: AgentLive | undefined;
  collectorDown: boolean;
  writable: boolean;
  hostPath: string;
  isLead: boolean;
}

function PanelBody({
  selectedName,
  agentDef,
  agentLive,
  collectorDown,
  writable,
  hostPath,
  isLead,
}: PanelBodyProps) {
  const openDialog = useDialogNavigate();
  const liveStatus = agentLive?.status ?? "idle";
  const shownStatus = displayStatus(liveStatus, collectorDown);
  const tool = collectorDown ? null : (agentLive?.currentTool ?? null);
  const cwd = agentLive?.cwd ?? null;

  const busyEditReason = liveStatus === "idle" ? undefined : EDIT_AGENT_BUSY_REASON;
  const busyRemoveReason = liveStatus === "idle" ? undefined : REMOVE_AGENT_BUSY_REASON;
  const editReason = writable ? busyEditReason : WRITABLE_FALSE_REASON;
  const removeReason = writable ? busyRemoveReason : WRITABLE_FALSE_REASON;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-card py-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 className="font-mono text-section font-bold text-text" title={selectedName}>
            {ellipsis(selectedName)}
          </h3>
          {isLead ? (
            <span className="rounded-badge bg-running px-1.5 py-0.5 text-min font-semibold text-on-accent">
              {LEAD_BADGE_TEXT}
            </span>
          ) : null}
        </div>
        {agentDef === undefined ? null : (
          <MonoText className="text-aux text-text-faint">{agentDef.filePath}</MonoText>
        )}
      </div>

      <dl className="flex flex-col gap-2">
        <PanelRow label={PANEL_ROW_STATUS}>
          <StatusLabel status={shownStatus} />
        </PanelRow>
        <PanelRow label={PANEL_ROW_CURRENT_TOOL}>
          <MonoText title={tool === null ? undefined : currentToolLabel(tool.name, tool.target)}>
            {currentToolLabel(tool?.name ?? null, tool?.target ?? null)}
          </MonoText>
        </PanelRow>
        <PanelRow label={PANEL_ROW_SESSION_STARTED}>
          <MonoText>
            {agentLive?.sessionStartedAt ? formatHms(agentLive.sessionStartedAt) : EMPTY_VALUE_TEXT}
          </MonoText>
        </PanelRow>
        <PanelRow label={PANEL_ROW_CHILD_COUNT}>
          <MonoText>{agentLive?.childCount ?? 0}</MonoText>
        </PanelRow>
        <PanelRow label={PANEL_ROW_CWD}>
          <MonoText title={cwd ?? undefined}>{cwd === null ? EMPTY_VALUE_TEXT : pathSummary(cwd, hostPath)}</MonoText>
        </PanelRow>
      </dl>

      <RecentEvents selectedName={selectedName} />

      {/* 비활성 사유가 붙으면 360px 패널 한 줄에 버튼 둘 + 사유 둘이 들어가지 않는다.
          사유가 있을 때만 세로로 쌓아 글자가 겹치지 않게 한다(ui-rules.md 2, docs/ui/README.md 요소 가림 금지). */}
      {editReason === undefined && removeReason === undefined ? (
        <div className="mt-auto flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Button
              variant="primary"
              fullWidth
              onClick={() => openDialog({ dialog: "agent-edit", agent: selectedName })}
            >
              {EDIT_AGENT_BUTTON_LABEL}
            </Button>
          </div>
          <Button
            variant="danger"
            onClick={() => openDialog({ dialog: "agent-remove", agent: selectedName })}
          >
            {REMOVE_AGENT_BUTTON_LABEL}
          </Button>
        </div>
      ) : (
        <div className="mt-auto flex flex-col items-start gap-2">
          <Button variant="primary" disabledReason={editReason}>
            {EDIT_AGENT_BUTTON_LABEL}
          </Button>
          <Button variant="danger" disabledReason={removeReason}>
            {REMOVE_AGENT_BUTTON_LABEL}
          </Button>
        </div>
      )}
    </div>
  );
}

function PanelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <dt className="w-24 shrink-0 text-body text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-body text-text">{children}</dd>
    </div>
  );
}

/** FR-007-AC6: 선택 변경·재연결 시 `GET /api/agents/{name}/events?limit=10`, SSE `event`는 스토어가 prepend. */
function RecentEvents({ selectedName }: { selectedName: string }) {
  const { status, items, agentName } = useAgentEventsStore();
  const connection = useConnectionStore();
  const previousConnection = useRef(connection.state);

  useEffect(() => {
    void agentEventsStore.load(selectedName);
  }, [selectedName]);

  useEffect(() => {
    const previous = previousConnection.current;
    previousConnection.current = connection.state;
    if (connection.state === "connected" && previous !== "connected") {
      void agentEventsStore.load(selectedName);
    }
  }, [connection.state, selectedName]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <h4 className="text-section font-semibold text-text">{PANEL_RECENT_EVENTS_TITLE}</h4>
      {status === "loading" || agentName !== selectedName ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: EVENTS_SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-4 w-full" aria-label="최근 이벤트 로딩 중" />
          ))}
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-body text-text-secondary">{PANEL_RECENT_EVENTS_ERROR}</p>
          <Button variant="secondary" size="sm" onClick={() => void agentEventsStore.load(selectedName)}>
            {RETRY_BUTTON_LABEL}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-body text-text-secondary">{PANEL_RECENT_EVENTS_EMPTY}</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
          {items.map((event) => (
            <li key={event.id} className="flex items-baseline gap-2">
              <MonoText className="shrink-0 text-aux text-text-faint">{formatHm(event.at)}</MonoText>
              <span className="min-w-0 truncate text-body text-text-secondary">{event.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
