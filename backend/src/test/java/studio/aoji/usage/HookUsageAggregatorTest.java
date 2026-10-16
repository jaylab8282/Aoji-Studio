package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import studio.aoji.live.HookPayload;

class HookUsageAggregatorTest {

    @TempDir
    Path tempDir;

    private static final Set<String> SKILLS = Set.of("web-planner", "release-notes");

    private static HookPayload payload(String event, String agentType, String tool, Map<String, Object> input, String prompt) {
        return new HookPayload("s1", "/workspace", event, null, agentType, tool, input, null, null, prompt);
    }

    @Test
    void skillCallIsCountedOnPreToolUseOnlyWithSkillName() {
        // [FR-019-AC1] PreToolUse + tool_name=Skill → skill-call, 대상 = tool_input.skill, agent = agent_type
        List<HookUsageEntry> entries = HookUsageAggregator.entriesFor(
                payload("PreToolUse", "dev", "Skill", Map.of("skill", "web-planner"), null), SKILLS);
        List<HookUsageEntry> post = HookUsageAggregator.entriesFor(
                payload("PostToolUse", "dev", "Skill", Map.of("skill", "web-planner"), null), SKILLS);

        assertThat(entries).containsExactly(new HookUsageEntry("skill-call", "web-planner", "dev"));
        assertThat(post).isEmpty();
    }

    @Test
    void slashPromptIsCountedAsSkillSlashOnlyForExistingSkills() {
        // [FR-019-AC1] /<스킬> → skill-slash. 없는 스킬·접두어만 같은 이름·슬래시 없음은 집계 안 함
        assertThat(HookUsageAggregator.entriesFor(
                        payload("UserPromptSubmit", null, null, Map.of(), "/release-notes 지금"), SKILLS))
                .containsExactly(new HookUsageEntry("skill-slash", "release-notes", ""));
        assertThat(HookUsageAggregator.entriesFor(
                        payload("UserPromptSubmit", null, null, Map.of(), "/release-notesx"), SKILLS))
                .isEmpty();
        assertThat(HookUsageAggregator.entriesFor(
                        payload("UserPromptSubmit", null, null, Map.of(), "release-notes"), SKILLS))
                .isEmpty();
        assertThat(HookUsageAggregator.entriesFor(
                        payload("UserPromptSubmit", null, null, Map.of(), "/ghost"), SKILLS))
                .isEmpty();
    }

    @Test
    void sessionAndSubagentStartAreCountedWithEmptyAgentForDefaultSession() {
        // [FR-019-AC1] SessionStart·SubagentStart → session-start, subject '', 기본 세션 agent ''
        assertThat(HookUsageAggregator.entriesFor(payload("SessionStart", null, null, Map.of(), null), SKILLS))
                .containsExactly(new HookUsageEntry("session-start", "", ""));
        assertThat(HookUsageAggregator.entriesFor(payload("SubagentStart", "writer", null, Map.of(), null), SKILLS))
                .containsExactly(new HookUsageEntry("session-start", "", "writer"));
    }

    @Test
    void mcpToolNameYieldsServerName() {
        // [FR-024-AC2] mcp__github__x → 서버 github, 밑줄이 든 서버 이름은 그대로
        assertThat(HookUsageAggregator.entriesFor(
                        payload("PreToolUse", "dev", "mcp__github__create_issue", Map.of(), null), SKILLS))
                .containsExactly(new HookUsageEntry("mcp-call", "github", "dev"));
        assertThat(HookUsageAggregator.entriesFor(
                        payload("PreToolUse", null, "mcp__plugin_demo-tools_demo-helper__run", Map.of(), null),
                        SKILLS))
                .containsExactly(new HookUsageEntry("mcp-call", "plugin_demo-tools_demo-helper", ""));
        assertThat(HookUsageAggregator.mcpServer("mcp__github")).isNull();
        assertThat(HookUsageAggregator.mcpServer("mcp____x")).isNull();
        assertThat(HookUsageAggregator.mcpServer("Bash")).isNull();
    }

    @Test
    void unusedEventsAreNotAggregated() {
        // [FR-003-E1] 쓰지 않는 이벤트·집계 대상 아닌 이벤트는 칸 0개
        assertThat(HookUsageAggregator.entriesFor(payload("PreCompact", null, null, Map.of(), null), SKILLS)).isEmpty();
        assertThat(HookUsageAggregator.entriesFor(payload("Stop", null, null, Map.of(), null), SKILLS)).isEmpty();
        assertThat(HookUsageAggregator.entriesFor(payload("PreToolUse", null, "Bash", Map.of("command", "ls"), null), SKILLS))
                .isEmpty();
        assertThat(HookUsageAggregator.entriesFor(payload("PreToolUse", null, "Skill", Map.of(), null), SKILLS))
                .isEmpty();
    }

    @Test
    void recordUpsertsCountsAndReportsChangedAreas() {
        // [FR-019-AC1] 같은 구간·칸은 count+1, 영역 = 스킬 계열 skills / MCP mcp
        UsageTestDb db = new UsageTestDb(tempDir.resolve("events.db"));
        UsageRepository repository = new UsageRepository(db.jdbcClient);
        HookUsageAggregator aggregator = new HookUsageAggregator(repository);
        Instant at = Instant.parse("2026-10-15T05:20:10Z");

        Set<String> skillAreas = aggregator.record(
                payload("PreToolUse", "dev", "Skill", Map.of("skill", "web-planner"), null), at, SKILLS);
        aggregator.record(payload("PreToolUse", "dev", "Skill", Map.of("skill", "web-planner"), null),
                Instant.parse("2026-10-15T05:29:59Z"), SKILLS);
        Set<String> mcpAreas = aggregator.record(
                payload("PreToolUse", null, "mcp__github__x", Map.of(), null), at, SKILLS);
        Set<String> none = aggregator.record(payload("Stop", null, null, Map.of(), null), at, SKILLS);

        assertThat(skillAreas).containsExactly("skills");
        assertThat(mcpAreas).containsExactly("mcp");
        assertThat(none).isEmpty();
        assertThat(repository.findHookAgg(null, null))
                .containsExactly(
                        new UsageRepository.HookAggRow("2026-10-15T05:15:00Z", "mcp-call", "github", "", 1),
                        new UsageRepository.HookAggRow("2026-10-15T05:15:00Z", "skill-call", "web-planner", "dev", 2));
    }

    @Test
    void findHookAggFiltersByBucketRange() {
        // [FR-019-AC4] [from, to) 구간 조회
        UsageTestDb db = new UsageTestDb(tempDir.resolve("events.db"));
        UsageRepository repository = new UsageRepository(db.jdbcClient);
        HookUsageEntry entry = new HookUsageEntry("session-start", "", "");
        repository.incrementHookAgg("2026-10-15T05:00:00Z", entry, 1);
        repository.incrementHookAgg("2026-10-15T05:15:00Z", entry, 1);
        repository.incrementHookAgg("2026-10-15T05:30:00Z", entry, 1);

        assertThat(repository.findHookAgg("2026-10-15T05:15:00Z", "2026-10-15T05:30:00Z"))
                .extracting(UsageRepository.HookAggRow::bucket)
                .containsExactly("2026-10-15T05:15:00Z");
    }
}
