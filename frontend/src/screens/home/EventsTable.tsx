/**
 * ui-spec.md SCR-01 실시간 이벤트 표. FR-005-AC6·AC7·AC8, FR-005-E1.
 *
 * 표는 `h-96`(384px) 고정 높이 자체 스크롤 컨테이너 안에 있고 머리 행은 `sticky`다(ADR-46 C).
 * `recentEvents` 50개는 전부 DOM에 남는다 — 페이지네이션·가상 스크롤·행 수 축소를 만들지 않는다(FR-005-AC6).
 * 스크롤 컨테이너는 키보드로도 스크롤되게 `tabIndex={0}` + `role="region"`을 갖고,
 * 이름은 새 문구를 만들지 않고 기존 카드 제목(`실시간 이벤트`)을 `aria-labelledby`로 가리킨다.
 */
import { useId } from "react";
import type { EventRow, Live } from "../../api/types";
import { NoEventsYet } from "../../components/ui/NoEventsYet";
import { StatusDot } from "../../components/ui/StatusDot";
import { useConnectionStore } from "../../state/connectionStore";
import { formatHms } from "../../lib/format/time";
import {
  EMPTY_VALUE_TEXT,
  EVENTS_CARD_TITLE,
  EVENTS_TABLE_COL_AGENT,
  EVENTS_TABLE_COL_EVENT,
  EVENTS_TABLE_COL_SUMMARY,
  EVENTS_TABLE_COL_TIME,
  EVENTS_TABLE_COL_WORKFLOW,
  EVENTS_TABLE_FOOTNOTE,
  LIVE_CONNECTED_TEXT,
  LIVE_DISCONNECTED_TEXT,
  recentEventsSubtitle,
} from "../../lib/text";

const TOOL_KINDS: EventRow["kind"][] = ["tool", "tool-done"];
const PERMISSION_KINDS: EventRow["kind"][] = ["permission", "permission-denied"];

function EventTitle({ event }: { event: EventRow }) {
  if (PERMISSION_KINDS.includes(event.kind)) {
    return <span className="text-waiting">{event.title}</span>;
  }
  if (TOOL_KINDS.includes(event.kind) && event.toolName) {
    const prefix = event.title.slice(0, event.title.length - event.toolName.length);
    return (
      <span className="text-text-secondary">
        {prefix}
        <span className="text-running font-mono">{event.toolName}</span>
      </span>
    );
  }
  return <span className="text-text-secondary">{event.title}</span>;
}

export function EventsTable({ live, recentEvents }: { live: Live; recentEvents: EventRow[] }) {
  const titleId = useId();
  const { state } = useConnectionStore();
  const connected = state === "connected";

  return (
    <section className="rounded-card border border-border bg-card p-card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="flex items-baseline gap-2">
          <h2 id={titleId} className="text-section font-semibold text-text">
            {EVENTS_CARD_TITLE}
          </h2>
          <span className="text-aux text-text-faint">{recentEventsSubtitle(recentEvents.length)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-aux text-text-secondary">
          <StatusDot status={connected ? "running" : "idle"} />
          {connected ? LIVE_CONNECTED_TEXT : LIVE_DISCONNECTED_TEXT}
        </span>
      </div>
      {!live.everReceived ? (
        <NoEventsYet />
      ) : (
        <>
          <div className="h-96 overflow-y-auto" tabIndex={0} role="region" aria-labelledby={titleId}>
            <table className="w-full text-left text-body">
              <thead className="sticky top-0 bg-card">
                <tr className="text-aux text-text-muted">
                  <th className="py-2 font-normal">{EVENTS_TABLE_COL_TIME}</th>
                  <th className="py-2 font-normal">{EVENTS_TABLE_COL_WORKFLOW}</th>
                  <th className="py-2 font-normal">{EVENTS_TABLE_COL_AGENT}</th>
                  <th className="py-2 font-normal">{EVENTS_TABLE_COL_EVENT}</th>
                  <th className="py-2 font-normal">{EVENTS_TABLE_COL_SUMMARY}</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((event) => (
                  <tr key={event.id} className="border-t border-border">
                    <td className="py-2 font-mono text-aux text-text-faint">{formatHms(event.at)}</td>
                    <td className="py-2 text-text-secondary">{event.workflow ?? EMPTY_VALUE_TEXT}</td>
                    <td className="py-2 font-mono text-text-mono">{event.agentLabel}</td>
                    <td className="py-2">
                      <EventTitle event={event} />
                    </td>
                    <td className="py-2 font-mono text-text-mono">{event.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-aux text-text-faint">{EVENTS_TABLE_FOOTNOTE}</p>
        </>
      )}
    </section>
  );
}
