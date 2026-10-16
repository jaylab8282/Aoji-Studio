package studio.aoji.statusline;

import java.time.Instant;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import studio.aoji.events.EventRepository;

/**
 * {@code statusline_last} 한 행 저장·조회 (ADR-83 결정 5, FR-027-AC8). 받을 때마다 같은 행(id=1)을 덮어쓰고
 * 재시작 뒤에도 남는다. 쓰기는 conventions §3 순서대로 {@code EventRepository.locked → 트랜잭션}이다(D-160).
 * 시각은 ISO-8601 UTC 문자열(밀리초)로 저장한다.
 */
@Component
public class StatuslineStore {

    private final JdbcClient jdbcClient;
    private final EventRepository eventRepository;
    private final TransactionTemplate transactionTemplate;

    public StatuslineStore(
            JdbcClient jdbcClient, EventRepository eventRepository, PlatformTransactionManager transactionManager) {
        this.jdbcClient = jdbcClient;
        this.eventRepository = eventRepository;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public void save(StatuslineLast last) {
        eventRepository.locked(() -> transactionTemplate.execute(status -> jdbcClient
                .sql(
                        """
                        INSERT INTO statusline_last
                          (id, plan, plan_present, five_pct, five_reset, five_present,
                           seven_pct, seven_reset, seven_present, received_at)
                        VALUES (1, :plan, :planPresent, :fivePct, :fiveReset, :fivePresent,
                                :sevenPct, :sevenReset, :sevenPresent, :receivedAt)
                        ON CONFLICT(id) DO UPDATE SET
                          plan = excluded.plan, plan_present = excluded.plan_present,
                          five_pct = excluded.five_pct, five_reset = excluded.five_reset,
                          five_present = excluded.five_present,
                          seven_pct = excluded.seven_pct, seven_reset = excluded.seven_reset,
                          seven_present = excluded.seven_present,
                          received_at = excluded.received_at
                        """)
                .param("plan", last.plan())
                .param("planPresent", last.plan() == null ? 0 : 1)
                .param("fivePct", last.fiveHour().usedPercent())
                .param("fiveReset", format(last.fiveHour().resetsAt()))
                .param("fivePresent", last.fiveHour().present() ? 1 : 0)
                .param("sevenPct", last.sevenDay().usedPercent())
                .param("sevenReset", format(last.sevenDay().resetsAt()))
                .param("sevenPresent", last.sevenDay().present() ? 1 : 0)
                .param("receivedAt", format(last.receivedAt()))
                .update()));
    }

    public Optional<StatuslineLast> last() {
        return jdbcClient
                .sql(
                        """
                        SELECT plan, plan_present, five_pct, five_reset, five_present,
                               seven_pct, seven_reset, seven_present, received_at
                        FROM statusline_last WHERE id = 1
                        """)
                .query((rs, rowNum) -> new StatuslineLast(
                        rs.getInt("plan_present") == 1 ? rs.getString("plan") : null,
                        window(rs.getInt("five_present"), rs.getObject("five_pct"), rs.getString("five_reset")),
                        window(rs.getInt("seven_present"), rs.getObject("seven_pct"), rs.getString("seven_reset")),
                        Instant.parse(rs.getString("received_at"))))
                .optional();
    }

    private static StatuslineLast.Window window(int present, Object percent, String reset) {
        if (present != 1 || percent == null) {
            return StatuslineLast.Window.ABSENT;
        }
        return new StatuslineLast.Window(
                true, ((Number) percent).doubleValue(), reset == null ? null : Instant.parse(reset));
    }

    private static String format(Instant instant) {
        return instant == null ? null : instant.toString();
    }
}
