/**
 * ui-spec SCR-09 위쪽 줄: 읽은 곳 카드(`09-3`, 칸 4개 + 출처 오류 줄 `09-10`)와 커넥터 안내(`09-4`).
 * 읽은 곳 칸은 서버가 준 `sources`(project → global → plugin → agents) 상태를 그대로 글자로 옮긴다. 첫 응답 전에는 상태 글자가 스켈레톤이다.
 * 출처 오류 줄은 `sourceErrors`가 있을 때만 한 덩어리(`09-10`)로 그리고, `설정 열기`는 연결 안 됨 줄이 있을 때 한 번만 둔다(→ `/settings`).
 */
import { useNavigate } from "react-router-dom";
import type { McpReport, McpSource, McpSourceError, McpSourceKey } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { MonoText } from "../../components/ui/MonoText";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatusDot } from "../../components/ui/StatusDot";
import { formatHms } from "../../lib/format/time";
import {
  EMPTY_VALUE_TEXT,
  MCP_CONNECTOR_BODY,
  MCP_CONNECTOR_TITLE,
  MCP_GLOBAL_READ_AT_LEAD,
  MCP_SOURCES_LABEL,
  MCP_SOURCE_AGENTS_PATH,
  MCP_SOURCE_AGENTS_TITLE,
  MCP_SOURCE_ERROR_NOT_CONNECTED,
  MCP_SOURCE_ERROR_OUTSIDE_LINK,
  MCP_SOURCE_ERROR_TAIL,
  MCP_SOURCE_GLOBAL_PATH,
  MCP_SOURCE_GLOBAL_TITLE,
  MCP_SOURCE_PLUGIN_PATH,
  MCP_SOURCE_PLUGIN_TITLE,
  MCP_SOURCE_PROJECT_PATH,
  MCP_SOURCE_PROJECT_TITLE,
  MCP_SOURCE_STATE_ERROR,
  MCP_SOURCE_STATE_NOT_CONNECTED,
  OPEN_SETTINGS_BUTTON_LABEL,
  mcpSourceAgentsText,
  mcpSourceConnectedText,
  mcpSourceErrorParse,
  mcpSourceReadText,
} from "../../lib/text";

const SOURCE_ORDER: readonly McpSourceKey[] = ["project", "global", "plugin", "agents"];
const SOURCE_META: Record<McpSourceKey, { title: string; path: string }> = {
  project: { title: MCP_SOURCE_PROJECT_TITLE, path: MCP_SOURCE_PROJECT_PATH },
  global: { title: MCP_SOURCE_GLOBAL_TITLE, path: MCP_SOURCE_GLOBAL_PATH },
  plugin: { title: MCP_SOURCE_PLUGIN_TITLE, path: MCP_SOURCE_PLUGIN_PATH },
  agents: { title: MCP_SOURCE_AGENTS_TITLE, path: MCP_SOURCE_AGENTS_PATH },
};

function stateText(source: McpSource): string {
  switch (source.state) {
    case "not-connected":
      return MCP_SOURCE_STATE_NOT_CONNECTED;
    case "error":
      return MCP_SOURCE_STATE_ERROR;
    case "connected":
      return mcpSourceConnectedText(source.serverCount);
    default:
      return source.key === "agents"
        ? mcpSourceAgentsText(source.serverCount, source.calledOnlyCount)
        : mcpSourceReadText(source.serverCount);
  }
}

function errorText(error: McpSourceError): string {
  switch (error.kind) {
    case "not-connected":
      return MCP_SOURCE_ERROR_NOT_CONNECTED;
    case "outside-link":
      return MCP_SOURCE_ERROR_OUTSIDE_LINK;
    default:
      return mcpSourceErrorParse(error.line);
  }
}

function SourceCell({ keyName, source }: { keyName: McpSourceKey; source: McpSource | undefined }) {
  const meta = SOURCE_META[keyName];
  const bad = source !== undefined && (source.state === "not-connected" || source.state === "error");
  return (
    <div className="grid min-w-0 gap-0.5">
      <b className="font-semibold text-text">{meta.title}</b>
      <MonoText className="truncate" title={meta.path}>
        {meta.path}
      </MonoText>
      {source === undefined ? (
        <Skeleton className="w-32" aria-label={`${meta.title} 상태 로딩 중`} />
      ) : (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${bad ? "font-semibold text-danger" : "text-text-secondary"}`}>
          <StatusDot status={bad ? "danger" : "idle"} />
          {stateText(source)}
        </span>
      )}
    </div>
  );
}

interface McpSourcesProps {
  report: McpReport | null;
}

export function McpSources({ report }: McpSourcesProps) {
  const navigate = useNavigate();
  const errors = report === null ? [] : report.sourceErrors;
  const firstNotConnected = errors.findIndex((error) => error.kind === "not-connected");

  return (
    <div className="mcp-top-grid">
      <section aria-label={MCP_SOURCES_LABEL} data-wf="09-3" className="grid min-w-0 gap-3 rounded-card border border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <h2 className="text-section font-semibold text-text">{MCP_SOURCES_LABEL}</h2>
          <span className="flex-1" />
          <span className="text-aux text-text-muted">
            {MCP_GLOBAL_READ_AT_LEAD}
            {report === null ? (
              <Skeleton className="inline-block w-16 align-middle" aria-label="읽은 시각 로딩 중" />
            ) : (
              <span className="font-mono text-text-mono">
                {report.globalReadAt === null ? EMPTY_VALUE_TEXT : formatHms(report.globalReadAt)}
              </span>
            )}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-x-4 gap-y-2 text-aux portrait:grid-cols-2">
          {SOURCE_ORDER.map((key) => (
            <SourceCell
              key={key}
              keyName={key}
              source={report === null ? undefined : report.sources.find((source) => source.key === key)}
            />
          ))}
        </div>
        {errors.length === 0 ? null : (
          <div
            role="alert"
            data-wf="09-10"
            className="grid gap-1 rounded-card border border-danger-border bg-danger-soft px-3 py-2 text-aux"
          >
            {errors.map((error, index) => (
              <div key={`${error.source}:${error.file}:${error.kind}`} className="flex min-w-0 items-center gap-3">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-danger">
                  <Icon name="circle-alert" />
                  <span className="font-mono">{error.file}</span> · {errorText(error)}
                </span>
                <span className="min-w-0 truncate text-text">{MCP_SOURCE_ERROR_TAIL}</span>
                <span className="flex-1" />
                {index === firstNotConnected ? (
                  <Button variant="secondary" onClick={() => navigate("/settings")}>
                    <Icon name="settings" />
                    {OPEN_SETTINGS_BUTTON_LABEL}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
      <aside data-wf="09-4" className="grid min-w-0 content-start gap-2 rounded-card border border-border bg-inset px-4 py-3 text-aux text-text-secondary">
        <h2 className="flex items-center gap-2 text-body font-semibold text-text">
          <Icon name="info" className="text-text-muted" />
          {MCP_CONNECTOR_TITLE}
        </h2>
        <p>{MCP_CONNECTOR_BODY}</p>
      </aside>
    </div>
  );
}
