PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at     TEXT    NOT NULL,   -- ISO-8601 with offset, 서버 수신 시각
  hook_event_name TEXT    NOT NULL,   -- FR-003-AC9 12종 중 하나
  session_id      TEXT    NOT NULL,
  agent_id        TEXT,               -- 서브에이전트일 때만
  agent_type      TEXT,               -- 없으면 로비 세션
  tool_name       TEXT,
  notification_type TEXT,
  cwd             TEXT,
  kind            TEXT    NOT NULL,   -- realtime-spec EventRow.kind
  title           TEXT    NOT NULL,   -- 예: '도구 실행 · Edit'
  summary         TEXT    NOT NULL    -- 마스킹 후, 200자 이하. tool_input 원문 없음
);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at);
CREATE INDEX IF NOT EXISTS idx_events_agent_type_received ON events(agent_type, received_at);

-- v1.2.0 테이블(architecture.md §6.5, ADR-80·81·83·92). 보존 삭제 없음 — EventRetentionJob은 events만 지운다.
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usage_hook_agg (
  bucket  TEXT NOT NULL,
  kind    TEXT NOT NULL,
  subject TEXT NOT NULL,
  agent   TEXT NOT NULL,
  count   INTEGER NOT NULL,
  PRIMARY KEY (bucket, kind, subject, agent));
CREATE INDEX IF NOT EXISTS idx_usage_hook_agg_kind_bucket ON usage_hook_agg(kind, bucket);
CREATE TABLE IF NOT EXISTS usage_token_agg (
  bucket TEXT NOT NULL, session_id TEXT NOT NULL,
  sub_agent TEXT NOT NULL,
  model TEXT NOT NULL,
  input INTEGER NOT NULL, output INTEGER NOT NULL, cache_creation INTEGER NOT NULL, cache_read INTEGER NOT NULL,
  PRIMARY KEY (bucket, session_id, sub_agent, model));
CREATE INDEX IF NOT EXISTS idx_usage_token_agg_bucket ON usage_token_agg(bucket);
CREATE TABLE IF NOT EXISTS usage_session (
  session_id TEXT PRIMARY KEY, project TEXT, started_at TEXT, entrypoint TEXT,
  main_agent TEXT);
CREATE TABLE IF NOT EXISTS transcript_file (
  path TEXT PRIMARY KEY,
  file_key TEXT, size INTEGER NOT NULL, offset INTEGER NOT NULL, mtime TEXT, failed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS transcript_msg (
  msg_key TEXT PRIMARY KEY,
  bucket TEXT NOT NULL, session_id TEXT NOT NULL, sub_agent TEXT NOT NULL, model TEXT NOT NULL,
  input INTEGER NOT NULL, output INTEGER NOT NULL, cache_creation INTEGER NOT NULL, cache_read INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS statusline_last (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  plan TEXT, plan_present INTEGER NOT NULL,
  five_pct REAL, five_reset TEXT, five_present INTEGER NOT NULL,
  seven_pct REAL, seven_reset TEXT, seven_present INTEGER NOT NULL,
  received_at TEXT NOT NULL);
