/**
 * ui-spec SCR-10 나눔 카드(`10-10`, `aria-label` `나눔`, FR-025-AC2·AC3·AC4, FR-026-AC6): `Tabs` `모델별`(기본)·`세션별`·`에이전트별` + 표(`role=tabpanel`).
 * 숫자 열은 오른쪽 정렬 고정폭, 마지막 줄 `합계`(600 + 위 `border-strong`)는 `cost.totals`·`estimate`(제외가 있으면 합계 금액 옆 `단가 없는 모델 N개 제외`).
 * 단가 없는 모델 줄(`10-9`)의 금액 칸은 점선 칩 `단가 없음`. 행은 서버 순서(토큰 합 내림차순) 그대로이며 탭 전환은 로컬 상태다. 로딩 = 행 4개 스켈레톤.
 */
import { useState, type ReactNode } from "react";
import type { CostAgentKind, CostReport, TokenSums } from "../../api/types";
import { Tabs, type TabItem } from "../../components/data/Tabs";
import { tabId, tabPanelId } from "../../components/data/tabIds";
import { Chip } from "../../components/ui/Chip";
import { Skeleton } from "../../components/ui/Skeleton";
import { formatDateHm } from "../../lib/format/time";
import { entrypointText } from "../../lib/derive/costRows";
import { commaText, tokenText, usdText } from "../../lib/derive/usageFormat";
import {
  COST_AGENT_MAIN,
  COST_AGENT_UNKNOWN,
  COST_COL_AGENT,
  COST_COL_AMOUNT,
  COST_COL_CACHE_CREATION,
  COST_COL_CACHE_READ,
  COST_COL_ENTRYPOINT,
  COST_COL_INPUT,
  COST_COL_MODEL,
  COST_COL_OUTPUT,
  COST_COL_PROJECT,
  COST_COL_SESSION,
  COST_COL_STARTED,
  COST_COL_TOTAL,
  COST_NO_PRICE_CHIP,
  COST_ROW_TOTAL,
  COST_SPLIT_LABEL,
  COST_SPLIT_TAB_AGENT,
  COST_SPLIT_TAB_MODEL,
  COST_SPLIT_TAB_SESSION,
  EMPTY_VALUE_TEXT,
  costExcludedChip,
} from "../../lib/text";

type SplitTab = "model" | "session" | "agent";

const TABS: readonly TabItem<SplitTab>[] = [
  { id: "model", label: COST_SPLIT_TAB_MODEL },
  { id: "session", label: COST_SPLIT_TAB_SESSION },
  { id: "agent", label: COST_SPLIT_TAB_AGENT },
];
const ID_PREFIX = "cost-split";
const LOADING_ROWS = 4;

const HEAD =
  "border-b border-border px-3 py-2 text-left text-aux font-semibold whitespace-nowrap text-text-muted";
const HEAD_N = `${HEAD} text-right`;
const CELL = "px-3 py-2 whitespace-nowrap";
const NUMBER = "text-right font-mono tabular-nums";

function agentText(agent: string | null, kind: CostAgentKind): string {
  if (agent !== null) return agent;
  return kind === "main" ? COST_AGENT_MAIN : COST_AGENT_UNKNOWN;
}

/** 데이터 줄 칸의 아래 선: 합계 줄 바로 위 줄은 합계 줄의 `border-strong` 위 선이 맡는다. */
function lineClass(isLast: boolean): string {
  return isLast ? "" : "border-b border-border";
}

interface CellProps {
  line: string;
  children: ReactNode;
  title?: string;
}

function TextCell({ line, children }: CellProps) {
  return <td className={`${CELL} ${line} text-text-secondary`}>{children}</td>;
}

function MonoCell({
  line,
  children,
  title,
  grow = false,
}: CellProps & { grow?: boolean }) {
  return (
    <td
      className={`${CELL} ${line} font-mono text-text-mono ${grow ? "max-w-0 overflow-hidden text-ellipsis" : ""}`}
      title={title}
    >
      {children}
    </td>
  );
}

/** 숫자 칸: 오른쪽 정렬 고정폭. `strong`은 `토큰 합`·`추정 금액`(굵은 느낌의 밝은 글자). */
function NumberCell({
  line,
  children,
  title,
  strong = false,
}: CellProps & { strong?: boolean }) {
  return (
    <td
      className={`${CELL} ${line} ${NUMBER} ${strong ? "text-text" : "text-text-mono"}`}
      title={title}
    >
      {children}
    </td>
  );
}

function TokenCells({ tokens, line }: { tokens: TokenSums; line: string }) {
  return (
    <>
      <NumberCell line={line} title={commaText(tokens.input)}>
        {tokenText(tokens.input)}
      </NumberCell>
      <NumberCell line={line} title={commaText(tokens.output)}>
        {tokenText(tokens.output)}
      </NumberCell>
      <NumberCell line={line} title={commaText(tokens.cacheCreation)}>
        {tokenText(tokens.cacheCreation)}
      </NumberCell>
      <NumberCell line={line} title={commaText(tokens.cacheRead)}>
        {tokenText(tokens.cacheRead)}
      </NumberCell>
      <NumberCell line={line} strong title={commaText(tokens.total)}>
        {tokenText(tokens.total)}
      </NumberCell>
    </>
  );
}

function TokenHeads() {
  return (
    <>
      <th scope="col" className={HEAD_N}>
        {COST_COL_INPUT}
      </th>
      <th scope="col" className={HEAD_N}>
        {COST_COL_OUTPUT}
      </th>
      <th scope="col" className={HEAD_N}>
        {COST_COL_CACHE_CREATION}
      </th>
      <th scope="col" className={HEAD_N}>
        {COST_COL_CACHE_READ}
      </th>
      <th scope="col" className={HEAD_N}>
        {COST_COL_TOTAL}
      </th>
    </>
  );
}

/** 합계 줄: `cost.totals`·`estimate`. `blanks`는 합계 글자와 숫자 칸 사이 빈 칸 수(세션 표 3). */
function TotalRow({
  report,
  blanks,
  onlyTotal = false,
}: {
  report: CostReport;
  blanks: number;
  onlyTotal?: boolean;
}) {
  const excluded = report.estimate.excludedModelCount;
  const line = "border-t border-border-strong font-semibold";
  const number = `${CELL} ${line} ${NUMBER} text-text`;
  return (
    <tr>
      <td className={`${CELL} ${line} text-text`}>{COST_ROW_TOTAL}</td>
      {Array.from({ length: blanks }, (_, index) => (
        <td key={index} className={`${CELL} ${line}`} />
      ))}
      {onlyTotal ? null : (
        <>
          <td className={number} title={commaText(report.totals.input)}>
            {tokenText(report.totals.input)}
          </td>
          <td className={number} title={commaText(report.totals.output)}>
            {tokenText(report.totals.output)}
          </td>
          <td className={number} title={commaText(report.totals.cacheCreation)}>
            {tokenText(report.totals.cacheCreation)}
          </td>
          <td className={number} title={commaText(report.totals.cacheRead)}>
            {tokenText(report.totals.cacheRead)}
          </td>
        </>
      )}
      <td className={number} title={commaText(report.totals.total)}>
        {tokenText(report.totals.total)}
      </td>
      <td className={number}>
        {usdText(report.estimate.usd)}
        {excluded > 0 ? (
          <span className="ml-2 font-sans text-min font-normal text-text-muted">
            {costExcludedChip(excluded)}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function LoadingRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: LOADING_ROWS }, (_, index) => (
        <tr key={index} data-testid="cost-split-skeleton-row">
          <td colSpan={columns} className="px-3 py-2">
            <Skeleton decorative className="w-full" />
          </td>
        </tr>
      ))}
    </>
  );
}

function ModelTable({ report }: { report: CostReport | null }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th scope="col" className={HEAD}>
            {COST_COL_MODEL}
          </th>
          <TokenHeads />
          <th scope="col" className={HEAD_N}>
            {COST_COL_AMOUNT}
          </th>
        </tr>
      </thead>
      <tbody aria-busy={report === null}>
        {report === null ? (
          <LoadingRows columns={7} />
        ) : (
          <>
            {report.byModel.map((row, index) => {
              const line = lineClass(index === report.byModel.length - 1);
              return (
                <tr
                  key={row.model}
                  data-wf={row.usd === null ? "10-9" : undefined}
                >
                  <MonoCell line={line}>{row.model}</MonoCell>
                  <TokenCells tokens={row.tokens} line={line} />
                  <NumberCell line={line} strong>
                    {row.usd === null ? (
                      <Chip tone="dash">{COST_NO_PRICE_CHIP}</Chip>
                    ) : (
                      usdText(row.usd)
                    )}
                  </NumberCell>
                </tr>
              );
            })}
            <TotalRow report={report} blanks={0} />
          </>
        )}
      </tbody>
    </table>
  );
}

function SessionTable({ report }: { report: CostReport | null }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th scope="col" className={HEAD}>
            {COST_COL_SESSION}
          </th>
          <th scope="col" className={`${HEAD} w-full`}>
            {COST_COL_PROJECT}
          </th>
          <th scope="col" className={HEAD}>
            {COST_COL_STARTED}
          </th>
          <th scope="col" className={HEAD}>
            {COST_COL_ENTRYPOINT}
          </th>
          <th scope="col" className={HEAD_N}>
            {COST_COL_TOTAL}
          </th>
          <th scope="col" className={HEAD_N}>
            {COST_COL_AMOUNT}
          </th>
        </tr>
      </thead>
      <tbody aria-busy={report === null}>
        {report === null ? (
          <LoadingRows columns={6} />
        ) : (
          <>
            {report.bySession.map((row, index) => {
              const line = lineClass(index === report.bySession.length - 1);
              return (
                <tr key={row.sessionId}>
                  <MonoCell line={line}>{row.sessionId.slice(0, 8)}</MonoCell>
                  <MonoCell line={line} grow title={row.project ?? undefined}>
                    {row.project ?? EMPTY_VALUE_TEXT}
                  </MonoCell>
                  <MonoCell line={line}>
                    {row.startedAt === null
                      ? EMPTY_VALUE_TEXT
                      : formatDateHm(row.startedAt).slice(5)}
                  </MonoCell>
                  <TextCell line={line}>
                    {entrypointText(row.entrypoint)}
                  </TextCell>
                  <NumberCell
                    line={line}
                    strong
                    title={commaText(row.tokens.total)}
                  >
                    {tokenText(row.tokens.total)}
                  </NumberCell>
                  <NumberCell line={line} strong>
                    {usdText(row.usd)}
                  </NumberCell>
                </tr>
              );
            })}
            <TotalRow report={report} blanks={3} onlyTotal />
          </>
        )}
      </tbody>
    </table>
  );
}

function AgentTable({ report }: { report: CostReport | null }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th scope="col" className={HEAD}>
            {COST_COL_AGENT}
          </th>
          <TokenHeads />
          <th scope="col" className={HEAD_N}>
            {COST_COL_AMOUNT}
          </th>
        </tr>
      </thead>
      <tbody aria-busy={report === null}>
        {report === null ? (
          <LoadingRows columns={7} />
        ) : (
          <>
            {report.byAgent.map((row, index) => {
              const line = lineClass(index === report.byAgent.length - 1);
              return (
                <tr key={`${row.kind}:${row.agent ?? ""}`}>
                  <TextCell line={line}>
                    {agentText(row.agent, row.kind)}
                  </TextCell>
                  <TokenCells tokens={row.tokens} line={line} />
                  <NumberCell line={line} strong>
                    {usdText(row.usd)}
                  </NumberCell>
                </tr>
              );
            })}
            <TotalRow report={report} blanks={0} />
          </>
        )}
      </tbody>
    </table>
  );
}

interface SplitCardProps {
  /** null이면 첫 응답 전(스켈레톤 4줄). */
  report: CostReport | null;
}

export function SplitCard({ report }: SplitCardProps) {
  const [selected, setSelected] = useState<SplitTab>("model");
  return (
    <section
      data-wf="10-10"
      aria-label={COST_SPLIT_LABEL}
      className="col-span-full flex min-h-0 min-w-0 flex-col rounded-card border border-border bg-card"
    >
      <Tabs
        tabs={TABS}
        selected={selected}
        onSelect={setSelected}
        label={COST_SPLIT_LABEL}
        idPrefix={ID_PREFIX}
      />
      <div
        role="tabpanel"
        id={tabPanelId(ID_PREFIX)}
        aria-labelledby={tabId(ID_PREFIX, selected)}
        className="min-h-0 overflow-auto px-2 cost-split-pad"
      >
        {selected === "model" ? (
          <ModelTable report={report} />
        ) : selected === "session" ? (
          <SessionTable report={report} />
        ) : (
          <AgentTable report={report} />
        )}
      </div>
    </section>
  );
}
