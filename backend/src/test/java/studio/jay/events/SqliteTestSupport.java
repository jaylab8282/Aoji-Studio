package studio.jay.events;

import java.nio.file.Path;
import javax.sql.DataSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.SimpleDriverDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

/**
 * Spring 전체 컨텍스트 없이 {@code events} 테이블을 가진 SQLite {@link JdbcClient}를 만든다.
 * {@code schema.sql}(classpath)을 그대로 적용해 운영 스키마와 항상 같게 유지한다.
 */
final class SqliteTestSupport {

    private SqliteTestSupport() {}

    static JdbcClient jdbcClient(Path dbFile) {
        DataSource dataSource = new SimpleDriverDataSource(new org.sqlite.JDBC(), "jdbc:sqlite:" + dbFile);
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(new ClassPathResource("schema.sql"));
        populator.execute(dataSource);
        return JdbcClient.create(dataSource);
    }
}
