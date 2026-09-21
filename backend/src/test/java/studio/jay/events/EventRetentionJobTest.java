package studio.jay.events;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** 이벤트 30일 보존 (architecture.md §6.5, FR-003-AC7). */
class EventRetentionJobTest {

    @TempDir
    Path tempDir;

    @Test
    void deletesRowsOlderThan30DaysAndKeepsNewerRows() {
        // [FR-003-AC7] 31일 전 행 삭제, 29일 전 행 유지
        EventRepository repository = new EventRepository(SqliteTestSupport.jdbcClient(tempDir.resolve("events.db")));
        EventRetentionJob job = new EventRetentionJob(repository);

        OffsetDateTime now = OffsetDateTime.now();
        repository.insert(new EventRow(
                0, now.minusDays(31), "PreToolUse", "s1", null, "architect", "Bash", null, "/workspace", "tool",
                "도구 실행 · Bash", "31일 전"));
        repository.insert(new EventRow(
                0, now.minusDays(29), "PreToolUse", "s2", null, "architect", "Bash", null, "/workspace", "tool",
                "도구 실행 · Bash", "29일 전"));

        int deleted = job.runRetention();

        assertThat(deleted).isEqualTo(1);
        assertThat(repository.findRecent(10)).extracting(EventRow::summary).containsExactly("29일 전");
    }
}
