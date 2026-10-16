package studio.aoji.events;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;
import studio.aoji.usage.HookUsageEntry;
import studio.aoji.usage.UsageRepository;

/** 이벤트 30일 보존 (architecture.md §6.5, FR-003-AC7, FR-019-AC4). */
class EventRetentionJobTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant T0 = Instant.parse("2026-10-16T00:00:00Z");

    @TempDir
    Path tempDir;

    private static EventRow event(OffsetDateTime at, String summary) {
        return new EventRow(0, at, "PreToolUse", "s", null, "architect", "Bash", null, "/workspace", "tool", "도구 실행 · Bash", summary);
    }

    @Test
    void deletesRowsOlderThan30DaysAndKeepsNewerRows() {
        // [FR-003-AC7] 31일 전 행 삭제, 29일 전 행 유지
        EventRepository repository = new EventRepository(SqliteTestSupport.jdbcClient(tempDir.resolve("events.db")));
        EventRetentionJob job = new EventRetentionJob(repository, Clock.fixed(T0, SEOUL));

        OffsetDateTime now = OffsetDateTime.ofInstant(T0, SEOUL);
        repository.insert(event(now.minusDays(31), "31일 전"));
        repository.insert(event(now.minusDays(29), "29일 전"));

        int deleted = job.runRetention();

        assertThat(deleted).isEqualTo(1);
        assertThat(repository.findRecent(10)).extracting(EventRow::summary).containsExactly("29일 전");
    }

    @Test
    void aggregatesSurviveWhenEventsAreDeleted31DaysLater() {
        // [FR-019-AC4] 고정 시계로 31일 뒤 events 삭제, 집계·세션·대화 기록·상태줄·메타 테이블은 그대로
        JdbcClient jdbc = SqliteTestSupport.jdbcClient(tempDir.resolve("events.db"));
        EventRepository repository = new EventRepository(jdbc);
        UsageRepository usage = new UsageRepository(jdbc);
        OffsetDateTime received = OffsetDateTime.ofInstant(T0, SEOUL);
        repository.insert(event(received, "오늘"));
        usage.incrementHookAgg("2026-10-16T00:00:00Z", new HookUsageEntry("skill-call", "web-planner", "dev"), 3);
        usage.markBackfillDone();
        jdbc.sql("INSERT INTO usage_token_agg VALUES ('2026-10-16T00:00:00Z','s','','m',1,2,3,4)").update();
        jdbc.sql("INSERT INTO usage_session VALUES ('s','/p','2026-10-16T00:00:00Z','cli','')").update();
        jdbc.sql("INSERT INTO transcript_file (path, size, offset) VALUES ('a.jsonl', 1, 1)").update();
        jdbc.sql("INSERT INTO transcript_msg VALUES ('m:r','2026-10-16T00:00:00Z','s','','m',1,2,3,4)").update();
        jdbc.sql("INSERT INTO statusline_last (id, plan_present, five_present, seven_present, received_at)"
                        + " VALUES (1, 0, 0, 0, 'x')")
                .update();

        Clock after31Days = Clock.fixed(T0.plusSeconds(31L * 24 * 3600), SEOUL);
        int deleted = new EventRetentionJob(repository, after31Days).runRetention();

        assertThat(deleted).isEqualTo(1);
        assertThat(repository.findRecent(10)).isEmpty();
        assertThat(usage.findHookAgg(null, null)).singleElement().satisfies(row -> assertThat(row.count()).isEqualTo(3));
        assertThat(usage.isBackfillDone()).isTrue();
        for (String table : List.of("usage_token_agg", "usage_session", "transcript_file", "transcript_msg", "statusline_last")) {
            assertThat(jdbc.sql("SELECT COUNT(*) FROM " + table).query(Long.class).single())
                    .as(table)
                    .isEqualTo(1L);
        }
    }

    @Test
    void sourceNeverDeletesOrDropsAggregateTables() throws IOException {
        // [FR-019-AC4] 정적 검사: 집계 테이블 usage_*·transcript_file·transcript_msg·statusline_last·schema_meta 에
        // DELETE·DROP·TRUNCATE 문이 main 소스(Java·schema.sql)에 0개
        Pattern forbidden = Pattern.compile(
                "(?is)\\b(delete\\s+from|drop\\s+(table|index)(\\s+if\\s+exists)?|truncate(\\s+table)?)\\s+"
                        + "(usage_\\w+|transcript_file|transcript_msg|statusline_last|schema_meta)\\b");
        int scanned = 0;
        try (Stream<Path> walk = Files.walk(Path.of("src", "main"))) {
            for (Path file : (Iterable<Path>) walk.filter(Files::isRegularFile)::iterator) {
                String name = file.getFileName().toString();
                if (!name.endsWith(".java") && !name.endsWith(".sql")) {
                    continue;
                }
                scanned++;
                assertThat(forbidden.matcher(Files.readString(file)).find()).as(file.toString()).isFalse();
            }
        }
        assertThat(scanned).isGreaterThan(50);
        assertThat(forbidden.matcher("DELETE FROM usage_hook_agg").find()).isTrue();
        assertThat(forbidden.matcher("DELETE FROM events").find()).isFalse();
    }
}
