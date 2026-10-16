package studio.aoji.api;

import java.time.Clock;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.mcp.McpCatalog;
import studio.aoji.mcp.McpReport;
import studio.aoji.usage.PeriodQuery;

/**
 * 09 MCP 조회 (api-spec {@code GET /api/mcp}, FR-023·FR-024). 읽기 전용이다 — 추가·수정·삭제 메서드를 두지 않으므로
 * 그 밖의 메서드는 405다(FR-023-AC6).
 */
@RestController
@RequestMapping("/api/mcp")
public class McpController {

    private final McpCatalog catalog;
    private final Clock clock;

    public McpController(McpCatalog catalog, Clock clock) {
        this.catalog = catalog;
        this.clock = clock;
    }

    @GetMapping
    public McpReport list(
            @RequestParam(name = "period", required = false) String period,
            @RequestParam(name = "tz", required = false) String tz) {
        return catalog.report(PeriodQuery.parse(period, tz, clock));
    }
}
