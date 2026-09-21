package studio.jay.events;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * {@code EventRepository} insert·조회·삭제 (architecture.md §6.5, ADR-09).
 * FR-003-AC7(보존)은 {@link EventRetentionJobTest}에서 별도로 확인한다.
 */
class EventRepositoryTest {

    @TempDir
    Path tempDir;

    private EventRepository repository;

    @BeforeEach
    void setUp() {
        repository = new EventRepository(SqliteTestSupport.jdbcClient(tempDir.resolve("events.db")));
    }

    private static EventRow row(OffsetDateTime receivedAt, String agentType, String summary) {
        return new EventRow(
                0, receivedAt, "PreToolUse", "session-1", null, agentType, "Bash", null, "/workspace", "tool",
                "도구 실행 · Bash", summary);
    }

    @Test
    void insertAssignsGeneratedId() {
        EventRow inserted = repository.insert(row(OffsetDateTime.now(), "architect", "ls"));

        assertThat(inserted.id()).isPositive();
        assertThat(inserted.agentType()).isEqualTo("architect");
    }

    @Test
    void findRecentReturnsNewestFirst() {
        OffsetDateTime now = OffsetDateTime.now();
        repository.insert(row(now.minusSeconds(20), "architect", "older"));
        repository.insert(row(now, "architect", "newer"));

        List<EventRow> recent = repository.findRecent(10);

        assertThat(recent).hasSize(2);
        assertThat(recent.get(0).summary()).isEqualTo("newer");
        assertThat(recent.get(1).summary()).isEqualTo("older");
    }

    @Test
    void findRecentRespectsLimit() {
        OffsetDateTime now = OffsetDateTime.now();
        for (int i = 0; i < 5; i++) {
            repository.insert(row(now.plusSeconds(i), "architect", "e" + i));
        }

        assertThat(repository.findRecent(2)).hasSize(2);
    }

    @Test
    void findByAgentTypeFiltersToThatAgent() {
        OffsetDateTime now = OffsetDateTime.now();
        repository.insert(row(now, "architect", "for-architect"));
        repository.insert(row(now, "reviewer", "for-reviewer"));

        List<EventRow> forArchitect = repository.findByAgentType("architect", 10);

        assertThat(forArchitect).hasSize(1);
        assertThat(forArchitect.get(0).summary()).isEqualTo("for-architect");
    }

    @Test
    void deleteOlderThanRemovesOnlyOldRows() {
        OffsetDateTime now = OffsetDateTime.now();
        repository.insert(row(now.minusDays(40), "architect", "old"));
        repository.insert(row(now, "architect", "recent"));

        int deleted = repository.deleteOlderThan(now.minusDays(30));

        assertThat(deleted).isEqualTo(1);
        assertThat(repository.findRecent(10)).extracting(EventRow::summary).containsExactly("recent");
    }

    @Test
    void findLastReceivedAtReturnsEmptyWhenNoEvents() {
        assertThat(repository.findLastReceivedAt()).isEmpty();
    }

    @Test
    void findLastReceivedAtReturnsMostRecentTimestamp() {
        OffsetDateTime now = OffsetDateTime.now();
        repository.insert(row(now.minusSeconds(10), "architect", "a"));
        repository.insert(row(now, "architect", "b"));

        assertThat(repository.findLastReceivedAt()).isPresent();
    }

    @Test
    void findLastEventByAgentReturnsMostRecentPerAgentType() {
        OffsetDateTime now = OffsetDateTime.now();
        repository.insert(row(now.minusSeconds(10), "architect", "old-architect"));
        repository.insert(row(now, "architect", "new-architect"));
        repository.insert(row(now, "reviewer", "new-reviewer"));

        Map<String, EventRow> lastByAgent = repository.findLastEventByAgent();

        assertThat(lastByAgent.get("architect").summary()).isEqualTo("new-architect");
        assertThat(lastByAgent.get("reviewer").summary()).isEqualTo("new-reviewer");
    }
}
