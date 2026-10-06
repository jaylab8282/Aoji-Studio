/**
 * ui-spec.md SCR-03 오피스 칸 안쪽: 말풍선 `Bubble` + `PixelChar office`(88, 서브는 `sub` 66) + name 칩 + 상태 글자 (ADR-67).
 * FR-007-AC1·AC2·AC3. 배치 자체는 T-R3-15 몫이라 그대로 둔다.
 */
import type { Status } from "../../api/types";
import type { ActionLabelResult } from "../../lib/derive/actionLabel";
import { ellipsis } from "../../lib/format/ellipsis";
import { LEAD_BADGE_TEXT } from "../../lib/text";
import { Bubble } from "../../components/pixel/Bubble";
import { PixelChar } from "../../components/pixel/PixelChar";
import { Tooltip } from "../../components/ui/Tooltip";

const STATUS_TEXT_CLASSES: Record<Status, string> = {
  running: "text-running",
  waiting: "text-waiting",
  idle: "text-text-faint",
};

interface SeatFigureProps {
  /** 캐릭터 아래 name 칩(에이전트 name, 정의 없는 서브에이전트는 `agentType`). */
  name: string;
  /** 표시 상태. 04-4 표시 중에는 호출부가 `idle`로 고정해 넘긴다(ADR-17). */
  status: Status;
  action: ActionLabelResult;
  /** 상태 글자(부모 접미 포함). `lib/text.ts` `agentStatusWithParent`로 만든 값. */
  statusText: string;
  isLead?: boolean;
  /** 정의 없는 서브에이전트용 캐릭터(`PixelChar sub`, 66). */
  small?: boolean;
}

export function SeatFigure({ name, status, action, statusText, isLead = false, small = false }: SeatFigureProps) {
  return (
    <div data-agent-name={name} className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        {isLead ? (
          <span className="rounded-badge bg-running px-1.5 py-0.5 text-min font-semibold text-on-accent">
            {LEAD_BADGE_TEXT}
          </span>
        ) : null}
        <Bubble tone={action.tone}>{action.label}</Bubble>
      </div>

      <PixelChar status={status} size={small ? "sub" : "office"} />

      <Tooltip content={name}>
        <span className="rounded-badge bg-page px-2 py-0.5 font-mono text-min-mono text-text">{ellipsis(name)}</span>
      </Tooltip>
      <span className={`text-min ${STATUS_TEXT_CLASSES[status]}`}>{statusText}</span>
    </div>
  );
}
