package studio.aoji.usage;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import studio.aoji.events.EventRepository;

/**
 * v1.2.0으로 처음 올린 때 한 번: 남아 있는 {@code events}(≤30일)에서 {@code session-start}·{@code mcp-call}을
 * 채운다 (ADR-80 결정 7). {@code skill-call}·{@code skill-slash}는 옛 행에 스킬 이름이 없어 채우지 않는다.
 * 웹 서버가 hook을 받기 시작하기 전(싱글톤 초기화 직후)에 돌아, 새 hook이 직접 센 값과 겹치지 않는다.
 * 끝나면 {@code schema_meta('usage_backfill_v1','done')}로 표시해 다시 하지 않는다.
 */
@Component
public class UsageBackfill implements SmartInitializingSingleton {

    private static final Logger log = LoggerFactory.getLogger(UsageBackfill.class);

    private final JdbcClient jdbcClient;
    private final UsageRepository usageRepository;
    private final EventRepository eventRepository;
    private final TransactionTemplate transactionTemplate;

    public UsageBackfill(
            JdbcClient jdbcClient,
            UsageRepository usageRepository,
            EventRepository eventRepository,
            PlatformTransactionManager transactionManager) {
        this.jdbcClient = jdbcClient;
        this.usageRepository = usageRepository;
        this.eventRepository = eventRepository;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    @Override
    public void afterSingletonsInstantiated() {
        run();
    }

    /** 아직 안 했으면 채우고 {@code true}, 이미 했으면 아무것도 안 하고 {@code false}. */
    public boolean run() {
        Boolean ran = eventRepository.locked(() -> transactionTemplate.execute(status -> {
            if (usageRepository.isBackfillDone()) {
                return false;
            }
            Map<String, Long> counts = new LinkedHashMap<>();
            Map<String, String[]> keys = new LinkedHashMap<>();
            jdbcClient
                    .sql(
                            """
                            SELECT received_at, hook_event_name, tool_name, agent_type FROM events
                            WHERE hook_event_name IN ('SessionStart', 'SubagentStart')
                               OR (hook_event_name = 'PreToolUse' AND tool_name LIKE 'mcp\\_\\_%' ESCAPE '\\')
                            """)
                    .query((rs, n) -> {
                        String agent = rs.getString("agent_type") == null ? "" : rs.getString("agent_type");
                        String event = rs.getString("hook_event_name");
                        String kind;
                        String subject;
                        if (event.equals("PreToolUse")) {
                            subject = HookUsageAggregator.mcpServer(rs.getString("tool_name"));
                            if (subject == null) {
                                return null;
                            }
                            kind = UsageKind.MCP_CALL;
                        } else {
                            kind = UsageKind.SESSION_START;
                            subject = "";
                        }
                        String bucket = UsageBucket.of(OffsetDateTime.parse(
                                        rs.getString("received_at"), DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                                .toInstant());
                        String mapKey = bucket + "|" + kind + "|" + subject + "|" + agent;
                        keys.putIfAbsent(mapKey, new String[] {bucket, kind, subject, agent});
                        counts.merge(mapKey, 1L, Long::sum);
                        return null;
                    })
                    .list();
            for (Map.Entry<String, Long> entry : counts.entrySet()) {
                String[] key = keys.get(entry.getKey());
                usageRepository.incrementHookAgg(
                        key[0], new HookUsageEntry(key[1], key[2], key[3]), entry.getValue());
            }
            usageRepository.markBackfillDone();
            log.info("usage backfill: {} aggregate cells from existing events", counts.size());
            return true;
        }));
        return Boolean.TRUE.equals(ran);
    }
}
