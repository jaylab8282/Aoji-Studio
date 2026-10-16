/**
 * ui-spec SCR-10 합계 줄(`10-4`): 토큰 칸 4개(`입력`·`출력`·`캐시 생성`·`캐시 읽기` 토큰) + 추정 금액 넓은 칸(`10-5`, FR-025-AC1·FR-026-AC1·AC2·AC6).
 * 칸 구조: 라벨과 값이 형제이고 부모가 칸이다. 로딩 = 값 자리 스켈레톤, 연결 안 됨 = `-`(`API 단가 환산 · 실제 청구액 아님`은 그대로).
 */
import type { CostReport } from "../../api/types";
import { Chip } from "../../components/ui/Chip";
import { Skeleton } from "../../components/ui/Skeleton";
import { commaText, usdText } from "../../lib/derive/usageFormat";
import {
  COST_AMOUNT_LABEL,
  COST_NOT_ACTUAL_BILL,
  COST_SUBSCRIPTION_NOTE,
  COST_TILE_CACHE_CREATION,
  COST_TILE_CACHE_READ,
  COST_TILE_INPUT,
  COST_TILE_OUTPUT,
  EMPTY_VALUE_TEXT,
  costExcludedChip,
} from "../../lib/text";

interface TokenTilesProps {
  /** 첫 응답 전·연결 안 됨이면 null. */
  report: CostReport | null;
  /** 연결 안 됨이면 값 자리를 `-`로(이미 쌓인 집계가 있어도). */
  disconnected: boolean;
  /** `limits.plan.value !== null`이면 구독 요금제 안내를 덧붙인다(FR-026-AC2). */
  hasPlan: boolean;
}

const TILE = "grid content-start gap-0.5 rounded-card border border-border bg-card px-4 py-3";
const KEY = "text-aux text-text-muted";
const VALUE = "cost-tile-value font-mono font-medium tracking-desk tabular-nums text-text";

interface TileValueProps {
  text: string | null;
  disconnected: boolean;
}

function TileValue({ text, disconnected }: TileValueProps) {
  if (disconnected) return <span className={`${VALUE} text-text-muted`}>{EMPTY_VALUE_TEXT}</span>;
  if (text === null) return <Skeleton big className="mt-0.5 w-3/4" />;
  return <span className={VALUE}>{text}</span>;
}

export function TokenTiles({ report, disconnected, hasPlan }: TokenTilesProps) {
  const tiles: Array<[string, number | undefined]> = [
    [COST_TILE_INPUT, report?.totals.input],
    [COST_TILE_OUTPUT, report?.totals.output],
    [COST_TILE_CACHE_CREATION, report?.totals.cacheCreation],
    [COST_TILE_CACHE_READ, report?.totals.cacheRead],
  ];
  const excluded = report?.estimate.excludedModelCount ?? 0;
  return (
    <div data-wf="10-4" className="cost-tiles col-span-full">
      {tiles.map(([label, value]) => (
        <section key={label} className={TILE}>
          <span className={KEY}>{label}</span>
          <TileValue text={value === undefined ? null : commaText(value)} disconnected={disconnected} />
        </section>
      ))}
      <section data-wf="10-5" className={`${TILE} cost-tile-amount`}>
        <span className={KEY}>{COST_AMOUNT_LABEL}</span>
        <div className="flex min-w-0 items-center gap-3">
          {disconnected ? (
            <span className="cost-amount-value font-mono font-medium tracking-desk text-text-muted">{EMPTY_VALUE_TEXT}</span>
          ) : report === null ? (
            <Skeleton big className="mt-0.5 w-1/2" />
          ) : (
            <>
              <span className="cost-amount-value font-mono font-medium tracking-desk tabular-nums text-text">
                {usdText(report.estimate.usd)}
              </span>
              {excluded > 0 ? <Chip tone="dash">{costExcludedChip(excluded)}</Chip> : null}
            </>
          )}
        </div>
        <span className="text-aux text-text-secondary">
          <b className="font-semibold text-text">{COST_NOT_ACTUAL_BILL}</b>
          {hasPlan ? <span className="text-text-muted">{COST_SUBSCRIPTION_NOTE}</span> : null}
        </span>
      </section>
    </div>
  );
}
