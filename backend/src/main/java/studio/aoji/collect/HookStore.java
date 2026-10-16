package studio.aoji.collect;

import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import studio.aoji.events.EventRepository;
import studio.aoji.events.EventRow;
import studio.aoji.live.HookPayload;
import studio.aoji.registry.RegistryService;
import studio.aoji.usage.HookUsageAggregator;

/**
 * hook 1건 저장: 이벤트 INSERT와 일별 집계 UPSERT를 한 트랜잭션으로 묶는다(ADR-80 결정 2,
 * INSERT 1 + UPSERT ≤ 1~2). 하나라도 실패하면 둘 다 취소되어 이벤트와 집계가 어긋나지 않는다.
 */
@Component
public class HookStore {

    /** 저장된 행과 집계가 바뀐 영역({@code skills}·{@code mcp}). */
    public record Stored(EventRow row, Set<String> changedAreas) {}

    private final EventRepository eventRepository;
    private final HookUsageAggregator aggregator;
    private final RegistryService registryService;
    private final TransactionTemplate transactionTemplate;

    public HookStore(
            EventRepository eventRepository,
            HookUsageAggregator aggregator,
            RegistryService registryService,
            PlatformTransactionManager transactionManager) {
        this.eventRepository = eventRepository;
        this.aggregator = aggregator;
        this.registryService = registryService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public Stored store(EventRow event, HookPayload payload) {
        return eventRepository.locked(() -> transactionTemplate.execute(status -> {
            EventRow inserted = eventRepository.insert(event);
            Set<String> areas = aggregator.record(
                    payload, event.receivedAt().toInstant(), registryService.skillNames());
            return new Stored(inserted, areas);
        }));
    }
}
