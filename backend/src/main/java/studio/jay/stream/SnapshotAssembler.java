package studio.jay.stream;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.stereotype.Component;
import studio.jay.config.AppProperties;
import studio.jay.events.EventRepository;
import studio.jay.events.EventRowResponse;
import studio.jay.live.LiveStateService;
import studio.jay.registry.RegistryService;

/**
 * api-spec {@code Snapshot} 조립 ({@code Config} + {@code Registry} + {@code Live} +
 * {@code recentEvents} 50, architecture.md §3.2 "SnapshotAssembler(registry + live + recentEvents 50)").
 * 호출마다 {@link RegistryService#current()}·{@link LiveStateService#live()}·최근 이벤트를 다시
 * 읽으므로 락 없이 언제든 최신 값을 준다. {@code workflow} 열은 {@link LiveStateService#toEventRowResponse}가
 * registry로 해석한다(ADR-09).
 */
@Component
public class SnapshotAssembler {

    private static final int RECENT_EVENTS_LIMIT = 50;

    private final AppProperties appProperties;
    private final RegistryService registryService;
    private final LiveStateService liveStateService;
    private final EventRepository eventRepository;

    public SnapshotAssembler(
            AppProperties appProperties,
            RegistryService registryService,
            LiveStateService liveStateService,
            EventRepository eventRepository) {
        this.appProperties = appProperties;
        this.registryService = registryService;
        this.liveStateService = liveStateService;
        this.eventRepository = eventRepository;
    }

    /** {@code GET /api/state}·SSE {@code snapshot} 메시지가 모두 이 메서드를 쓴다. */
    public Snapshot assemble() {
        List<EventRowResponse> recentEvents = eventRepository.findRecent(RECENT_EVENTS_LIMIT).stream()
                .map(liveStateService::toEventRowResponse)
                .toList();

        return new Snapshot(
                OffsetDateTime.now(), buildConfig(), registryService.current(), liveStateService.live(), recentEvents);
    }

    /**
     * api-spec {@code Config}를 조립한다. {@code SettingsController}(T-012)도 이 메서드로 같은
     * {@code hostPath}·{@code collectUrl}·{@code helperUrl}·{@code defaultSessionCommand} 값을 얻어
     * {@code GET /api/state}·{@code GET /api/settings}가 같은 값을 보이도록 한다.
     */
    public Config buildConfig() {
        String publicOrigin = "http://127.0.0.1:" + appProperties.getPublicPort();
        String collectUrl = publicOrigin + "/hooks/events";
        String defaultSessionCommand = CommandStrings.defaultSessionCommand(appProperties.getHostPath());
        return new Config(
                appProperties.getHostPath(),
                publicOrigin,
                collectUrl,
                appProperties.getHelperUrl(),
                defaultSessionCommand);
    }
}
