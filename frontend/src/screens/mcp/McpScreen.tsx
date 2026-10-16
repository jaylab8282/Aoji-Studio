/**
 * ui-spec.md SCR-09 MCP(`/mcp`, 읽기 전용). 구성: 제목 줄(`09-2`) → 위쪽 줄(읽은 곳 `09-3` + 출처 오류 `09-10` | 커넥터 안내 `09-4`) → 목록 카드(`09-5`, `ExpandableList`).
 * 입력·쓰기 버튼을 두지 않는다(FR-023-AC6). 펼침은 이 컴포넌트의 로컬 상태다(기간을 바꿔도 유지, 라우트를 떠나면 버림 — conventions §7).
 * 조회·재조회는 `useMcpReport`. 화면 자체 `<main>`·`<h1>`을 두지 않는다(상단 바 하나).
 */
import { useState } from "react";
import type { McpServer, UsagePeriod } from "../../api/types";
import { DataTitle } from "../../components/data/DataTitle";
import { ExpandableList } from "../../components/data/ExpandableList";
import { PeriodSelector } from "../../components/data/PeriodSelector";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { NoticeCard } from "../../components/ui/NoticeCard";
import { Skeleton } from "../../components/ui/Skeleton";
import {
  MCP_COL_AGENTS,
  MCP_COL_LOCATIONS,
  MCP_COL_SERVER,
  MCP_EMPTY_BODY,
  MCP_EMPTY_TITLE,
  MCP_LIST_LABEL,
  MCP_SUBTITLE_LEAD,
  MCP_SUBTITLE_TAIL,
  MCP_TITLE,
  RETRY_BUTTON_LABEL,
} from "../../lib/text";
import { isCalledOnly } from "../../lib/derive/mcpRows";
import { McpRowCells } from "./McpRowCells";
import { McpRowDetail } from "./McpRowDetail";
import { McpSources } from "./McpSources";
import { useMcpReport } from "./useMcpReport";

export function McpScreen() {
  const [period, setPeriod] = useState<UsagePeriod>("7d");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const { report, errorMessage, retry } = useMcpReport(period);

  function toggle(name: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const subtitle = (
    <>
      {MCP_SUBTITLE_LEAD}
      {report === null ? (
        <Skeleton className="inline-block w-6 align-middle" />
      ) : (
        <span className="tabular-nums">{report.servers.length}</span>
      )}
      {MCP_SUBTITLE_TAIL}
    </>
  );

  return (
    <div className="flex flex-col gap-3 px-gutter py-6">
      <DataTitle title={MCP_TITLE} subtitle={subtitle} wf="09-2">
        <PeriodSelector value={period} onChange={setPeriod} range={report === null ? null : report.range} />
      </DataTitle>

      <McpSources report={report} />

      {errorMessage !== null ? (
        <div className="grid justify-items-start gap-2">
          <Alert message={errorMessage} />
          <Button variant="secondary" onClick={retry}>
            <Icon name="refresh-cw" />
            {RETRY_BUTTON_LABEL}
          </Button>
        </div>
      ) : report !== null && report.servers.length === 0 ? (
        <NoticeCard kind="empty" icon="plug" title={MCP_EMPTY_TITLE} wf="09-5">
          <p>{MCP_EMPTY_BODY}</p>
        </NoticeCard>
      ) : (
        <ExpandableList<McpServer>
          label={MCP_LIST_LABEL}
          wf="09-5"
          headers={[MCP_COL_SERVER, MCP_COL_LOCATIONS, MCP_COL_AGENTS]}
          columnsClass="mcp-row-grid"
          rows={report === null ? [] : report.servers}
          rowKey={(server) => server.name}
          rowName={(server) => server.name}
          expanded={expanded}
          onToggle={toggle}
          loading={report === null}
          chevWf="09-11"
          rowWf={(server) => (isCalledOnly(server) ? "09-9" : undefined)}
          renderCells={(server, control) => (
            <McpRowCells server={server} expanded={control.expanded} detailId={control.detailId} onToggle={control.toggle} />
          )}
          renderDetail={(server) => <McpRowDetail server={server} />}
        />
      )}
    </div>
  );
}
