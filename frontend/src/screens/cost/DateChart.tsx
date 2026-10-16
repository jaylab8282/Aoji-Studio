/**
 * ui-spec SCR-10 날짜별 차트(`10-7`, `aria-label` `날짜별 토큰 사용량`, FR-025-AC4).
 * 머리(`날짜별` + 보조 + 범례) → y축 4눈금(`M`) + 가로 격자선 → 날짜마다 막대 하나(아래 캐시 읽기 + 나머지, 높이 = 그날 토큰 합 / y축 최댓값),
 * 막대 위 `$N.NN`, x축 `MM-DD`. 막대 칸은 `tabIndex=0` + `aria-label`이고 hover·focus에서 칸 바탕 `bg-soft` + 툴팁(`role=tooltip`).
 * 같은 값의 화면 읽기용 표를 시각적으로 숨겨 둔다. 막대가 많으면(30일·전체) 막대 칸 최소 폭 6px에서 차트 상자 안 가로 스크롤이 된다.
 * 막대가 많을 때(14개 초과)는 금액·날짜 글자를 일정 간격으로만 보인다(겹침 방지) — 값은 막대 이름·툴팁·표에 모두 있다.
 * 로딩 = 막대 7개 스켈레톤.
 */
import { useState } from "react";
import type { CostByDate } from "../../api/types";
import { Skeleton } from "../../components/ui/Skeleton";
import { chartRows, type ChartBar } from "../../lib/derive/costRows";
import { millionsText, usdText } from "../../lib/derive/usageFormat";
import {
  COST_CHART_LABEL,
  COST_CHART_NOTE,
  COST_CHART_TABLE_AMOUNT,
  COST_CHART_TABLE_DATE,
  COST_CHART_TABLE_TOTAL,
  COST_CHART_TITLE,
  COST_COL_CACHE_CREATION,
  COST_COL_CACHE_READ,
  COST_COL_INPUT,
  COST_COL_OUTPUT,
  COST_LEGEND_CACHE_READ,
  COST_LEGEND_MAIN,
  COST_TOOLTIP_CACHE_CREATION,
  COST_TOOLTIP_CACHE_READ,
  COST_TOOLTIP_INPUT,
  COST_TOOLTIP_OUTPUT,
  costTooltipHead,
} from "../../lib/text";
import type { CSSProperties } from "react";

/** 이 개수를 넘으면 금액·날짜 글자를 건너뛰며 보인다. */
const DENSE_BAR_COUNT = 14;
/** 건너뛴 뒤 한 화면에 보이려는 글자 수. */
const DENSE_LABEL_TARGET = 10;
const SKELETON_BARS = 7;

interface DateChartProps {
  /** null이면 첫 응답 전(스켈레톤). */
  byDate: readonly CostByDate[] | null;
}

function Legend() {
  return (
    <div className="flex gap-4 text-aux text-text-muted">
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2.5 rounded-dot bg-text-muted" />
        {COST_LEGEND_MAIN}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2.5 rounded-dot bg-idle" />
        {COST_LEGEND_CACHE_READ}
      </span>
    </div>
  );
}

function Tooltip({ bar, id, onRight }: { bar: ChartBar; id: string; onRight: boolean }) {
  return (
    <div
      id={id}
      role="tooltip"
      className={`pointer-events-none absolute top-0 z-10 grid gap-0.5 rounded-card border border-border-strong bg-selected px-3 py-2 text-aux whitespace-nowrap text-text-secondary ${
        onRight ? "right-full mr-1" : "left-full ml-1"
      }`}
    >
      <b className="font-semibold text-text">
        {costTooltipHead(bar.monthDay, bar.weekday, bar.totalText, bar.usdText)}
      </b>
      <span>
        {COST_TOOLTIP_INPUT}
        <span className="font-mono text-text-mono">{bar.input}</span> · {COST_TOOLTIP_OUTPUT}
        <span className="font-mono text-text-mono">{bar.output}</span>
      </span>
      <span>
        {COST_TOOLTIP_CACHE_CREATION}
        <span className="font-mono text-text-mono">{bar.cacheCreation}</span> · {COST_TOOLTIP_CACHE_READ}
        <span className="font-mono text-text-mono">{bar.cacheRead}</span>
      </span>
    </div>
  );
}

function BarColumn({
  bar,
  index,
  count,
  showLabels,
  active,
  onActive,
}: {
  bar: ChartBar;
  index: number;
  count: number;
  showLabels: boolean;
  active: boolean;
  onActive: (index: number | null) => void;
}) {
  const tooltipId = `cost-tooltip-${bar.date}`;
  const mainTokens = bar.total * (1 - bar.cacheRatio);
  return (
    <div className="flex min-w-chart-bar-min flex-1 flex-col">
      <div
        role="group"
        tabIndex={0}
        aria-label={bar.ariaLabel}
        aria-describedby={active ? tooltipId : undefined}
        style={{ "--bar-height": `${bar.heightPercent}%`, "--bar-cache-ratio": bar.cacheRatio } as CSSProperties}
        onMouseEnter={() => onActive(index)}
        onMouseLeave={() => onActive(null)}
        onFocus={() => onActive(index)}
        onBlur={() => onActive(null)}
        className={`relative flex-1 rounded-t-chip border-b border-border-strong ${active ? "bg-soft" : ""}`}
      >
        {bar.total > 0 ? (
          <div aria-hidden="true" className="chart-bar">
            {mainTokens > 0.5 ? <i className="chart-seg-main block" /> : null}
            {bar.cacheRatio > 0 ? <i className="chart-seg-cache block" /> : null}
          </div>
        ) : null}
        {showLabels ? (
          <span aria-hidden="true" className="chart-amount font-mono text-min whitespace-nowrap text-text-secondary">
            {bar.usdText}
          </span>
        ) : null}
        {active ? <Tooltip bar={bar} id={tooltipId} onRight={index >= count / 2} /> : null}
      </div>
      <div
        aria-hidden="true"
        className="flex h-chart-xlabel flex-none items-end justify-center font-mono text-min whitespace-nowrap text-text-muted"
      >
        {showLabels ? bar.monthDay : null}
      </div>
    </div>
  );
}

function ReaderTable({ bars, byDate }: { bars: readonly ChartBar[]; byDate: readonly CostByDate[] }) {
  return (
    <table className="sr-only">
      <caption>{COST_CHART_LABEL}</caption>
      <thead>
        <tr>
          <th scope="col">{COST_CHART_TABLE_DATE}</th>
          <th scope="col">{COST_CHART_TABLE_TOTAL}</th>
          <th scope="col">{COST_COL_INPUT}</th>
          <th scope="col">{COST_COL_OUTPUT}</th>
          <th scope="col">{COST_COL_CACHE_CREATION}</th>
          <th scope="col">{COST_COL_CACHE_READ}</th>
          <th scope="col">{COST_CHART_TABLE_AMOUNT}</th>
        </tr>
      </thead>
      <tbody>
        {bars.map((bar, index) => (
          <tr key={bar.date}>
            <th scope="row">{`${bar.monthDay} (${bar.weekday})`}</th>
            <td>{millionsText(byDate[index]?.tokens.total ?? 0)}</td>
            <td>{bar.input}</td>
            <td>{bar.output}</td>
            <td>{bar.cacheCreation}</td>
            <td>{bar.cacheRead}</td>
            <td>{usdText(byDate[index]?.usd ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DateChart({ byDate }: DateChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const model = byDate === null ? null : chartRows(byDate);
  const count = model === null ? SKELETON_BARS : model.bars.length;
  const dense = count > DENSE_BAR_COUNT;
  const labelStep = dense ? Math.ceil(count / DENSE_LABEL_TARGET) : 1;

  return (
    <section
      data-wf="10-7"
      aria-label={COST_CHART_LABEL}
      aria-busy={byDate === null}
      className="flex min-h-0 min-w-0 flex-col gap-2 rounded-card border border-border bg-card px-4 py-3"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 whitespace-nowrap">
        <h2 className="text-section font-semibold">{COST_CHART_TITLE}</h2>
        <span className="text-aux text-text-muted">{COST_CHART_NOTE}</span>
        <span className="flex-1" />
        <Legend />
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        <div aria-hidden="true" className="flex w-chart-axis flex-none flex-col">
          <div className="flex flex-1 translate-y-1.5 flex-col justify-between text-right font-mono text-min text-text-muted">
            {model === null ? null : model.ticks.map((tick, index) => <span key={index}>{tick}</span>)}
          </div>
          <div className="h-chart-xlabel flex-none" />
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className={`relative flex h-full min-w-full ${dense ? "gap-1" : "gap-3"}`}>
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 bottom-chart-xlabel flex flex-col justify-between">
              {[0, 1, 2, 3, 4].map((line) => (
                <i key={line} className="border-t border-grid-line" />
              ))}
            </div>
            {model === null || byDate === null
              ? Array.from({ length: SKELETON_BARS }, (_, index) => (
                  <div key={index} className="flex min-w-chart-bar-min flex-1 flex-col justify-end">
                    <Skeleton decorative className="h-1/2 w-3/5 flex-none self-center" />
                    <div className="h-chart-xlabel flex-none" />
                  </div>
                ))
              : model.bars.map((bar, index) => (
                  <BarColumn
                    key={bar.date}
                    bar={bar}
                    index={index}
                    count={model.bars.length}
                    showLabels={index % labelStep === 0}
                    active={activeIndex === index}
                    onActive={setActiveIndex}
                  />
                ))}
          </div>
        </div>
      </div>
      {model === null || byDate === null ? null : <ReaderTable bars={model.bars} byDate={byDate} />}
    </section>
  );
}
