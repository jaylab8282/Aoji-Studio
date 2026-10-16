package studio.aoji.pricing;

import java.math.BigDecimal;
import org.springframework.stereotype.Component;

/**
 * 추정 금액 계산 (FR-026-AC1, ADR-82 결정 4): 금액 = Σ 토큰 종류별 토큰 수 / 1,000,000 × 단가. {@link BigDecimal}로
 * 정확히 계산하고(반올림 없음) 화면이 소수 둘째 자리로 표기한다.
 */
@Component
public class CostCalculator {

    private static final int PER_MILLION_SCALE = 6;

    /** 토큰 4종 × 단가. 단가가 없는 모델은 호출하지 않는다. */
    public BigDecimal usd(long input, long output, long cacheCreation, long cacheRead, PriceTable.ModelPrice price) {
        BigDecimal sum = BigDecimal.valueOf(input)
                .multiply(price.input())
                .add(BigDecimal.valueOf(output).multiply(price.output()))
                .add(BigDecimal.valueOf(cacheCreation).multiply(price.cacheWrite()))
                .add(BigDecimal.valueOf(cacheRead).multiply(price.cacheRead()));
        return sum.signum() == 0 ? BigDecimal.ZERO : sum.movePointLeft(PER_MILLION_SCALE);
    }
}
