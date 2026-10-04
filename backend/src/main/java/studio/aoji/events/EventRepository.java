package studio.aoji.events;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * {@code events} 테이블 접근 (architecture.md §6.5, ADR-09). 쓰기 주체는 서버 하나이고 SQLite는
 * 단일 커넥션이므로(architecture.md §6.5 "접근") insert·delete는 {@code synchronized}로 직렬화한다.
 */
@Repository
public class EventRepository {

    private final JdbcClient jdbcClient;

    public EventRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    /** 새 이벤트를 저장하고 생성된 {@code id}를 채운 행을 돌려준다. {@code event.id()}는 무시한다. */
    public synchronized EventRow insert(EventRow event) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcClient
                .sql(
                        """
                        INSERT INTO events
                          (received_at, hook_event_name, session_id, agent_id, agent_type,
                           tool_name, notification_type, cwd, kind, title, summary)
                        VALUES (:receivedAt, :hookEventName, :sessionId, :agentId, :agentType,
                                :toolName, :notificationType, :cwd, :kind, :title, :summary)
                        """)
                .param("receivedAt", format(event.receivedAt()))
                .param("hookEventName", event.hookEventName())
                .param("sessionId", event.sessionId())
                .param("agentId", event.agentId())
                .param("agentType", event.agentType())
                .param("toolName", event.toolName())
                .param("notificationType", event.notificationType())
                .param("cwd", event.cwd())
                .param("kind", event.kind())
                .param("title", event.title())
                .param("summary", event.summary())
                .update(keyHolder);

        long id = keyHolder.getKey().longValue();
        return new EventRow(
                id,
                event.receivedAt(),
                event.hookEventName(),
                event.sessionId(),
                event.agentId(),
                event.agentType(),
                event.toolName(),
                event.notificationType(),
                event.cwd(),
                event.kind(),
                event.title(),
                event.summary());
    }

    /** 최신순(01 실시간 이벤트 표, api-spec {@code GET /api/events}). */
    public List<EventRow> findRecent(int limit) {
        return jdbcClient
                .sql("SELECT * FROM events ORDER BY received_at DESC, id DESC LIMIT :limit")
                .param("limit", limit)
                .query(ROW_MAPPER)
                .list();
    }

    /** 특정 에이전트의 최근 이벤트(서브에이전트로 실행된 이벤트 포함, api-spec {@code GET /api/agents/{name}/events}). */
    public List<EventRow> findByAgentType(String agentType, int limit) {
        return jdbcClient
                .sql("SELECT * FROM events WHERE agent_type = :agentType ORDER BY received_at DESC, id DESC LIMIT :limit")
                .param("agentType", agentType)
                .param("limit", limit)
                .query(ROW_MAPPER)
                .list();
    }

    /** 30일 보존(FR-003-AC7). {@code cutoff}보다 이전 행을 지우고 지운 행 수를 돌려준다. */
    public synchronized int deleteOlderThan(OffsetDateTime cutoff) {
        return jdbcClient
                .sql("DELETE FROM events WHERE received_at < :cutoff")
                .param("cutoff", format(cutoff))
                .update();
    }

    /** 마지막 수신 시각(FR-003-AC6, 재시작 후 DB에서 복원). 이벤트가 없으면 빈 값. */
    public Optional<OffsetDateTime> findLastReceivedAt() {
        List<String> rows = jdbcClient
                .sql("SELECT MAX(received_at) AS latest FROM events")
                .query((rs, rowNum) -> rs.getString("latest"))
                .list();
        String latest = rows.isEmpty() ? null : rows.get(0);
        return latest == null ? Optional.empty() : Optional.of(parse(latest));
    }

    /**
     * agent_type별 마지막 이벤트(ADR-09 {@code lastEventByAgent}, 01 카드 최근 활동 · 기동 시 시드용).
     * key = agent_type.
     */
    public Map<String, EventRow> findLastEventByAgent() {
        List<EventRow> rows = jdbcClient
                .sql("SELECT * FROM events WHERE agent_type IS NOT NULL ORDER BY received_at DESC, id DESC")
                .query(ROW_MAPPER)
                .list();
        Map<String, EventRow> result = new LinkedHashMap<>();
        for (EventRow row : rows) {
            result.putIfAbsent(row.agentType(), row);
        }
        return result;
    }

    private static final RowMapper<EventRow> ROW_MAPPER = EventRepository::mapRow;

    private static EventRow mapRow(ResultSet rs, int rowNum) throws SQLException {
        return new EventRow(
                rs.getLong("id"),
                parse(rs.getString("received_at")),
                rs.getString("hook_event_name"),
                rs.getString("session_id"),
                rs.getString("agent_id"),
                rs.getString("agent_type"),
                rs.getString("tool_name"),
                rs.getString("notification_type"),
                rs.getString("cwd"),
                rs.getString("kind"),
                rs.getString("title"),
                rs.getString("summary"));
    }

    private static String format(OffsetDateTime time) {
        return time.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private static OffsetDateTime parse(String text) {
        return OffsetDateTime.parse(text, DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }
}
