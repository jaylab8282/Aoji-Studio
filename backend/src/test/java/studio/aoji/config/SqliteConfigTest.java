package studio.aoji.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.stream.Stream;
import javax.sql.DataSource;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.sqlite.SQLiteDataSource;

/**
 * SQLite 손상 복구 (architecture.md §9 "SQLite 손상", 팀장 결정 D-015: 축소 구현 금지).
 * {@link SqliteConfig}가 커넥션 풀을 열기 전에 원시 연결로 {@code PRAGMA quick_check}를 실행해
 * 손상 여부를 판정하는 실제 동작을 {@code @SpringBootTest} 전체 기동으로 확인한다.
 */
class SqliteConfigTest {

    @Nested
    @SpringBootTest
    class CorruptedDatabaseFile {

        @TempDir
        static Path mountRoot;

        @TempDir
        static Path dataDir;

        @DynamicPropertySource
        static void props(DynamicPropertyRegistry registry) {
            registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
            registry.add("aojistudio.public-port", () -> "4180");
            registry.add("aojistudio.mount-path", () -> mountRoot.toString());
            // aojistudio.data-path가 해석되는 시점(=Environment 준비 시점, 컨텍스트 기동보다 먼저)에
            // 손상된 events.db를 미리 써 둔다.
            registry.add("aojistudio.data-path", () -> {
                writeGarbageFile(dataDir.resolve("events.db"));
                return dataDir.toString();
            });
        }

        @Autowired
        DataSource dataSource;

        @Test
        void corruptDatabaseIsMovedAsideAndReplacedWithWorkingSchema() throws Exception {
            // [architecture §9] 깨진 events.db(임의 바이트) → 기동 성공, 원본은 events.db.corrupt-*로
            // 이동, 새 DB에 events 테이블 존재
            try (Stream<Path> files = Files.list(dataDir)) {
                boolean hasCorruptCopy =
                        files.anyMatch(p -> p.getFileName().toString().startsWith("events.db.corrupt-"));
                assertThat(hasCorruptCopy).isTrue();
            }

            Long count = new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM events", Long.class);
            assertThat(count).isZero();
        }
    }

    @Nested
    @SpringBootTest
    class HealthyDatabaseFile {

        @TempDir
        static Path mountRoot;

        @TempDir
        static Path dataDir;

        @DynamicPropertySource
        static void props(DynamicPropertyRegistry registry) {
            registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
            registry.add("aojistudio.public-port", () -> "4180");
            registry.add("aojistudio.mount-path", () -> mountRoot.toString());
            registry.add("aojistudio.data-path", () -> {
                writeHealthyDatabaseWithOneRow(dataDir.resolve("events.db"));
                return dataDir.toString();
            });
        }

        @Autowired
        DataSource dataSource;

        @Test
        void healthyDatabaseIsNotMovedAndDataIsKept() throws Exception {
            // [architecture §9] 정상 DB → 이동 없음, 데이터 유지
            try (Stream<Path> files = Files.list(dataDir)) {
                boolean hasCorruptCopy =
                        files.anyMatch(p -> p.getFileName().toString().startsWith("events.db.corrupt-"));
                assertThat(hasCorruptCopy).isFalse();
            }

            Long count = new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM events", Long.class);
            assertThat(count).isEqualTo(1L);
        }
    }

    private static void writeGarbageFile(Path dbFile) {
        try {
            Files.write(
                    dbFile,
                    "not a real sqlite database, just garbage bytes 0123456789".getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void writeHealthyDatabaseWithOneRow(Path dbFile) {
        SQLiteDataSource rawDataSource = new SQLiteDataSource();
        rawDataSource.setUrl("jdbc:sqlite:" + dbFile);
        try (Connection connection = rawDataSource.getConnection();
                Statement statement = connection.createStatement()) {
            statement.execute(
                    """
                    CREATE TABLE events (
                      id              INTEGER PRIMARY KEY AUTOINCREMENT,
                      received_at     TEXT    NOT NULL,
                      hook_event_name TEXT    NOT NULL,
                      session_id      TEXT    NOT NULL,
                      agent_id        TEXT,
                      agent_type      TEXT,
                      tool_name       TEXT,
                      notification_type TEXT,
                      cwd             TEXT,
                      kind            TEXT    NOT NULL,
                      title           TEXT    NOT NULL,
                      summary         TEXT    NOT NULL
                    )
                    """);
            statement.execute(
                    """
                    INSERT INTO events (received_at, hook_event_name, session_id, kind, title, summary)
                    VALUES ('2026-09-20T10:00:00+09:00', 'Stop', 's1', 'stop', '응답 종료', '-')
                    """);
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }
}
