package studio.aoji.statusline;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import javax.sql.DataSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SimpleDriverDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import studio.aoji.config.AppProperties;
import studio.aoji.events.EventRepository;
import studio.aoji.globalcfg.GlobalClaudeMounts;
import studio.aoji.globalcfg.GlobalClaudeReader;
import studio.aoji.globalcfg.UsageCacheParser;
import studio.aoji.live.Masker;
import studio.aoji.mcp.McpFileParser;
import studio.aoji.mcp.McpMasker;
import studio.aoji.support.MutableClock;
import studio.aoji.usage.UsageChangedNotifier;
import tools.jackson.databind.ObjectMapper;

/** Spring 컨텍스트 없이 운영 {@code schema.sql}을 적용한 SQLite와 임시 홈 위의 {@link GlobalClaudeReader}를 만든다. */
final class StatuslineTestSupport {

    static final String HOST = "/Users/someone/AojiStudio";
    static final String HOME_HOST = "/home/fixture";

    private StatuslineTestSupport() {}

    /** 같은 DB 파일을 여는 새 저장소 — 컨테이너 재시작을 흉내 낸다. */
    static StatuslineStore store(Path dbFile) {
        DataSource dataSource = new SimpleDriverDataSource(new org.sqlite.JDBC(), "jdbc:sqlite:" + dbFile);
        new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(dataSource);
        JdbcClient jdbcClient = JdbcClient.create(dataSource);
        return new StatuslineStore(
                jdbcClient, new EventRepository(jdbcClient), new DataSourceTransactionManager(dataSource));
    }

    /** {@code home/.claude.json}에 {@code cachedUsageUtilization}만 둔 전역 홈을 읽는 리더. {@code claudeJson}이 null이면 파일 없음. */
    static GlobalClaudeReader reader(Path home, String claudeJson, MutableClock clock) throws IOException {
        if (claudeJson != null) {
            Files.writeString(home.resolve(".claude.json"), claudeJson);
        }
        ObjectMapper mapper = new ObjectMapper();
        AppProperties properties = new AppProperties();
        properties.setHostPath(HOST);
        properties.setClaudeHomeHost(HOME_HOST);
        properties.setClaudeHomeMount(home.toString());
        return new GlobalClaudeReader(
                new GlobalClaudeMounts(properties, mapper),
                properties,
                new McpFileParser(mapper, new McpMasker(new Masker())),
                new UsageCacheParser(),
                org.mockito.Mockito.mock(UsageChangedNotifier.class),
                mapper,
                clock);
    }

    static String cacheJson(long fetchedAtMs, String five, String seven) {
        StringBuilder utilization = new StringBuilder();
        if (five != null) {
            utilization.append("\"five_hour\":").append(five);
        }
        if (seven != null) {
            utilization.append(utilization.isEmpty() ? "" : ",").append("\"seven_day\":").append(seven);
        }
        return "{\"cachedUsageUtilization\":{\"accountUuid\":\"AOJI-MARKER-EMAIL-55d0\",\"fetchedAtMs\":" + fetchedAtMs
                + ",\"utilization\":{" + utilization + "}}}";
    }

    static String window(Object utilization, String resetsAt) {
        return "{\"utilization\":" + utilization + ",\"resets_at\":\"" + resetsAt + "\"}";
    }

    static StatuslineLast.Window window(double percent, Instant resetsAt) {
        return new StatuslineLast.Window(true, percent, resetsAt);
    }
}
