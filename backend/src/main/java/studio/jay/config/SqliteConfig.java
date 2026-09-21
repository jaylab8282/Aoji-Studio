package studio.jay.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.sqlite.SQLiteDataSource;

/**
 * SQLite {@code /data/events.db} {@link DataSource}와 손상 복구 (architecture.md §6.5·§9
 * "SQLite 손상", ADR-19, 팀장 결정 D-015: 축소 구현 금지).
 *
 * <p>Spring Boot 자동 구성 대신 이 클래스가 {@link DataSource} 빈을 직접 만든다. 커넥션 풀
 * ({@code HikariDataSource})을 열기 <b>전에</b> 원시 {@link SQLiteDataSource}로 파일에 대해
 * {@code PRAGMA quick_check}를 실행해, 결과가 {@code ok}가 아니거나 열기 자체가 실패하면
 * ({@code SQLITE_NOTADB} 등) 손상된 파일(+{@code -wal}, {@code -shm})을
 * {@code events.db.corrupt-<yyyyMMddHHmmss>}로 옮기고 새 파일로 진행한다. 로그에는 경로만
 * 남기고 파일 내용은 남기지 않는다.
 *
 * <p>이 빈이 등록되면 Spring Boot의 {@code DataSourceAutoConfiguration}은
 * {@code @ConditionalOnMissingBean(DataSource.class)}로 물러나고, {@code spring.sql.init.*}
 * (application.yaml)의 {@code schema.sql} 초기화는 그대로 이 빈을 대상으로 실행된다(WAL 모드 포함).
 * 이벤트는 30일 보존 데이터일 뿐이라 손상되어도 컨테이너 기동을 막지 않는다(§9).
 */
@Configuration
public class SqliteConfig {

    private static final Logger log = LoggerFactory.getLogger(SqliteConfig.class);
    private static final DateTimeFormatter CORRUPT_SUFFIX_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final String DB_FILE_NAME = "events.db";

    @Bean
    public DataSource dataSource(AppProperties appProperties) throws IOException {
        Path dataDir = Path.of(appProperties.getDataPath());
        Files.createDirectories(dataDir);
        Path dbFile = dataDir.resolve(DB_FILE_NAME);

        recoverIfCorrupt(dbFile);

        HikariConfig hikariConfig = new HikariConfig();
        hikariConfig.setPoolName("events-db");
        hikariConfig.setDriverClassName("org.sqlite.JDBC");
        hikariConfig.setJdbcUrl("jdbc:sqlite:" + dbFile);
        // SQLite는 쓰기 주체가 하나여야 한다(architecture.md §6.5 "접근").
        hikariConfig.setMaximumPoolSize(1);
        return new HikariDataSource(hikariConfig);
    }

    /** 파일이 없으면 그냥 새로 만들 것이므로 아무 것도 하지 않는다. 있으면 quick_check로 손상 여부를 본다. */
    private void recoverIfCorrupt(Path dbFile) {
        if (!Files.exists(dbFile)) {
            return;
        }

        String quickCheckResult = rawQuickCheck(dbFile);
        if ("ok".equalsIgnoreCase(quickCheckResult)) {
            return;
        }

        String suffix = OffsetDateTime.now().format(CORRUPT_SUFFIX_FORMAT);
        log.warn(
                "events.db quick_check 실패({}) · 손상된 파일을 옮기고(.corrupt-{}) 새로 만듭니다",
                quickCheckResult,
                suffix);
        moveAside(dbFile, suffix);
        moveAside(dbFile.resolveSibling(dbFile.getFileName() + "-wal"), suffix);
        moveAside(dbFile.resolveSibling(dbFile.getFileName() + "-shm"), suffix);
    }

    /**
     * 커넥션 풀을 열기 전에 원시 연결로 무결성만 확인한다. 열기 자체가 실패하면(예: 임의 바이트로
     * 채워진 파일 → {@code SQLITE_NOTADB}) 손상으로 간주한다.
     */
    private static String rawQuickCheck(Path dbFile) {
        SQLiteDataSource rawDataSource = new SQLiteDataSource();
        rawDataSource.setUrl("jdbc:sqlite:" + dbFile);
        try (Connection connection = rawDataSource.getConnection();
                Statement statement = connection.createStatement();
                ResultSet resultSet = statement.executeQuery("PRAGMA quick_check")) {
            return resultSet.next() ? resultSet.getString(1) : "empty-result";
        } catch (SQLException e) {
            return "open-failed";
        }
    }

    private void moveAside(Path file, String suffix) {
        if (!Files.exists(file)) {
            return;
        }
        Path target = file.resolveSibling(file.getFileName() + ".corrupt-" + suffix);
        try {
            Files.move(file, target, StandardCopyOption.REPLACE_EXISTING);
            log.warn("손상 의심 파일을 옮겼습니다: {}", target.getFileName());
        } catch (IOException e) {
            log.error("손상 의심 파일을 옮기지 못했습니다: {}", file.getFileName());
        }
    }
}
