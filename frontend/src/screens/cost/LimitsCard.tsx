/**
 * ui-spec SCR-10 구독·한도 카드(`10-6`, `aria-label` `구독 · 사용 한도`, FR-027-AC4·AC5·AC6·E1·E2).
 * 머리 → `구독 플랜`(값 + `<출처> · N분 전 hh:mm:ss`) → `5시간 한도`·`주간 한도`(`N%` + `초기화 <시각>` + `Meter`(`role=meter`) + 출처 줄) → 상태줄 안내(항상).
 * 전부 `never`면 플랜·한도 자리에 점선 상자 `받은 적 없음` + `설정 열기`. `missing` → `값 없음`, 초기화 지남 → `초기화됨 · 새 값 대기`(막대 비움).
 * 막대는 값과 무관하게 중립색이다(conventions §7). 조회 실패는 카드 자리 `Alert` + `다시 시도`.
 */
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Limits } from "../../api/types";
import { Meter } from "../../components/data/Meter";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Skeleton } from "../../components/ui/Skeleton";
import { limitsView, type LimitRow, type LimitsView } from "../../lib/derive/limitDisplay";
import {
  COST_LIMITS_FIVE_HOUR,
  COST_LIMITS_LABEL,
  COST_LIMITS_MISSING,
  COST_LIMITS_NEVER_BODY,
  COST_LIMITS_NEVER_TITLE,
  COST_LIMITS_PLAN,
  COST_LIMITS_PLAN_UNKNOWN,
  COST_LIMITS_RESET_LEAD,
  COST_LIMITS_RESET_PASSED,
  COST_LIMITS_SEVEN_DAY,
  COST_STATUSLINE_NOTE,
  OPEN_SETTINGS_BUTTON_LABEL,
  RETRY_BUTTON_LABEL,
  costLimitEmptyMeterLabel,
  costLimitMeterLabel,
} from "../../lib/text";

interface LimitsCardProps {
  /** null이면 첫 응답 전(스켈레톤). */
  limits: Limits | null;
  errorMessage: string | null;
  onRetry: () => void;
  now: Date;
  /** 합계·차트·표가 안내 카드로 바뀐 배치(왼쪽 열 3~4줄에 맞춘다). */
  alongsideNotice: boolean;
}

const KEY = "w-limit-label flex-none text-aux text-text-muted";

function LimitLine({ title, row }: { title: string; row: LimitRow }) {
  let value: ReactNode;
  if (row.kind === "ok") {
    value = <span className="font-mono text-section font-medium tabular-nums text-text">{row.percentText}</span>;
  } else if (row.kind === "missing") {
    value = <span className="text-text-muted">{COST_LIMITS_MISSING}</span>;
  } else {
    value = <span className="text-text-muted">{COST_LIMITS_RESET_PASSED}</span>;
  }
  const meter =
    row.kind === "ok" ? (
      <Meter limit role="meter" ratio={row.ratio} label={costLimitMeterLabel(title, row.percentValue)} />
    ) : (
      <Meter limit role="img" ratio={0} label={costLimitEmptyMeterLabel(title, row.kind === "missing" ? COST_LIMITS_MISSING : COST_LIMITS_RESET_PASSED)} />
    );
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline gap-2">
        <span className={KEY}>{title}</span>
        {value}
        {row.resetText === null ? null : (
          <span className="ml-auto text-aux whitespace-nowrap text-text-secondary">
            {COST_LIMITS_RESET_LEAD}
            <span className="font-mono text-text-mono">{row.resetText}</span>
          </span>
        )}
      </div>
      {meter}
      {row.sourceText === null ? null : <span className="text-aux text-text-muted">{row.sourceText}</span>}
    </div>
  );
}

function PlanLine({ view }: { view: LimitsView }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline gap-2">
        <span className={KEY}>{COST_LIMITS_PLAN}</span>
        <span className="font-mono font-medium text-text">{view.plan.value ?? COST_LIMITS_PLAN_UNKNOWN}</span>
        {view.plan.sourceText === null ? null : (
          <span className="ml-auto text-aux whitespace-nowrap text-text-muted">{view.plan.sourceText}</span>
        )}
      </div>
    </div>
  );
}

export function LimitsCard({ limits, errorMessage, onRetry, now, alongsideNotice }: LimitsCardProps) {
  const navigate = useNavigate();
  const view = limits === null ? null : limitsView(limits, now);

  let body: ReactNode;
  if (errorMessage !== null) {
    body = (
      <div className="grid justify-items-start gap-2">
        <Alert message={errorMessage} />
        <Button variant="secondary" onClick={onRetry}>
          <Icon name="refresh-cw" />
          {RETRY_BUTTON_LABEL}
        </Button>
      </div>
    );
  } else if (view === null) {
    body = (
      <div aria-busy="true" className="grid gap-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} decorative className="h-6 w-full" />
        ))}
      </div>
    );
  } else if (view.neverReceived) {
    body = (
      <div className="grid justify-items-start gap-2 rounded-card border border-dashed border-border-dashed p-3 text-aux text-text-secondary">
        <b className="font-semibold text-text">{COST_LIMITS_NEVER_TITLE}</b>
        <span>{COST_LIMITS_NEVER_BODY}</span>
        <Button variant="secondary" onClick={() => navigate("/settings")}>
          <Icon name="settings" />
          {OPEN_SETTINGS_BUTTON_LABEL}
        </Button>
      </div>
    );
  } else {
    body = (
      <>
        <PlanLine view={view} />
        <LimitLine title={COST_LIMITS_FIVE_HOUR} row={view.fiveHour} />
        <LimitLine title={COST_LIMITS_SEVEN_DAY} row={view.sevenDay} />
      </>
    );
  }

  return (
    <section
      data-wf="10-6"
      aria-label={COST_LIMITS_LABEL}
      className={`grid min-w-0 content-start gap-3 self-start rounded-card border border-border bg-card px-4 py-3 short:gap-2 ${
        alongsideNotice ? "cost-slot-limits" : ""
      }`}
    >
      <h2 className="text-section font-semibold">{COST_LIMITS_LABEL}</h2>
      {body}
      <p data-wf="10-8" className="flex items-start gap-2 rounded-chip bg-inset px-3 py-2 text-aux text-text-secondary">
        <Icon name="info" className="mt-px text-text-muted" />
        <span>{COST_STATUSLINE_NOTE}</span>
      </p>
    </section>
  );
}
