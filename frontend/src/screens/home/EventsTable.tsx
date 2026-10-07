/**
 * ui-spec.md SCR-01 실시간 이벤트 카드 (`01-6`). FR-005-AC6·AC7·AC8.
 * 카드는 남은 높이를 채우고(최소 220) 표 안에서만 세로 스크롤하며 머리 행은 `sticky`다(ADR-66). `recentEvents` 50개는 전부 DOM에 남는다.
 * 열 96/120/210/170/나머지. `permission` 행의 `이벤트`만 `text-waiting` 600. 요약·에이전트는 고정폭 말줄임 + `title`(서버가 마스킹한 값).
 * 스크롤 영역은 키보드로도 스크롤되게 `tabIndex={0}` + `role="region"`이고 이름은 카드 제목(`aria-labelledby`)이다(같은 이름의 region이 둘 되지 않게 카드 `<section>`에는 이름을 두지 않는다).
 * 이벤트가 없는 상태(`everReceived === false`)는 이 카드 대신 `NoEventsYet`(04-1)을 그린다(호출부).
 */
import { useId } from "react";
import type { EventRow } from "../../api/types";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatusDot } from "../../components/ui/StatusDot";
import { useConnectionStore } from "../../state/connectionStore";
import { formatHms } from "../../lib/format/time";
import {
  EMPTY_VALUE_TEXT,
  EVENTS_CARD_SUBTITLE,
  EVENTS_CARD_TITLE,
  EVENTS_TABLE_COL_AGENT,
  EVENTS_TABLE_COL_EVENT,
  EVENTS_TABLE_COL_SUMMARY,
  EVENTS_TABLE_COL_TIME,
  EVENTS_TABLE_COL_WORKFLOW,
  EVENTS_TABLE_FOOTNOTE,
  LIVE_CONNECTED_TEXT,
  LIVE_DISCONNECTED_TEXT,
} from "../../lib/text";

const CARD = "flex min-h-events-min min-w-0 flex-1 flex-col gap-3 rounded-card border border-border bg-card p-4 mb-6";
const TH = "sticky top-0 z-1 border-b border-border bg-card px-2 py-1.5 text-left text-aux font-semibold whitespace-nowrap text-text-muted";
const TD = "truncate px-2 py-1.5";
const ROW = "border-b border-border last:border-b-0";

function Columns() {
  return (
    <colgroup>
      <col className="w-col-time" />
      <col className="w-col-workflow" />
      <col className="w-col-agent" />
      <col className="w-col-event" />
      <col />
    </colgroup>
  );
}

function TableHead() {
  return (
    <thead>
      <tr>
        <th className={TH}>{EVENTS_TABLE_COL_TIME}</th>
        <th className={TH}>{EVENTS_TABLE_COL_WORKFLOW}</th>
        <th className={TH}>{EVENTS_TABLE_COL_AGENT}</th>
        <th className={TH}>{EVENTS_TABLE_COL_EVENT}</th>
        <th className={TH}>{EVENTS_TABLE_COL_SUMMARY}</th>
      </tr>
    </thead>
  );
}

function CardHead({ titleId, connection }: { titleId: string; connection?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
      <h2 id={titleId} className="text-section font-semibold">
        {EVENTS_CARD_TITLE}
      </h2>
      <span className="min-w-0 truncate text-aux text-text-muted">{EVENTS_CARD_SUBTITLE}</span>
      <span className="flex-1" />
      {connection === undefined ? null : (
        <span
          data-testid="connection-indicator"
          data-connected={connection}
          className={`inline-flex items-center gap-1.5 ${connection ? "text-live" : "text-danger"}`}
        >
          <StatusDot status={connection ? "running" : "danger"} />
          {connection ? LIVE_CONNECTED_TEXT : LIVE_DISCONNECTED_TEXT}
        </span>
      )}
    </div>
  );
}

export function EventsTable({ recentEvents }: { recentEvents: EventRow[] }) {
  const titleId = useId();
  const { state } = useConnectionStore();

  return (
    <section data-wf="01-6" className={CARD}>
      <CardHead titleId={titleId} connection={state === "connected"} />
      <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} role="region" aria-labelledby={titleId}>
        <table className="w-full min-w-table-min table-fixed border-collapse">
          <Columns />
          <TableHead />
          <tbody>
            {recentEvents.map((event) => (
              <tr key={event.id} className={ROW}>
                <td className={`${TD} font-mono text-text-secondary`}>{formatHms(event.at)}</td>
                <td className={`${TD} text-text-secondary`}>{event.workflow ?? EMPTY_VALUE_TEXT}</td>
                <td className={`${TD} font-mono text-text-secondary`} title={event.agentLabel}>
                  {event.agentLabel}
                </td>
                <td
                  className={`${TD} ${event.kind === "permission" ? "font-semibold text-waiting" : "text-text-secondary"}`}
                  data-kind={event.kind}
                  title={event.title}
                >
                  {event.title}
                </td>
                <td className={`${TD} font-mono text-text-secondary`} title={event.summary}>
                  {event.summary}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-aux text-text-muted">{EVENTS_TABLE_FOOTNOTE}</p>
    </section>
  );
}

const SKELETON_ROW_WIDTHS = ["w-7/10", "w-3/5", "w-4/5", "w-7/10", "w-17/20"] as const;

/** 04-2: 행 8줄 칸 스켈레톤. 제목·표 머리·각주는 보이고 연결 표시는 숨긴다. */
export function EventsTableSkeleton() {
  const titleId = useId();
  return (
    <section aria-label={EVENTS_CARD_TITLE} aria-busy="true" data-wf="01-6" className={CARD}>
      <CardHead titleId={titleId} />
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-table-min table-fixed border-collapse">
          <Columns />
          <TableHead />
          <tbody>
            {Array.from({ length: 8 }, (_, row) => (
              <tr key={row} className={ROW}>
                {SKELETON_ROW_WIDTHS.map((width, column) => (
                  <td key={column} className="px-2 py-1.5">
                    <div className="flex h-lh items-center">
                      <Skeleton decorative className={width} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-aux text-text-muted">{EVENTS_TABLE_FOOTNOTE}</p>
    </section>
  );
}
