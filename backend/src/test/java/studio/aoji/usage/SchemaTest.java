package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

class SchemaTest {

    @TempDir
    Path tempDir;

    private static List<String> columns(UsageTestDb db, String table) {
        return db.jdbcClient
                .sql("SELECT name FROM pragma_table_info('" + table + "') ORDER BY cid")
                .query(String.class)
                .list();
    }

    @Test
    void v120TablesAreCreatedAndSchemaIsIdempotent() {
        // [FR-019-AC4] v1.2.0 테이블 생성, schema.sql을 다시 적용해도 오류·데이터 손실 없음
        UsageTestDb db = new UsageTestDb(tempDir.resolve("events.db"));
        db.jdbcClient.sql("INSERT INTO schema_meta (key, value) VALUES ('k', 'v')").update();

        new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(db.dataSource);

        List<String> tables = db.jdbcClient
                .sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
                .query(String.class)
                .list();
        assertThat(tables)
                .contains(
                        "events",
                        "schema_meta",
                        "usage_hook_agg",
                        "usage_token_agg",
                        "usage_session",
                        "transcript_file",
                        "transcript_msg",
                        "statusline_last")
                .doesNotContain("transcript_seen");
        assertThat(db.count("schema_meta")).isEqualTo(1);
    }

    @Test
    void transcriptMsgColumnsMatchArchitecture() {
        // [FR-019-AC4] transcript_msg 열 = architecture §6.5 (ADR-92, transcript_seen 아님)
        UsageTestDb db = new UsageTestDb(tempDir.resolve("events.db"));

        assertThat(columns(db, "transcript_msg"))
                .containsExactly(
                        "msg_key", "bucket", "session_id", "sub_agent", "model", "input", "output",
                        "cache_creation", "cache_read");
        assertThat(columns(db, "usage_hook_agg")).containsExactly("bucket", "kind", "subject", "agent", "count");
        assertThat(columns(db, "usage_token_agg"))
                .containsExactly(
                        "bucket", "session_id", "sub_agent", "model", "input", "output", "cache_creation",
                        "cache_read");
        assertThat(columns(db, "usage_session"))
                .containsExactly("session_id", "project", "started_at", "entrypoint", "main_agent");
        assertThat(columns(db, "transcript_file"))
                .containsExactly("path", "file_key", "size", "offset", "mtime", "failed");
        assertThat(columns(db, "statusline_last"))
                .containsExactly(
                        "id", "plan", "plan_present", "five_pct", "five_reset", "five_present", "seven_pct",
                        "seven_reset", "seven_present", "received_at");
    }

    @Test
    void statuslineLastAllowsOnlyOneRow() {
        // [FR-019-AC4] statusline_last 는 id = 1 한 행만
        UsageTestDb db = new UsageTestDb(tempDir.resolve("events.db"));

        assertThatThrownBy(() -> db.jdbcClient
                        .sql("INSERT INTO statusline_last (id, plan_present, five_present, seven_present, received_at)"
                                + " VALUES (2, 0, 0, 0, 'x')")
                        .update())
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
}
