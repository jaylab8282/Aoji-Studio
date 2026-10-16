/**
 * ui-spec.md SCR-10 비용(`/cost`, 읽기 전용). 구성: 제목 줄(`10-2`, 기간 선택 + 날짜 범위 + `단가`) → 대화 기록 띠(`10-3`) →
 * 합계 줄(`10-4`·`10-5`) → [날짜별 차트(`10-7`) | 구독·한도 카드(`10-6`)] → 나눔 표(`10-10`).
 * 연결 안 됨(FR-025-E1)·기간 안 기록 0·조회 실패면 합계·차트·표 자리를 안내 카드(또는 `Alert`)가 대신한다(한도 카드는 그대로).
 * 조회·재조회는 `useCostReport`/`useLimitsReport`, 띠는 SSE `usage-changed`의 `transcripts`가 있으면 GET 없이 바로 갱신한다.
 * 화면 자체 `<main>`·`<h1>`을 두지 않는다(상단 바 하나).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { UsagePeriod } from "../../api/types";
import { DataTitle } from "../../components/data/DataTitle";
import { PeriodSelector } from "../../components/data/PeriodSelector";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { MonoText } from "../../components/ui/MonoText";
import { NoticeCard } from "../../components/ui/NoticeCard";
import { useDialogNavigate } from "../../lib/dialogNavigate";
import {
  COST_EMPTY_PERIOD_TITLE,
  COST_NOT_CONNECTED_BODY_LEAD,
  COST_NOT_CONNECTED_BODY_TAIL,
  COST_NOT_CONNECTED_TITLE,
  COST_PRICE_BUTTON_LABEL,
  COST_STRIP_PATH,
  COST_SUBTITLE,
  COST_TITLE,
  OPEN_SETTINGS_BUTTON_LABEL,
  RETRY_BUTTON_LABEL,
} from "../../lib/text";
import { pricingStore, usePricingStore } from "../../state/pricingStore";
import { useTranscriptSignal } from "../../state/usageSignalStore";
import { DateChart } from "./DateChart";
import { LimitsCard } from "./LimitsCard";
import { ReadingStrip } from "./ReadingStrip";
import { SplitCard } from "./SplitCard";
import { TokenTiles } from "./TokenTiles";
import { useCostReport, useLimitsReport } from "./useCostReport";
import { useNow } from "./useNow";

export function CostScreen() {
  const navigate = useNavigate();
  const openDialog = useDialogNavigate();
  const [period, setPeriod] = useState<UsagePeriod>("7d");
  const { report, errorMessage, retry } = useCostReport(period);
  const { limits, errorMessage: limitsError, retry: retryLimits } = useLimitsReport();
  const signalTranscripts = useTranscriptSignal();
  const { pricing } = usePricingStore();
  const now = useNow();

  useEffect(() => {
    pricingStore.load();
  }, []);

  const transcripts = signalTranscripts ?? (report === null ? null : report.transcripts);
  const disconnected = transcripts !== null && !transcripts.connected;
  const failed = errorMessage !== null && !disconnected;
  const empty = !disconnected && !failed && report !== null && report.totals.total === 0;
  const noticeInstead = disconnected || failed || empty;
  const dataReport = disconnected ? null : report;

  const priceButton = (
    <Button
      variant="secondary"
      disabled={pricing === null}
      onClick={() => openDialog({ dialog: "price" })}
    >
      <Icon name="receipt" />
      {COST_PRICE_BUTTON_LABEL}
    </Button>
  );

  return (
    <div className="cost-main">
      <div className="col-span-full">
        <DataTitle title={COST_TITLE} subtitle={COST_SUBTITLE} wf="10-2">
          <PeriodSelector value={period} onChange={setPeriod} range={report === null ? null : report.range} />
          {priceButton}
        </DataTitle>
      </div>

      <ReadingStrip transcripts={transcripts} />

      {empty ? null : failed ? null : (
        <TokenTiles report={dataReport} disconnected={disconnected} hasPlan={limits !== null && limits.plan.value !== null} />
      )}

      {disconnected ? (
        <NoticeCard
          kind="empty"
          icon="file-warning"
          title={COST_NOT_CONNECTED_TITLE}
          wf="10-7"
          actions={
            <Button variant="secondary" onClick={() => navigate("/settings")}>
              <Icon name="settings" />
              {OPEN_SETTINGS_BUTTON_LABEL}
            </Button>
          }
        >
          <p>
            {COST_NOT_CONNECTED_BODY_LEAD}
            <MonoText>{COST_STRIP_PATH}</MonoText>
            {COST_NOT_CONNECTED_BODY_TAIL}
          </p>
        </NoticeCard>
      ) : failed ? (
        <div className="cost-slot-main grid content-start justify-items-start gap-2">
          <Alert message={errorMessage} />
          <Button variant="secondary" onClick={retry}>
            <Icon name="refresh-cw" />
            {RETRY_BUTTON_LABEL}
          </Button>
        </div>
      ) : empty ? (
        <div className="cost-slot-main">
          <NoticeCard kind="empty" icon="coins" title={COST_EMPTY_PERIOD_TITLE} wf="10-7" />
        </div>
      ) : (
        <DateChart byDate={report === null ? null : report.byDate} />
      )}

      <LimitsCard limits={limits} errorMessage={limitsError} onRetry={retryLimits} now={now} alongsideNotice={empty || failed} />

      {noticeInstead ? null : <SplitCard report={report} />}
    </div>
  );
}
