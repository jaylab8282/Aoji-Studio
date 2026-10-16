/**
 * ui-spec SCR-09 펼친 내용: ① `09-7` 연결 방식 · 명령 또는 URL · 설정 값(가린 값은 서버 응답 그대로, FR-023-AC2·AC6)
 * ② `09-8` 정의상(`전체 상속 N명`) ③ 실제 사용 (횟수)(`기본 세션`, 없으면 `기록 없음`/`기간 안 호출 없음`, FR-024-E1).
 * 연결 정보는 두 열 전체, 정의상·실제 사용은 한 열씩(세로형 1열).
 */
import type { ReactNode } from "react";
import type { McpServer } from "../../api/types";
import { Chip } from "../../components/ui/Chip";
import {
  DEFAULT_SESSION_AGENT_TEXT,
  EMPTY_VALUE_TEXT,
  MCP_DETAIL_ACTUAL,
  MCP_DETAIL_CONNECTION,
  MCP_DETAIL_DEFINED,
  MCP_DETAIL_NO_CALLS,
  MCP_DETAIL_NO_DEFINITION,
  MCP_DETAIL_NO_RECORD,
  mcpInheritAllChip,
} from "../../lib/text";
import { isCalledOnly } from "../../lib/derive/mcpRows";

const LIST = "flex flex-wrap items-center gap-x-4 gap-y-1";
const MONO_ITEM = "font-mono text-text-mono";

function Block({ title, wf, wide = false, children }: { title: string; wf?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div data-wf={wf} className={wide ? "col-span-full" : undefined}>
      <div className="mb-0.5 font-semibold text-text-muted">{title}</div>
      {children}
    </div>
  );
}

function Connection({ server }: { server: McpServer }) {
  if (isCalledOnly(server)) return <span>{MCP_DETAIL_NO_DEFINITION}</span>;
  const target = [server.command, server.url].filter((value): value is string => value !== null);
  return (
    <div className="grid gap-1">
      {server.transport === null && target.length === 0 ? null : (
        <span className="flex min-w-0 items-center gap-2">
          {server.transport === null ? null : <Chip tone="outline">{server.transport}</Chip>}
          {target.length === 0 ? null : <span className="font-mono text-text-mono wrap-anywhere">{target.join(" ")}</span>}
        </span>
      )}
      {server.maskedSettings.map((setting) => (
        <span key={`${setting.group}:${setting.key}`} className="text-text-muted">
          {setting.group}{" "}
          <span className="font-mono text-text-mono wrap-anywhere">
            {setting.group === "env" ? `${setting.key}=${setting.value}` : `${setting.key}: ${setting.value}`}
          </span>
        </span>
      ))}
    </div>
  );
}

export function McpRowDetail({ server }: { server: McpServer }) {
  const calledOnly = isCalledOnly(server);
  const actual = server.actualAgents;
  return (
    <>
      <Block title={MCP_DETAIL_CONNECTION} wf="09-7" wide>
        <Connection server={server} />
      </Block>
      <Block title={MCP_DETAIL_DEFINED} wf="09-8">
        {calledOnly || (server.definedAgents.length === 0 && server.inheritAllCount === null) ? (
          <span>{EMPTY_VALUE_TEXT}</span>
        ) : (
          <div className={LIST}>
            {server.definedAgents.length === 0 ? <span>{EMPTY_VALUE_TEXT}</span> : null}
            {server.definedAgents.map((agent) => (
              <span key={agent} className={MONO_ITEM}>
                {agent}
              </span>
            ))}
            {server.inheritAllCount === null ? null : <Chip>{mcpInheritAllChip(server.inheritAllCount)}</Chip>}
          </div>
        )}
      </Block>
      <Block title={MCP_DETAIL_ACTUAL}>
        {actual === null ? (
          <span>{MCP_DETAIL_NO_RECORD}</span>
        ) : actual.length === 0 ? (
          <span>{MCP_DETAIL_NO_CALLS}</span>
        ) : (
          <div className={LIST}>
            {actual.map((entry) => (
              <span key={entry.agent ?? "default-session"} className={MONO_ITEM}>
                {entry.agent ?? DEFAULT_SESSION_AGENT_TEXT}
                <b className="ml-1 font-medium text-text">{entry.count}</b>
              </span>
            ))}
          </div>
        )}
      </Block>
    </>
  );
}
