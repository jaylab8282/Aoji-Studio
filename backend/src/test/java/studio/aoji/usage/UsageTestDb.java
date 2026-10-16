package studio.aoji.usage;

import java.nio.file.Path;
import javax.sql.DataSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SimpleDriverDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

/** Spring 컨텍스트 없이 운영 {@code schema.sql}을 적용한 SQLite 파일을 만든다. */
final class UsageTestDb {

    final DataSource dataSource;
    final JdbcClient jdbcClient;
    final DataSourceTransactionManager transactionManager;

    UsageTestDb(Path dbFile) {
        dataSource = new SimpleDriverDataSource(new org.sqlite.JDBC(), "jdbc:sqlite:" + dbFile);
        new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(dataSource);
        jdbcClient = JdbcClient.create(dataSource);
        transactionManager = new DataSourceTransactionManager(dataSource);
    }

    long count(String table) {
        return jdbcClient.sql("SELECT COUNT(*) FROM " + table).query(Long.class).single();
    }
}
