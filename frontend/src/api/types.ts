/**
 * api-spec.yaml `components.schemas`를 그대로 옮긴 타입.
 * 필드·이름은 스펙과 동일하게 유지한다(conventions.md §2 "TS 타입 = api-spec 스키마 이름과 동일").
 * `Settings.mountPath`는 없다(ADR-20, D-021).
 */

export type Status = "running" | "waiting" | "idle";

export type Role = "lead" | "member";

/** 실행 환경(`AOJISTUDIO_HOST_OS`, 비면 macos — ADR-77). */
export type HostOs = "macos" | "wsl";

export interface Config {
  hostPath: string;
  publicOrigin: string;
  collectUrl: string;
  helperUrl: string;
  /** 실행 환경별 기본 세션 명령(FR-013-AC1). 팀장 명령 = 이 값 + ` --agent <팀장 name>`(FR-013-AC2, 프론트가 붙인다). */
  defaultSessionCommand: string;
  hostOs: HostOs;
  /** `hostOs`가 wsl일 때 배포판 이름, macos면 null. */
  wslDistro: string | null;
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
  /** v1.2.0 — 구성 파일 원본의 팀장 name(깨진 참조 포함). 05-4 남은 에이전트 목록. */
  rawLead: string | null;
  /** v1.2.0 — 구성 파일 원본의 팀원 name(깨진 참조 포함, 오름차순). 05-4 남은 에이전트 목록. */
  rawMembers: string[];
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

/**
 * `POST /api/workflows/{workflow}/members` (05-R 기존 에이전트 가져오기, FR-009).
 * api-spec.yaml의 인라인 스키마를 그대로 옮긴다. 정의 파일은 바꾸지 않고 소속만 기록한다(FR-009-AC3).
 */
export interface ImportMemberRequestItem {
  name: string;
  role: Role;
}

export interface ImportMembersRequest {
  members: ImportMemberRequestItem[];
}

/** 부분 성공 시 거부 사유(FR-009-E2). `ALREADY_ASSIGNED` = 가져오는 사이 다른 워크플로우에 소속됨. */
export type ImportRejectedReason = "ALREADY_ASSIGNED" | "NOT_FOUND" | "FORMAT_ERROR";

export interface ImportRejected {
  name: string;
  reason: ImportRejectedReason;
}

export interface ImportMembersResponse {
  added: string[];
  rejected: ImportRejected[];
  workflow: Workflow;
}

export type TerminalApp = "macOS 기본 터미널" | "Windows Terminal";

export interface Settings {
  hostOs: HostOs;
  wslDistro: string | null;
  statusline: StatuslineSettings;
  globalClaude: GlobalClaudeStatus;
  hostPath: string;
  agentCount: number | null;
  skillCount: number;
  writable: boolean;
  formatErrorCount: number;
  agentsDirMissing: boolean;
  terminalApp: TerminalApp;
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
  | "SKILL_NOT_FOUND"
  | "IMPORTED_SKILL"
  | "IMPORT_REJECTED"
  | "UPLOAD_NOT_FOUND"
  | "NETWORK_ERROR";

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// v1.2.0 스키마 (api-spec.yaml 1.2.0)
// ---------------------------------------------------------------------------

/** 07 상태줄 연동 카드(FR-014 Output·AC6, ADR-83). */
export interface StatuslineSettings {
  /** `설정 예시 복사`가 그대로 복사하는 JSON 조각(바깥 `{}` 없이 `"statusLine": {…}`). */
  settingsExample: string;
  lastReceivedAt: string | null;
}

export type GlobalClaudeItemKey = "claudeJson" | "settings" | "plugins" | "projects";

export interface GlobalClaudeItem {
  key: GlobalClaudeItemKey;
  connected: boolean;
}

/** 07 전역 Claude 설정 연결 카드(ADR-79). `items`는 4개, enum 순서 그대로. */
export interface GlobalClaudeStatus {
  items: GlobalClaudeItem[];
  readAt: string | null;
}

/** 기간 조회 파라미터 `period`(FR-019-AC4, FR-024-AC2, FR-025). */
export type UsagePeriod = "7d" | "30d" | "all";

export interface UsageRange {
  from: string | null;
  to: string;
}

export interface AgentCount {
  /** 에이전트 name(`agent_type`). null = `기본 세션`. */
  agent: string | null;
  count: number;
}

export interface SkillUsage {
  call: number;
  slash: number;
  preload: number;
  total: number;
}

export interface SkillRow {
  name: string;
  description: string;
  filePath: string;
  userOnly: boolean;
  imported: boolean;
  formatError: string | null;
  definedAgents: string[];
  usage: SkillUsage;
  percent: number | null;
  actualAgents: AgentCount[];
  definedUnused: string[];
  usedAgentCount: number;
}

export interface SkillsReport {
  period: UsagePeriod;
  range: UsageRange;
  hookConfigured: boolean;
  totalUses: number;
  skills: SkillRow[];
}

export interface SkillDetail {
  name: string;
  description: string;
  userOnly: boolean;
  body: string;
  filePath: string;
  revision: string;
  modifiedAt: string;
  imported: boolean;
}

export interface SkillCreateRequest {
  name: string;
  description: string;
  userOnly: boolean;
  body: string;
}

export interface SkillUpdateRequest {
  description: string;
  userOnly: boolean;
  body: string;
  expectedRevision: string;
  force?: boolean;
}

export type SkillImportRejectReason =
  | "NOT_ZIP"
  | "CORRUPT"
  | "NO_SKILL_MD"
  | "TOO_LARGE"
  | "TOO_MANY_FILES"
  | "UNPACKED_TOO_LARGE"
  | "ABSOLUTE_PATH"
  | "PATH_TRAVERSAL"
  | "SYMLINK"
  | "NAME_INVALID"
  | "NAME_EXISTS";

export interface SkillImportFile {
  path: string;
  size: number;
  script: boolean;
  executable: boolean;
}

export interface SkillImportPreview {
  uploadId: string;
  expiresAt: string;
  name: string;
  description: string;
  files: SkillImportFile[];
  fileCount: number;
  unpackedBytes: number;
  scriptCount: number;
  hasSourceMd: boolean;
}

export interface SkillImportRequest {
  uploadId: string;
  source: string;
  version?: string | null;
  license: string;
}

export type McpLocationKind = "project" | "global" | "plugin" | "agent" | "called-only";

export type McpSourceKey = "project" | "global" | "plugin" | "agents";
export type McpSourceState = "read" | "connected" | "not-connected" | "error";

export interface McpSource {
  key: McpSourceKey;
  state: McpSourceState;
  serverCount: number;
  /** agents 칸만 의미(`호출 기록만 N`), 그 밖 0. */
  calledOnlyCount: number;
}

export type McpSourceErrorKind = "parse" | "not-connected" | "outside-link";

export interface McpSourceError {
  source: "project" | "global" | "plugin";
  file: string;
  kind: McpSourceErrorKind;
  /** parse일 때 줄 번호. */
  line: number | null;
}

export interface McpLocation {
  kind: McpLocationKind;
  /** plugin = 플러그인 이름 / agent = 에이전트 name / 그 밖 null. */
  detail: string | null;
}

export interface McpMaskedSetting {
  group: "env" | "headers";
  key: string;
  /** 항상 `••••••••`. */
  value: string;
}

export interface McpServer {
  name: string;
  locations: McpLocation[];
  active: boolean | null;
  transport: string | null;
  command: string | null;
  url: string | null;
  maskedSettings: McpMaskedSetting[];
  definedAgents: string[];
  inheritAllCount: number | null;
  /** null → `기록 없음`(hookConfigured=false). 빈 배열 → `기간 안 호출 없음`. */
  actualAgents: AgentCount[] | null;
  usedAgentCount: number;
}

export interface McpReport {
  period: UsagePeriod;
  range: UsageRange;
  hookConfigured: boolean;
  /** 읽은 곳 카드 네 칸, 순서 project → global → plugin → agents. */
  sources: McpSource[];
  sourceErrors: McpSourceError[];
  globalReadAt: string | null;
  servers: McpServer[];
}

export interface TokenSums {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  total: number;
}

export type TranscriptState = "not-connected" | "reading" | "ready";

export interface TranscriptStatus {
  connected: boolean;
  state: TranscriptState;
  readFiles: number;
  totalFiles: number;
  skippedFiles: number;
}

export interface CostByDate {
  date: string;
  tokens: TokenSums;
  usd: number;
}

export interface CostByModel {
  model: string;
  tokens: TokenSums;
  /** null = `단가 없음`. */
  usd: number | null;
}

export interface CostBySession {
  sessionId: string;
  project: string | null;
  startedAt: string | null;
  entrypoint: string | null;
  tokens: TokenSums;
  usd: number;
}

export type CostAgentKind = "agent" | "main" | "unknown";

export interface CostByAgent {
  agent: string | null;
  kind: CostAgentKind;
  tokens: TokenSums;
  usd: number;
}

export interface CostReport {
  period: UsagePeriod;
  range: UsageRange;
  transcripts: TranscriptStatus;
  totals: TokenSums;
  estimate: { usd: number; excludedModelCount: number };
  byDate: CostByDate[];
  byModel: CostByModel[];
  bySession: CostBySession[];
  byAgent: CostByAgent[];
}

export interface PriceModel {
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface PriceTable {
  source: "Anthropic 가격표";
  sourceUrl?: string;
  checkedAt: string;
  unit: "USD / 1M tokens";
  models: PriceModel[];
}

export type LimitState = "ok" | "missing" | "never";

export interface LimitValue {
  state: LimitState;
  usedPercent: number | null;
  resetsAt: string | null;
  source: "statusline" | "cache" | null;
  receivedAt: string | null;
}

export interface Limits {
  plan: { value: string | null; receivedAt: string | null };
  fiveHour: LimitValue;
  sevenDay: LimitValue;
  statuslineLastReceivedAt: string | null;
}

export interface StatuslineWindow {
  used_percentage?: number;
  /** epoch 초 또는 ISO-8601. */
  resets_at?: number | string;
}

/** 상태줄 입력 JSON의 부분집합(ADR-83). 이 밖의 키는 무시한다. */
export interface StatuslinePayload {
  subscription_type?: string;
  rate_limits?: {
    five_hour?: StatuslineWindow;
    seven_day?: StatuslineWindow;
  };
  [key: string]: unknown;
}

/** Claude Code http hook 입력(`/hooks/events`). 브라우저는 보내지 않는다 — 계약 확인용 타입. */
export interface HookPayload {
  session_id: string;
  hook_event_name: string;
  cwd?: string;
  permission_mode?: string;
  transcript_path?: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  notification_type?: string;
  message?: string;
  /** UserPromptSubmit 프롬프트. 저장·로그·응답에 넣지 않는다(FR-003-AC10). */
  prompt?: string;
  reason?: string;
  source?: string;
  [key: string]: unknown;
}

/** SSE `usage-changed`의 `areas` 값(realtime-spec §2). */
export type UsageArea = "skills" | "mcp" | "cost" | "limits" | "settings";

/** SSE `usage-changed` 본문(realtime-spec §2). `transcripts`는 `cost`일 때만 값. */
export interface UsageChanged {
  areas: UsageArea[];
  transcripts: TranscriptStatus | null;
}
