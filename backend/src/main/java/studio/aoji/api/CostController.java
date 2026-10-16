package studio.aoji.api;

import java.time.Clock;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.pricing.PriceTable;
import studio.aoji.usage.CostReport;
import studio.aoji.usage.CostReportService;
import studio.aoji.usage.PeriodQuery;

/**
 * 10 토큰 사용량·추정 금액과 10-1 단가표 (api-spec {@code GET /api/cost}·{@code GET /api/pricing}, FR-025·FR-026).
 * 읽기 전용이다 — 단가를 바꾸거나 저장하는 메서드가 없으므로 그 밖의 메서드는 405다(FR-026-AC4).
 */
@RestController
@RequestMapping("/api")
public class CostController {

    private final CostReportService costReportService;
    private final PriceTable priceTable;
    private final Clock clock;

    public CostController(CostReportService costReportService, PriceTable priceTable, Clock clock) {
        this.costReportService = costReportService;
        this.priceTable = priceTable;
        this.clock = clock;
    }

    @GetMapping("/cost")
    public CostReport cost(
            @RequestParam(name = "period", required = false) String period,
            @RequestParam(name = "tz", required = false) String tz) {
        return costReportService.report(PeriodQuery.parse(period, tz, clock));
    }

    @GetMapping("/pricing")
    public PriceTable.View pricing() {
        return priceTable.view();
    }
}
