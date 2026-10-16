package studio.aoji.pricing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class CostCalculatorTest {

    private final PriceTable table = new PriceTable(JsonMapper.builder().build());
    private final CostCalculator calculator = new CostCalculator();

    @Test
    @DisplayName("[FR-026-AC1] 금액 = Σ 토큰 수 / 1,000,000 × 단가 (Opus 4.8: 입력 1M = 5달러)")
    void formulaPerTokenKind() {
        PriceTable.ModelPrice opus = table.find("claude-opus-4-8").orElseThrow();

        assertThat(calculator.usd(1_000_000, 0, 0, 0, opus)).isEqualByComparingTo("5");
        assertThat(calculator.usd(0, 1_000_000, 0, 0, opus)).isEqualByComparingTo("25");
        assertThat(calculator.usd(0, 0, 1_000_000, 0, opus)).isEqualByComparingTo("6.25");
        assertThat(calculator.usd(0, 0, 0, 1_000_000, opus)).isEqualByComparingTo("0.5");
    }

    @Test
    @DisplayName("[FR-026-AC1] BigDecimal 정확 계산: 반올림 없이 소수 8자리까지, 0 토큰은 0")
    void exactDecimalNoRounding() {
        PriceTable.ModelPrice haiku5 = table.find("claude-haiku-5-5").orElseThrow();

        BigDecimal oneCacheRead = calculator.usd(0, 0, 0, 1, haiku5);
        BigDecimal mixed = calculator.usd(1234, 567, 89, 10_000, table.find("claude-opus-4-8").orElseThrow());

        assertThat(oneCacheRead).isEqualByComparingTo("0.00000001");
        // 1234×5 + 567×25 + 89×6.25 + 10000×0.5 = 6170 + 14175 + 556.25 + 5000 = 25901.25 → /1e6
        assertThat(mixed).isEqualByComparingTo("0.02590125");
        assertThat(calculator.usd(0, 0, 0, 0, haiku5)).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    @DisplayName("[FR-026-AC1] fixture 모델 금액: sonnet-4-5(날짜 접미 대응) 1860/980/1910/10600 = 0.0306225")
    void fixtureModelAmount() {
        PriceTable.ModelPrice sonnet = table.find("claude-sonnet-4-5-20250929").orElseThrow();

        assertThat(calculator.usd(1860, 980, 1910, 10600, sonnet)).isEqualByComparingTo("0.0306225");
    }

    @Test
    @DisplayName("[FR-026-AC6] 단가 없는 모델은 find가 비어 계산 대상에서 제외된다")
    void unpricedModelIsExcluded() {
        assertThat(table.find("claude-future-9")).isEmpty();
        assertThat(table.find("claude-sonnet-4-5-20250929")).isPresent();
    }
}
