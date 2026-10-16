package studio.aoji.usage;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import studio.aoji.pricing.PlainDecimalSerializer;
import tools.jackson.databind.annotation.JsonSerialize;

/**
 * api-spec {@code CostReport} (10 토큰 사용량·추정 금액, FR-025·FR-026). 대화 내용은 어디에도 없다(FR-025-AC5).
 * 금액은 {@link BigDecimal}을 지수 표기 없는 JSON 숫자로 쓴다.
 */
public record CostReport(
        String period,
        Range range,
        TranscriptStatus transcripts,
        TokenSums totals,
        Estimate estimate,
        List<DateRow> byDate,
        List<ModelRow> byModel,
        List<SessionRow> bySession,
        List<AgentRow> byAgent) {

    public CostReport {
        byDate = List.copyOf(byDate);
        byModel = List.copyOf(byModel);
        bySession = List.copyOf(bySession);
        byAgent = List.copyOf(byAgent);
    }

    /** api-spec {@code UsageRange}. */
    public record Range(LocalDate from, LocalDate to) {}

    /** api-spec {@code TokenSums}. */
    public record TokenSums(long input, long output, long cacheCreation, long cacheRead, long total) {

        public static TokenSums of(long input, long output, long cacheCreation, long cacheRead) {
            return new TokenSums(input, output, cacheCreation, cacheRead, input + output + cacheCreation + cacheRead);
        }
    }

    public record Estimate(@JsonSerialize(using = PlainDecimalSerializer.class) BigDecimal usd, int excludedModelCount) {}

    public record DateRow(LocalDate date, TokenSums tokens, @JsonSerialize(using = PlainDecimalSerializer.class) BigDecimal usd) {}

    /** {@code usd == null}이면 단가 없음. */
    public record ModelRow(String model, TokenSums tokens, @JsonSerialize(using = PlainDecimalSerializer.class) BigDecimal usd) {}

    public record SessionRow(
            String sessionId,
            String project,
            String startedAt,
            String entrypoint,
            TokenSums tokens,
            @JsonSerialize(using = PlainDecimalSerializer.class) BigDecimal usd) {}

    /** {@code kind}: {@code agent}(agent = name) · {@code main}(기본 세션) · {@code unknown}(미확인). */
    public record AgentRow(
            String agent, String kind, TokenSums tokens, @JsonSerialize(using = PlainDecimalSerializer.class) BigDecimal usd) {}
}
