package studio.aoji.usage;

import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * 집계 테이블 접근 (architecture.md §6.5). 이 클래스에는 집계 테이블 DELETE·DROP이 없다
 * (ADR-80 결정 8). 쓰기 동기화는 호출자(수집 트랜잭션 = {@code EventRepository#insertAnd})가 맡는다.
 */
@Repository
public class UsageRepository {

    public static final String BACKFILL_KEY = "usage_backfill_v1";

    /** {@code usage_hook_agg} 한 행. */
    public record HookAggRow(String bucket, String kind, String subject, String agent, long count) {}

    private final JdbcClient jdbcClient;

    public UsageRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    /** {@code count = count + delta} UPSERT. */
    public void incrementHookAgg(String bucket, HookUsageEntry entry, long delta) {
        jdbcClient
                .sql(
                        """
                        INSERT INTO usage_hook_agg (bucket, kind, subject, agent, count)
                        VALUES (:bucket, :kind, :subject, :agent, :delta)
                        ON CONFLICT(bucket, kind, subject, agent) DO UPDATE SET count = count + :delta
                        """)
                .param("bucket", bucket)
                .param("kind", entry.kind())
                .param("subject", entry.subject())
                .param("agent", entry.agent())
                .param("delta", delta)
                .update();
    }

    /** 구간 시작이 {@code [fromBucket, toBucket)}인 행. 경계가 {@code null}이면 그쪽은 열려 있다. */
    public List<HookAggRow> findHookAgg(String fromBucket, String toBucket) {
        return jdbcClient
                .sql(
                        """
                        SELECT bucket, kind, subject, agent, count FROM usage_hook_agg
                        WHERE (:from IS NULL OR bucket >= :from) AND (:to IS NULL OR bucket < :to)
                        ORDER BY bucket, kind, subject, agent
                        """)
                .param("from", fromBucket)
                .param("to", toBucket)
                .query((rs, n) -> new HookAggRow(
                        rs.getString("bucket"),
                        rs.getString("kind"),
                        rs.getString("subject"),
                        rs.getString("agent"),
                        rs.getLong("count")))
                .list();
    }

    public boolean isBackfillDone() {
        return jdbcClient
                        .sql("SELECT COUNT(*) FROM schema_meta WHERE key = :key AND value = 'done'")
                        .param("key", BACKFILL_KEY)
                        .query(Long.class)
                        .single()
                > 0;
    }

    public void markBackfillDone() {
        jdbcClient
                .sql("INSERT OR REPLACE INTO schema_meta (key, value) VALUES (:key, 'done')")
                .param("key", BACKFILL_KEY)
                .update();
    }
}
