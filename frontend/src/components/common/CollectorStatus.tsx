/**
 * ui-spec.md §공통 CollectorStatus (사이드 탭 아래 끝, 전 화면). FR-003-AC6, ADR-72.
 * - `NAV-3`(가로형 상자): `수집 상태` → 칩 → `마지막 수신 <시각>`(시각 고정폭, 없으면 `마지막 수신 없음`).
 * - `NAV-3R`(`rail:` 축약, 폭 44): 상태 사각형 + `수집` + 한 줄(`hh:mm`/`mm-dd`/`없음`/`미설정`),
 *   `tabIndex=0`, `title`·`aria-label` = `수집 상태 · <칩 글자> · 마지막 수신 <시각|없음>`, focus·hover 툴팁.
 * 상태 칩·사각형은 `Chip`·`StatusDot`, 레일 툴팁은 `Tooltip`(`bubble="rail"`)이다(D-125).
 * 둘 다 DOM에 있고 CSS(`rail:`)가 하나만 보이게 한다(ADR-66). 단계 판정·글자는 `lib/derive/collectorStatus.ts`가 한다.
 */
import { useSnapshotStore } from "../../state/snapshotStore";
import { Chip, type ChipTone } from "../ui/Chip";
import { Skeleton } from "../ui/Skeleton";
import { StatusDot, type DotStatus } from "../ui/StatusDot";
import { Tooltip } from "../ui/Tooltip";
import { deriveCollectorStatus, type CollectorStage } from "../../lib/derive/collectorStatus";
import { COLLECTOR_LAST_RECEIVED_LEAD, COLLECTOR_RAIL_LABEL, COLLECTOR_STATUS_TITLE, NO_LAST_RECEIVED_TEXT } from "../../lib/text";

// 단계별 표현: 시안(live) / 중립(neutral, 수신 이력 없음) / 빨강(unset, hook 설정 안 됨) — `Chip`·`StatusDot` 이름으로 옮긴다.
const CHIP_TONE: Record<CollectorStage, ChipTone> = {
  live: "live",
  neutral: "neutral",
  unset: "danger",
};

const DOT_STATUS: Record<CollectorStage, DotStatus> = {
  live: "running",
  neutral: "idle",
  unset: "danger",
};

function Dot({ stage }: { stage: CollectorStage }) {
  return <StatusDot status={DOT_STATUS[stage]} data-stage={stage} />;
}

export function CollectorStatus() {
  const { ready, registry, live } = useSnapshotStore();

  if (!ready || registry === null || live === null) {
    return (
      <>
        <div
          data-wf="NAV-3"
          className="mt-auto grid justify-items-start gap-1.5 rounded-card border border-border bg-card p-3 rail:hidden"
        >
          <span className="text-aux text-text-muted">{COLLECTOR_STATUS_TITLE}</span>
          <Skeleton className="h-5 w-24" aria-label="수집 상태 로딩 중" />
          <Skeleton className="h-3 w-33" aria-label="마지막 수신 로딩 중" />
        </div>
        <div
          data-wf="NAV-3R"
          className="mt-auto hidden w-rail-item-w justify-items-center gap-0.5 rounded-card border border-border bg-card py-1.5 text-min leading-snug text-text-muted rail:grid"
        >
          <span>{COLLECTOR_RAIL_LABEL}</span>
          <Skeleton className="h-3 w-7.5" aria-label="수집 축약 로딩 중" />
        </div>
      </>
    );
  }

  const view = deriveCollectorStatus({
    hookConfigured: registry.hookConfigured,
    everReceived: live.everReceived,
    lastReceivedAt: live.lastReceivedAt,
  });

  return (
    <>
      <div
        data-wf="NAV-3"
        className="mt-auto grid justify-items-start gap-1.5 rounded-card border border-border bg-card p-3 rail:hidden"
      >
        <span className="text-aux text-text-muted">{COLLECTOR_STATUS_TITLE}</span>
        <Chip tone={CHIP_TONE[view.stage]} data-stage={view.stage}>
          <Dot stage={view.stage} />
          {view.chipText}
        </Chip>
        <span className="text-aux text-text-muted">
          {live.lastReceivedAt === null ? (
            NO_LAST_RECEIVED_TEXT
          ) : (
            <>
              {COLLECTOR_LAST_RECEIVED_LEAD}
              <span className="font-mono text-text-mono">{view.lastReceivedText}</span>
            </>
          )}
        </span>
      </div>
      <Tooltip bubble="rail" edge="bottom" content={view.label} className="mt-auto hidden rail:block">
        <div
          data-wf="NAV-3R"
          role="group"
          tabIndex={0}
          title={view.label}
          aria-label={view.label}
          className="grid w-rail-item-w justify-items-center gap-0.5 rounded-card border border-border bg-card py-1.5 text-min leading-snug text-text-muted"
        >
          <Dot stage={view.stage} />
          <span>{COLLECTOR_RAIL_LABEL}</span>
          <span className="font-mono text-text-secondary">{view.railText}</span>
        </div>
      </Tooltip>
    </>
  );
}
