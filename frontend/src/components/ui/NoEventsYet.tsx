/**
 * ui-spec.md SCR-04-1 hook 이벤트 없음 (01 실시간 이벤트 카드 자리, `04-1-1`). `live.everReceived === false`일 때 카드 전체를 대신한다.
 * 점선 안내 카드(가운데): 제목 → 본문 → 명령 줄(링크 아님) → 보조 줄. 문구는 ui-rules 04-1 다섯 문구. FR-005-E1.
 */
import { CommandLine } from "./CommandLine";
import { EVENTS_CARD_TITLE, NO_EVENTS_BODY, NO_EVENTS_COMMAND, NO_EVENTS_FOOTNOTE, NO_EVENTS_TITLE } from "../../lib/text";

export function NoEventsYet() {
  return (
    <section
      aria-label={EVENTS_CARD_TITLE}
      data-wf="04-1-1"
      className="mb-6 flex min-h-events-min min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border-dashed bg-card p-4 text-center"
    >
      <h2 className="text-section font-semibold text-text">{NO_EVENTS_TITLE}</h2>
      <p className="events-empty-body text-text-muted">{NO_EVENTS_BODY}</p>
      <div className="max-w-155">
        <CommandLine>{NO_EVENTS_COMMAND}</CommandLine>
      </div>
      <p className="text-aux text-text-muted">{NO_EVENTS_FOOTNOTE}</p>
    </section>
  );
}
