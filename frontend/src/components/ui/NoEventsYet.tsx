/**
 * ui-spec.md SCR-04-1 hook 이벤트 없음 (01 실시간 이벤트 영역). `live.everReceived === false`일 때 쓴다. FR-005-E1.
 */
import { Link } from "react-router-dom";
import { MonoText } from "./MonoText";
import {
  NO_EVENTS_BODY,
  NO_EVENTS_FOOTNOTE,
  NO_EVENTS_HOOK_SETUP_LINK_LABEL,
  NO_EVENTS_HOOK_SETUP_PREFIX,
  NO_EVENTS_HOOK_SETUP_SUFFIX,
  NO_EVENTS_TITLE,
} from "../../lib/text";

export function NoEventsYet() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span aria-hidden="true" className="h-6 w-6 rounded-badge border border-dashed border-border-dashed" />
      <p className="text-section font-semibold text-text">{NO_EVENTS_TITLE}</p>
      <p className="text-body text-text-secondary max-w-md">{NO_EVENTS_BODY}</p>
      <MonoText className="rounded-control bg-soft px-3 py-2 text-aux">
        {NO_EVENTS_HOOK_SETUP_PREFIX}
        <Link to="/settings" className="text-link underline">
          {NO_EVENTS_HOOK_SETUP_LINK_LABEL}
        </Link>
        {NO_EVENTS_HOOK_SETUP_SUFFIX}
      </MonoText>
      <p className="text-aux text-text-faint">{NO_EVENTS_FOOTNOTE}</p>
    </div>
  );
}
