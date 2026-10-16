/**
 * ui-spec.md §공통 `PeriodSelector`(`seg`, 08·09·10, ADR-86): 라벨 `기간`(aux muted, `id`) + 3칸 묶음 `7일`·`30일`·`전체`
 * (`role="group" aria-labelledby`, 각 `button aria-pressed`, 높이 34, 선택 = `bg-action-soft text-link` + 안쪽 1px `action-border`)
 * + 날짜 범위(고정폭 aux muted, `MM-DD ~ MM-DD`, `range.from`이 null이면 `-`). 기본은 `7일`(호출하는 화면이 정한다).
 * 값을 쓰지 않으므로 로딩 중에도 활성이다. 범위(`range`)는 첫 응답 전에는 null이고 그동안 스켈레톤이다.
 */
import { useId } from "react";
import type { UsagePeriod, UsageRange } from "../../api/types";
import { Skeleton } from "../ui/Skeleton";
import { PERIOD_LABEL, PERIOD_OPTIONS, PERIOD_RANGE_NONE_TEXT, periodRangeText } from "../../lib/text";

interface PeriodSelectorProps {
  value: UsagePeriod;
  onChange: (period: UsagePeriod) => void;
  /** 응답의 `range`. 첫 응답 전에는 null. */
  range: UsageRange | null;
  /** 화면 원본의 `data-wf`(08 `08-3` 등). */
  wf?: string;
}

const BUTTON_BASE = "min-h-control border-l border-border-strong px-3 font-semibold first:border-l-0";

export function PeriodSelector({ value, onChange, range, wf }: PeriodSelectorProps) {
  const labelId = useId();
  return (
    <div data-wf={wf} className="flex flex-wrap items-center gap-3">
      <span id={labelId} className="text-aux text-text-muted">
        {PERIOD_LABEL}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className="inline-flex flex-none overflow-hidden rounded-control border border-border-strong bg-soft"
      >
        {PERIOD_OPTIONS.map((option) => {
          const pressed = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(option.value)}
              className={`${BUTTON_BASE} ${
                pressed ? "seg-selected bg-action-soft text-link" : "bg-transparent text-text-secondary"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {range === null ? (
        <Skeleton className="w-24" aria-label="날짜 범위 로딩 중" />
      ) : (
        <span data-testid="period-range" className="font-mono text-aux text-text-muted">
          {range.from === null ? PERIOD_RANGE_NONE_TEXT : periodRangeText(range.from, range.to)}
        </span>
      )}
    </div>
  );
}
