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
