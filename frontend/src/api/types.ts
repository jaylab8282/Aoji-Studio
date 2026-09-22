/**
 * api-spec.yaml `components.schemas`를 그대로 옮긴 타입.
 * 필드·이름은 스펙과 동일하게 유지한다(conventions.md §2 "TS 타입 = api-spec 스키마 이름과 동일").
 * `Settings.mountPath`는 없다(ADR-20, D-021).
 */

export type Status = "running" | "waiting" | "idle";

export type Role = "lead" | "member";

export interface Config {
  hostPath: string;
  publicOrigin: string;
  collectUrl: string;
  helperUrl: string;
  defaultSessionCommand: string;
}

export interface AgentDef {
  name: string;
  description: string;
  filePath: string;
  workflow: string | null;
  role: Role | null;
  duplicateWorkflows: string[];
}

export interface Workflow {
  name: string;
  description: string;
  filePath: string;
  lead: string | null;
  members: string[];
  brokenRefs: string[];
  rawMemberCount: number;
}

export type FormatErrorKind = "agent" | "workflow" | "broken-ref";

export interface FormatError {
  kind: FormatErrorKind;
  file: string;
  message: string;
  workflow?: string;
}

export interface Registry {
  revision: number;
  scannedAt: string;
  agentsDirMissing: boolean;
  writable: boolean;
  agentCount: number | null;
  skillCount: number;
  agents: AgentDef[];
  workflows: Workflow[];
  formatErrors: FormatError[];
  hookConfigured: boolean;
}

export interface ToolRef {
  name: string;
  target: string;
}

export interface AgentLive {
  name: string;
  status: Status;
  currentTool: ToolRef | null;
  sessionStartedAt: string | null;
  childCount: number;
  cwd: string | null;
  parentLabel: string | null;
  lastEventAt: string | null;
  lastEvent: EventRow | null;
}

export type LobbyEntryKind = "session" | "agent";

export interface LobbyEntry {
  kind: LobbyEntryKind;
  label: string;
  status: Status;
  sessionId: string;
  currentTool: ToolRef | null;
}

export interface UndefinedSubagent {
  agentId: string;
  agentType: string;
  sessionId: string;
  status: Status;
  currentTool: ToolRef | null;
  parentAgentName: string | null;
  parentLabel: string;
  startedAt: string;
}

export interface Live {
  lastReceivedAt: string | null;
  everReceived: boolean;
  agents: Record<string, AgentLive>;
  lobby: LobbyEntry[];
  undefinedSubagents: UndefinedSubagent[];
}

export type HookEventName =
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "Stop"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "PermissionRequest"
  | "PermissionDenied"
  | "Notification"
  | "SubagentStart"
  | "SubagentStop";

export type EventKind =
  | "session-start"
  | "session-end"
  | "prompt"
  | "stop"
  | "tool"
  | "tool-done"
  | "tool-failure"
  | "permission"
  | "permission-denied"
  | "notification"
  | "subagent-start"
  | "subagent-stop";

export interface EventRow {
  id: number;
  at: string;
  hookEventName: HookEventName;
  kind: EventKind;
  title: string;
  summary: string;
  sessionId: string;
  agentId: string | null;
  agentType: string | null;
  agentLabel: string;
  toolName: string | null;
  workflow?: string | null;
}

export interface Snapshot {
  serverTime: string;
  config: Config;
  registry: Registry;
  live: Live;
  recentEvents: EventRow[];
}

export interface AgentDetail {
  name: string;
  description: string;
  model: string | null;
  tools: string[] | null;
  body: string;
  filePath: string;
  revision: string;
  modifiedAt: string;
  workflow: string | null;
  role: Role | null;
  status: Status;
  hasLiteralInheritModel: boolean;
}

export interface AgentCreateRequest {
  name: string;
  description: string;
  model?: string | null;
  workflow: string;
  role: Role;
  toolsMode: "inherit" | "explicit";
  tools?: string[];
  body?: string;
}

export interface AgentUpdateRequest {
  name: string;
  description: string;
  model?: string | null;
  workflow: string | null;
  role: Role | null;
  toolsMode: "inherit" | "explicit";
  tools?: string[];
  body: string;
  expectedRevision: string;
  force?: boolean;
}

export interface Settings {
  hostPath: string;
  agentCount: number | null;
  skillCount: number;
  writable: boolean;
  formatErrorCount: number;
  agentsDirMissing: boolean;
  terminalApp: string;
  defaultSessionCommand: string;
  leadSessionCommandTemplate: string;
  helperUrl: string;
  collectUrl: string;
  hookConfigured: boolean;
  hookSettingsExample: string;
  teamsPath: string;
  trashPath: string;
  retentionDays: number;
  allowedHttpHookUrlsNote: string;
}

export type ApiErrorCode =
  | "VALIDATION"
  | "FORBIDDEN_ORIGIN"
  | "UNAUTHORIZED_TOKEN"
  | "READ_ONLY"
  | "AGENT_NOT_FOUND"
  | "WORKFLOW_NOT_FOUND"
  | "UNEDITABLE"
  | "REVISION_CONFLICT"
  | "AGENT_BUSY"
  | "FILE_GONE"
  | "LEAD_EXISTS"
  | "WORKFLOW_NOT_EMPTY"
  | "IO_FAILED"
  | "NETWORK_ERROR";

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
}
