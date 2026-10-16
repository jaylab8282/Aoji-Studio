package studio.aoji.usage;

import java.time.LocalDate;
import java.util.List;

/**
 * api-spec {@code SkillsReport} (08 스킬 목록 + 기간 안 사용, FR-018·FR-019).
 *
 * @param totalUses 지금 있는 스킬들의 사용 횟수 합(% 분모, FR-019-AC2·AC6)
 */
public record SkillsReport(
        String period, Range range, boolean hookConfigured, long totalUses, List<SkillRow> skills) {

    public SkillsReport {
        skills = List.copyOf(skills);
    }

    /** api-spec {@code UsageRange}: {@code tz} 로컬 날짜. */
    public record Range(LocalDate from, LocalDate to) {}

    /** api-spec {@code AgentCount}: {@code agent == null}이 {@code 기본 세션}. */
    public record AgentCount(String agent, long count) {}

    /** api-spec {@code SkillRow.usage}. */
    public record Usage(long call, long slash, long preload, long total) {}

    /** api-spec {@code SkillRow}. */
    public record SkillRow(
            String name,
            String description,
            String filePath,
            boolean userOnly,
            boolean imported,
            String formatError,
            List<String> definedAgents,
            Usage usage,
            Double percent,
            List<AgentCount> actualAgents,
            List<String> definedUnused,
            int usedAgentCount) {

        public SkillRow {
            definedAgents = List.copyOf(definedAgents);
            actualAgents = List.copyOf(actualAgents);
            definedUnused = List.copyOf(definedUnused);
        }
    }
}
