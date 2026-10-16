package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import studio.aoji.events.EventRepository;
import studio.aoji.events.EventRow;

class UsageBackfillTest {

    @TempDir
    Path tempDir;

    private static EventRow event(String received, String hook, String agent, String tool, String summary) {
        return new EventRow(0, OffsetDateTime.parse(received), hook, "s1", null, agent, tool, null, "/w", "tool", "t", summary);
    }

    @Test
    void backfillsSessionStartAndMcpCallFromExistingEventsExactlyOnce() {
        // [FR-019-AC1] 처음 v1.2.0: events에서 session-start·mcp-call만 채우고, 두 번째 실행은 아무것도 안 한다
        UsageTestDb db = new UsageTestDb(tempDir.resolve("events.db"));
        EventRepository events = new EventRepository(db.jdbcClient);
        UsageRepository usage = new UsageRepository(db.jdbcClient);
        events.insert(event("2026-10-15T14:20:00+09:00", "SessionStart", "dev", null, "/w"));
        events.insert(event("2026-10-15T14:21:00+09:00", "SubagentStart", "dev", null, "dev"));
        events.insert(event("2026-10-15T14:22:00+09:00", "SessionStart", null, null, "/w"));
        events.insert(event("2026-10-15T14:23:00+09:00", "PreToolUse", "dev", "mcp__github__create_issue", "-"));
        events.insert(event("2026-10-15T14:24:00+09:00", "PreToolUse", "dev", "mcp__github__get_issue", "-"));
        events.insert(event("2026-10-15T14:25:00+09:00", "PostToolUse", "dev", "mcp__github__get_issue", "-"));
        events.insert(event("2026-10-15T14:26:00+09:00", "PreToolUse", "dev", "Skill", "-"));
        events.insert(event("2026-10-15T14:27:00+09:00", "PreToolUse", "dev", "Bash", "ls"));
        UsageBackfill backfill = new UsageBackfill(db.jdbcClient, usage, events, db.transactionManager);

        boolean first = backfill.run();
        UsageRepository.HookAggRow sessionStart = usage.findHookAgg(null, null).stream()
                .filter(r -> r.kind().equals("session-start") && r.agent().equals("dev"))
                .findFirst()
                .orElseThrow();
        long cellsAfterFirst = db.count("usage_hook_agg");
        boolean second = backfill.run();

        assertThat(first).isTrue();
        assertThat(second).isFalse();
        assertThat(sessionStart.bucket()).isEqualTo("2026-10-15T05:15:00Z");
        assertThat(sessionStart.count()).isEqualTo(2);
        assertThat(usage.findHookAgg(null, null))
                .extracting(r -> r.kind() + "|" + r.subject() + "|" + r.agent() + "|" + r.count())
                .containsExactlyInAnyOrder(
                        "session-start||dev|2", "session-start|||1", "mcp-call|github|dev|2");
        assertThat(db.count("usage_hook_agg")).isEqualTo(cellsAfterFirst);
        assertThat(usage.isBackfillDone()).isTrue();
    }

    @Test
    void secondRunDoesNotDoubleCountEvenAfterNewHooksAggregated() {
        // [FR-019-AC1] 한 번만: 표시 뒤에 쌓인 값은 다시 계산해 덮지 않는다
        UsageTestDb db = new UsageTestDb(tempDir.resolve("events.db"));
        EventRepository events = new EventRepository(db.jdbcClient);
        UsageRepository usage = new UsageRepository(db.jdbcClient);
        events.insert(event("2026-10-15T14:20:00+09:00", "SessionStart", "dev", null, "/w"));
        UsageBackfill backfill = new UsageBackfill(db.jdbcClient, usage, events, db.transactionManager);
        backfill.run();
        usage.incrementHookAgg("2026-10-15T05:15:00Z", new HookUsageEntry("session-start", "", "dev"), 4);

        backfill.afterSingletonsInstantiated();

        assertThat(usage.findHookAgg(null, null)).singleElement().satisfies(row -> assertThat(row.count()).isEqualTo(5));
    }
}
