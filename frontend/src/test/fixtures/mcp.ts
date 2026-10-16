/**
 * 테스트 전용 `GET /api/mcp` fixture. api-spec.yaml `McpReport`·`McpServer` 스키마를 그대로 따른다.
 */
import type { McpReport, McpServer, McpSource } from "../../api/types";

export function buildMcpServer(name: string, overrides: Partial<McpServer> = {}): McpServer {
  return {
    name,
    locations: [{ kind: "project", detail: null }],
    active: null,
    transport: "stdio",
    command: `npx ${name}`,
    url: null,
    maskedSettings: [],
    definedAgents: [],
    inheritAllCount: null,
    actualAgents: [],
    usedAgentCount: 0,
    ...overrides,
  };
}

export const CONNECTED_SOURCES: McpSource[] = [
  { key: "project", state: "read", serverCount: 2, calledOnlyCount: 0 },
  { key: "global", state: "connected", serverCount: 1, calledOnlyCount: 0 },
  { key: "plugin", state: "connected", serverCount: 1, calledOnlyCount: 0 },
  { key: "agents", state: "read", serverCount: 1, calledOnlyCount: 1 },
];

export function buildMcpReport(servers: McpServer[], overrides: Partial<McpReport> = {}): McpReport {
  return {
    period: "7d",
    range: { from: "2026-10-09", to: "2026-10-15" },
    hookConfigured: true,
    sources: CONNECTED_SOURCES,
    sourceErrors: [],
    globalReadAt: "2026-10-15T14:30:12+09:00",
    servers,
    ...overrides,
  };
}
