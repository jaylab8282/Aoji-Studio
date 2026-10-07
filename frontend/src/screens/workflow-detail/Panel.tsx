/**
 * ui-spec.md SCR-03 선택 패널 (`03-8`·`03-9`): 머리 → 정보(name·경로·값 표) → 최근 이벤트 → 동작 줄(`정의 수정`·`제거`, 사유 한 줄) → 각주.
 * FR-007-AC4·AC5·AC6·AC7, FR-011-AC5, FR-012-AC6, FR-001-E2. 가로형은 오른쪽 열(`w-panel`)에서 최근 이벤트만 안에서 스크롤하고,
 * 세로형은 오피스 바로 아래 전체 폭 2칸(왼쪽 정보 + 동작 / 오른쪽 세로 구분선 뒤 최근 이벤트)이다(ADR-66).
 *
 * 04-4 표시 중에는 `상태`·`현재 도구`만 대기로 고정하고 세션 시작·서브에이전트·작업 폴더·최근 이벤트는 값 그대로다(ADR-68).
 * 수정·제거 버튼의 비활성 판정은 표시 상태가 아니라 실제 `live` 상태를 쓴다 — 서버가 `AGENT_BUSY`로 막는 조건과 같아야 하고,
 * 고정 범위는 표시 요소뿐이다. 그래서 04-4 + 실제 `idle`이면 두 버튼 활성·사유 줄 없음, 실제 작업 중이면 비활성 + 사유(ADR-68).
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import type { AgentDef, AgentLive, Live, Registry, Status } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatusDot } from "../../components/ui/StatusDot";
import { displayStatus } from "../../lib/derive/collectorDown";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import { formatHms } from "../../lib/format/time";
import {
  EDIT_AGENT_BUTTON_LABEL,
  EMPTY_VALUE_TEXT,
  LEAD_BADGE_TEXT,
  PANEL_BUSY_REASON,
  PANEL_FOOTNOTE_LEAD,
  PANEL_FOOTNOTE_TAIL,
  PANEL_FOOTNOTE_TRASH_PATH,
  PANEL_NO_AGENT_TEXT,
  PANEL_RECENT_EVENTS_EMPTY,
  PANEL_RECENT_EVENTS_ERROR,
  PANEL_RECENT_EVENTS_NOTE,
  PANEL_RECENT_EVENTS_TITLE,
  PANEL_ROW_CHILD_COUNT,
  PANEL_ROW_CURRENT_TOOL,
  PANEL_ROW_CWD,
  PANEL_ROW_SESSION_STARTED,
  PANEL_ROW_STATUS,
  PANEL_SUBTITLE,
  PANEL_TITLE,
  REMOVE_AGENT_BUTTON_LABEL,
  RETRY_BUTTON_LABEL,
  STATUS_LABEL_TEXT,
  WRITABLE_FALSE_REASON,
  currentToolLabel,
} from "../../lib/text";
import { agentEventsStore, useAgentEventsStore } from "../../state/agentEventsStore";
import { useConnectionStore } from "../../state/connectionStore";

const EVENTS_SKELETON_ROWS = 4;

const PANEL_CLASSES =
  "flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden rounded-card border border-border bg-card p-4 portrait:grid portrait:grid-cols-2 portrait:gap-x-6 portrait:gap-y-3 portrait:overflow-visible";
const INFO_CLASSES = "flex min-h-0 min-w-0 flex-col gap-2 portrait:col-start-1 portrait:row-start-2";
const EVENTS_CLASSES =
  "flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden border-t border-border pt-3 portrait:col-start-2 portrait:row-span-2 portrait:row-start-2 portrait:border-t-0 portrait:border-l portrait:pt-0 portrait:pl-6";
const ACTIONS_CLASSES =
  "flex min-w-0 flex-none flex-col gap-2 border-t border-border pt-3 portrait:col-start-1 portrait:row-start-3";
const VALUES_CLASSES = "kv-grid text-aux";

const STATUS_VALUE_CLASSES: Record<Status, string> = {
  running: "text-live",
  waiting: "text-waiting",
  idle: "text-text-muted",
};

function PanelFrame({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <aside aria-label={PANEL_TITLE} aria-busy={busy ? true : undefined} data-wf="03-8" className={PANEL_CLASSES}>
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap portrait:col-span-full">
        <h2 className="text-section font-semibold text-text">{PANEL_TITLE}</h2>
        <p className="min-w-0 truncate text-aux text-text-muted">{PANEL_SUBTITLE}</p>
      </div>
      {children}
    </aside>
  );
}

/** 값 표 한 줄: 라벨(`text-muted`) + 값(`text-secondary`, 줄바꿈 허용). 고정폭 값은 `mono`. */
function ValueRow({ label, mono = false, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className={`min-w-0 wrap-anywhere ${mono ? "font-mono text-text-mono" : "text-text-secondary"}`}>
        {children}
      </dd>
    </>
  );
}

function Footnote() {
  return (
    <span data-testid="panel-footnote" className="text-aux text-text-muted">
      {PANEL_FOOTNOTE_LEAD}
      <span className="font-mono text-text-mono">{PANEL_FOOTNOTE_TRASH_PATH}</span>
      {PANEL_FOOTNOTE_TAIL}
    </span>
  );
}

interface PanelProps {
  selectedName: string | null;
  registry: Registry;
  live: Live;
  lead: string | null;
  /** 04-4 표시 중이면 `상태`·`현재 도구`만 대기로 고정한다(ADR-68). */
  collectorDown: boolean;
}

export function Panel({ selectedName, registry, live, lead, collectorDown }: PanelProps) {
  if (selectedName === null) {
    return (
      <PanelFrame>
        <div className={INFO_CLASSES}>
          <p className="text-body text-text-secondary">{PANEL_NO_AGENT_TEXT}</p>
        </div>
        <div className={ACTIONS_CLASSES} data-wf="03-9">
          <Footnote />
        </div>
      </PanelFrame>
    );
  }

  const agentDef = registry.agents.find((agent) => agent.name === selectedName);
  const agentLive = live.agents[selectedName];

  return (
    <PanelFrame>
      <AgentInfo
        selectedName={selectedName}
        agentDef={agentDef}
        agentLive={agentLive}
        collectorDown={collectorDown}
        isLead={lead === selectedName}
      />
      <RecentEvents selectedName={selectedName} />
      <Actions selectedName={selectedName} status={agentLive?.status ?? "idle"} writable={registry.writable} />
    </PanelFrame>
  );
}

interface AgentInfoProps {
  selectedName: string;
  agentDef: AgentDef | undefined;
  agentLive: AgentLive | undefined;
  collectorDown: boolean;
  isLead: boolean;
}

function AgentInfo({ selectedName, agentDef, agentLive, collectorDown, isLead }: AgentInfoProps) {
  const shownStatus = displayStatus(agentLive?.status ?? "idle", collectorDown);
  const tool = collectorDown ? null : (agentLive?.currentTool ?? null);
  const cwd = agentLive?.cwd ?? null;

  return (
    <div className={INFO_CLASSES}>
      <div className="flex min-w-0 items-center gap-2">
        <h3 title={selectedName} className="min-w-0 truncate font-mono text-section font-medium text-text">
          {selectedName}
        </h3>
        {isLead ? <Badge>{LEAD_BADGE_TEXT}</Badge> : null}
      </div>
      {agentDef === undefined ? null : (
        <span title={agentDef.filePath} className="truncate font-mono text-aux text-text-muted">
          {agentDef.filePath}
        </span>
      )}
      <dl className={VALUES_CLASSES}>
        <ValueRow label={PANEL_ROW_STATUS}>
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${STATUS_VALUE_CLASSES[shownStatus]}`}>
            <StatusDot status={shownStatus} />
            {STATUS_LABEL_TEXT[shownStatus]}
          </span>
        </ValueRow>
        <ValueRow label={PANEL_ROW_CURRENT_TOOL} mono>
          {currentToolLabel(tool?.name ?? null, tool?.target ?? null)}
        </ValueRow>
        <ValueRow label={PANEL_ROW_SESSION_STARTED} mono>
          {agentLive?.sessionStartedAt ? formatHms(agentLive.sessionStartedAt) : EMPTY_VALUE_TEXT}
        </ValueRow>
        <ValueRow label={PANEL_ROW_CHILD_COUNT} mono>
          {agentLive?.childCount ?? 0}
        </ValueRow>
        <ValueRow label={PANEL_ROW_CWD} mono>
          {cwd ?? EMPTY_VALUE_TEXT}
        </ValueRow>
      </dl>
    </div>
  );
}

interface ActionsProps {
  selectedName: string;
  /** 실제 상태(표시 상태 아님, ADR-68). */
  status: Status;
  writable: boolean;
}

/** `정의 수정`·`제거`: status ≠ idle → 둘 다 비활성 + 사유 한 줄(FR-011-AC5·FR-012-AC6), `writable=false` → `쓰기 권한 없음`(FR-001-E2). */
function Actions({ selectedName, status, writable }: ActionsProps) {
  const openDialog = useDialogNavigate();
  const reasonId = useId();
  const reason = !writable ? WRITABLE_FALSE_REASON : status === "idle" ? undefined : PANEL_BUSY_REASON;
  const disabled = reason !== undefined;
  const describedBy = disabled ? reasonId : undefined;

  return (
    <div data-wf="03-9" className={ACTIONS_CLASSES}>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1">
          <Button
            variant="secondary"
            fullWidth
            disabled={disabled}
            aria-describedby={describedBy}
            onClick={() => openDialog({ dialog: "agent-edit", agent: selectedName })}
          >
            <Icon name="pencil" />
            {EDIT_AGENT_BUTTON_LABEL}
          </Button>
        </div>
        <div className="flex min-w-0 flex-1">
          <Button
            variant="danger"
            fullWidth
            disabled={disabled}
            aria-describedby={describedBy}
            onClick={() => openDialog({ dialog: "agent-remove", agent: selectedName })}
          >
            <Icon name="trash-2" />
            {REMOVE_AGENT_BUTTON_LABEL}
          </Button>
        </div>
      </div>
      {reason === undefined ? null : (
        <span id={reasonId} className="text-aux text-text-muted">
          {reason}
        </span>
      )}
      <Footnote />
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
    <EventsFrame>
      {status === "loading" || agentName !== selectedName ? (
        <EventsSkeletonRows />
      ) : status === "error" ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-aux text-text-secondary">{PANEL_RECENT_EVENTS_ERROR}</p>
          <Button variant="secondary" onClick={() => void agentEventsStore.load(selectedName)}>
            {RETRY_BUTTON_LABEL}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-aux text-text-secondary">{PANEL_RECENT_EVENTS_EMPTY}</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto text-aux">
          {items.map((event) => (
            <li key={event.id} className="flex min-w-0 gap-2">
              <span className="w-ev-time shrink-0 font-mono text-text-muted">{formatHms(event.at)}</span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">
                {event.title} <span className="font-mono text-text-muted">{event.summary}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </EventsFrame>
  );
}

function EventsFrame({ children }: { children: ReactNode }) {
  return (
    <div className={EVENTS_CLASSES}>
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <h4 className="text-body font-semibold text-text">{PANEL_RECENT_EVENTS_TITLE}</h4>
        <span className="text-aux text-text-muted">{PANEL_RECENT_EVENTS_NOTE}</span>
      </div>
      {children}
    </div>
  );
}

function EventsSkeletonRows() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: EVENTS_SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-4 w-full" aria-label="최근 이벤트 로딩 중" />
      ))}
    </div>
  );
}

/** 03 첫 스냅샷 전(04-2): 머리·라벨·각주는 보이고 값·이벤트는 스켈레톤, 동작 줄은 비활성(이유 줄 없음, ADR-44). */
export function PanelSkeleton() {
  return (
    <PanelFrame busy>
      <div className={INFO_CLASSES}>
        <Skeleton className="h-5 w-3/5" aria-label="에이전트 이름 로딩 중" />
        <Skeleton className="w-4/5" aria-label="정의 파일 경로 로딩 중" />
        <dl className={VALUES_CLASSES}>
          {[PANEL_ROW_STATUS, PANEL_ROW_CURRENT_TOOL, PANEL_ROW_SESSION_STARTED, PANEL_ROW_CHILD_COUNT, PANEL_ROW_CWD].map(
            (label) => (
              <ValueRow key={label} label={label}>
                <Skeleton className="w-2/3" aria-label={`${label} 로딩 중`} />
              </ValueRow>
            ),
          )}
        </dl>
      </div>
      <EventsFrame>
        <EventsSkeletonRows />
      </EventsFrame>
      <div data-wf="03-9" className={ACTIONS_CLASSES}>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1">
            <Button variant="secondary" fullWidth disabled>
              <Icon name="pencil" />
              {EDIT_AGENT_BUTTON_LABEL}
            </Button>
          </div>
          <div className="flex min-w-0 flex-1">
            <Button variant="danger" fullWidth disabled>
              <Icon name="trash-2" />
              {REMOVE_AGENT_BUTTON_LABEL}
            </Button>
          </div>
        </div>
        <Footnote />
      </div>
    </PanelFrame>
  );
}
