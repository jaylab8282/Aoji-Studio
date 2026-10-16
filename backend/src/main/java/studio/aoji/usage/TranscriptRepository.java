package studio.aoji.usage;

import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * 대화 기록 읽기 테이블 접근 ({@code transcript_file}·{@code transcript_msg}·{@code usage_token_agg}·
 * {@code usage_session}, architecture.md §6.5). 대화 내용이 들어가는 열은 없다. 집계 테이블 DELETE·DROP이 없다
 * (ADR-80 결정 8). 쓰기는 호출자의 수집 트랜잭션 안에서 하고, 그 트랜잭션은 {@code EventRepository#locked}
 * 잠금을 먼저 잡은 뒤 연다(D-160).
 */
@Repository
public class TranscriptRepository {

    /** {@code transcript_file} 한 행. */
    public record FileRow(String path, String fileKey, long size, long offset, String mtime, boolean failed) {}

    /** {@code transcript_msg} 한 행: 그 메시지가 지금 집계에 기여하고 있는 값과 위치. */
    public record MsgRow(
            String bucket,
            String sessionId,
            String subAgent,
            String model,
            long input,
            long output,
            long cacheCreation,
            long cacheRead) {

        public long sum() {
            return input + output + cacheCreation + cacheRead;
        }
    }

    /** {@code usage_session} 한 행. */
    public record SessionRow(String sessionId, String project, String startedAt, String entrypoint, String mainAgent) {}

    private final JdbcClient jdbcClient;

    public TranscriptRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    // ---- transcript_file ---------------------------------------------------------------------------------------

    public Optional<FileRow> findFile(String path) {
        return jdbcClient
                .sql("SELECT path, file_key, size, offset, mtime, failed FROM transcript_file WHERE path = :path")
                .param("path", path)
                .query((rs, n) -> new FileRow(
                        rs.getString("path"),
                        rs.getString("file_key"),
                        rs.getLong("size"),
                        rs.getLong("offset"),
                        rs.getString("mtime"),
                        rs.getInt("failed") != 0))
                .optional();
    }

    public void upsertFile(FileRow row) {
        jdbcClient
                .sql(
                        """
                        INSERT INTO transcript_file (path, file_key, size, offset, mtime, failed)
                        VALUES (:path, :fileKey, :size, :offset, :mtime, :failed)
                        ON CONFLICT(path) DO UPDATE SET
                          file_key = :fileKey, size = :size, offset = :offset, mtime = :mtime, failed = :failed
                        """)
                .param("path", row.path())
                .param("fileKey", row.fileKey())
                .param("size", row.size())
                .param("offset", row.offset())
                .param("mtime", row.mtime())
                .param("failed", row.failed() ? 1 : 0)
                .update();
    }

    public long countFailedFiles() {
        return jdbcClient
                .sql("SELECT COUNT(*) FROM transcript_file WHERE failed = 1")
                .query(Long.class)
                .single();
    }

    /** 주어진 경로 중 {@code failed = 1}인 수. */
    public long countFailedAmong(List<String> paths) {
        long count = 0;
        for (List<String> chunk : chunks(paths, 500)) {
            count += jdbcClient
                    .sql("SELECT COUNT(*) FROM transcript_file WHERE failed = 1 AND path IN (:paths)")
                    .param("paths", chunk)
                    .query(Long.class)
                    .single();
        }
        return count;
    }

    private static <T> List<List<T>> chunks(List<T> list, int size) {
        List<List<T>> result = new java.util.ArrayList<>();
        for (int i = 0; i < list.size(); i += size) {
            result.add(list.subList(i, Math.min(list.size(), i + size)));
        }
        return result;
    }

    // ---- transcript_msg · usage_token_agg ------------------------------------------------------------------------

    public Optional<MsgRow> findMsg(String msgKey) {
        return jdbcClient
                .sql(
                        """
                        SELECT bucket, session_id, sub_agent, model, input, output, cache_creation, cache_read
                        FROM transcript_msg WHERE msg_key = :key
                        """)
                .param("key", msgKey)
                .query((rs, n) -> new MsgRow(
                        rs.getString("bucket"),
                        rs.getString("session_id"),
                        rs.getString("sub_agent"),
                        rs.getString("model"),
                        rs.getLong("input"),
                        rs.getLong("output"),
                        rs.getLong("cache_creation"),
                        rs.getLong("cache_read")))
                .optional();
    }

    public void upsertMsg(String msgKey, MsgRow row) {
        jdbcClient
                .sql(
                        """
                        INSERT INTO transcript_msg
                          (msg_key, bucket, session_id, sub_agent, model, input, output, cache_creation, cache_read)
                        VALUES (:key, :bucket, :session, :subAgent, :model, :input, :output, :cacheCreation, :cacheRead)
                        ON CONFLICT(msg_key) DO UPDATE SET
                          bucket = :bucket, session_id = :session, sub_agent = :subAgent, model = :model,
                          input = :input, output = :output, cache_creation = :cacheCreation, cache_read = :cacheRead
                        """)
                .param("key", msgKey)
                .param("bucket", row.bucket())
                .param("session", row.sessionId())
                .param("subAgent", row.subAgent())
                .param("model", row.model())
                .param("input", row.input())
                .param("output", row.output())
                .param("cacheCreation", row.cacheCreation())
                .param("cacheRead", row.cacheRead())
                .update();
    }

    /** 집계 칸에 {@code sign}(+1·-1) × 4값을 더한다. 빼서 0이 된 칸도 남겨 둔다(합에 영향 없음). */
    public void addAgg(MsgRow row, int sign) {
        jdbcClient
                .sql(
                        """
                        INSERT INTO usage_token_agg
                          (bucket, session_id, sub_agent, model, input, output, cache_creation, cache_read)
                        VALUES (:bucket, :session, :subAgent, :model, :input, :output, :cacheCreation, :cacheRead)
                        ON CONFLICT(bucket, session_id, sub_agent, model) DO UPDATE SET
                          input = input + :input, output = output + :output,
                          cache_creation = cache_creation + :cacheCreation, cache_read = cache_read + :cacheRead
                        """)
                .param("bucket", row.bucket())
                .param("session", row.sessionId())
                .param("subAgent", row.subAgent())
                .param("model", row.model())
                .param("input", sign * row.input())
                .param("output", sign * row.output())
                .param("cacheCreation", sign * row.cacheCreation())
                .param("cacheRead", sign * row.cacheRead())
                .update();
    }

    // ---- usage_session ---------------------------------------------------------------------------------------------

    public Optional<SessionRow> findSession(String sessionId) {
        return jdbcClient
                .sql(
                        """
                        SELECT session_id, project, started_at, entrypoint, main_agent
                        FROM usage_session WHERE session_id = :id
                        """)
                .param("id", sessionId)
                .query(TranscriptRepository::mapSession)
                .optional();
    }

    public void insertSession(SessionRow row) {
        jdbcClient
                .sql(
                        """
                        INSERT INTO usage_session (session_id, project, started_at, entrypoint, main_agent)
                        VALUES (:id, :project, :startedAt, :entrypoint, :mainAgent)
                        """)
                .param("id", row.sessionId())
                .param("project", row.project())
                .param("startedAt", row.startedAt())
                .param("entrypoint", row.entrypoint())
                .param("mainAgent", row.mainAgent())
                .update();
    }

    public void updateSessionMeta(String sessionId, String project, String startedAt, String entrypoint) {
        jdbcClient
                .sql(
                        """
                        UPDATE usage_session SET project = :project, started_at = :startedAt, entrypoint = :entrypoint
                        WHERE session_id = :id
                        """)
                .param("id", sessionId)
                .param("project", project)
                .param("startedAt", startedAt)
                .param("entrypoint", entrypoint)
                .update();
    }

    public void setMainAgent(String sessionId, String mainAgent) {
        jdbcClient
                .sql("UPDATE usage_session SET main_agent = :agent WHERE session_id = :id")
                .param("id", sessionId)
                .param("agent", mainAgent)
                .update();
    }

    /** {@code main_agent}가 NULL(미확인)인 세션 id. */
    public List<String> findSessionsWithoutMainAgent() {
        return jdbcClient
                .sql("SELECT session_id FROM usage_session WHERE main_agent IS NULL")
                .query(String.class)
                .list();
    }

    /**
     * hook {@code SessionStart}에서 본 이 세션의 에이전트(ADR-81 결정 5 ②): {@code agent_type}이 있으면 그
     * 이름, 이벤트는 있는데 {@code agent_type}이 없으면 {@code ""}, 이벤트가 없으면 빈 값.
     */
    public Optional<String> findSessionStartAgent(String sessionId) {
        List<String> rows = jdbcClient
                .sql(
                        """
                        SELECT COALESCE(agent_type, '') FROM events
                        WHERE hook_event_name = 'SessionStart' AND session_id = :id
                        ORDER BY id DESC LIMIT 1
                        """)
                .param("id", sessionId)
                .query(String.class)
                .list();
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    // ---- 조회(GET /api/cost) -----------------------------------------------------------------------------------------

    /** 집계 한 칸과 세션 정보. */
    public record AggRow(
            String bucket,
            String sessionId,
            String subAgent,
            String model,
            long input,
            long output,
            long cacheCreation,
            long cacheRead,
            String project,
            String startedAt,
            String entrypoint,
            String mainAgent,
            boolean sessionKnown) {}

    /** 구간 시작이 {@code [fromBucket, toBucket)}인 집계 칸. 경계가 {@code null}이면 그쪽은 열려 있다. */
    public List<AggRow> findAgg(String fromBucket, String toBucket) {
        return jdbcClient
                .sql(
                        """
                        SELECT a.bucket, a.session_id, a.sub_agent, a.model, a.input, a.output, a.cache_creation,
                               a.cache_read, s.session_id AS known, s.project, s.started_at, s.entrypoint, s.main_agent
                        FROM usage_token_agg a LEFT JOIN usage_session s ON s.session_id = a.session_id
                        WHERE (:from IS NULL OR a.bucket >= :from) AND (:to IS NULL OR a.bucket < :to)
                        """)
                .param("from", fromBucket)
                .param("to", toBucket)
                .query((rs, n) -> new AggRow(
                        rs.getString("bucket"),
                        rs.getString("session_id"),
                        rs.getString("sub_agent"),
                        rs.getString("model"),
                        rs.getLong("input"),
                        rs.getLong("output"),
                        rs.getLong("cache_creation"),
                        rs.getLong("cache_read"),
                        rs.getString("project"),
                        rs.getString("started_at"),
                        rs.getString("entrypoint"),
                        rs.getString("main_agent"),
                        rs.getString("known") != null))
                .list();
    }

    private static SessionRow mapSession(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new SessionRow(
                rs.getString("session_id"),
                rs.getString("project"),
                rs.getString("started_at"),
                rs.getString("entrypoint"),
                rs.getString("main_agent"));
    }
}
