package studio.aoji.registry;

import java.nio.file.Path;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import studio.aoji.config.AppProperties;
import studio.aoji.files.DataDirectory;
import studio.aoji.stream.SseHub;

/**
 * 1초 폴링으로 감시 대상 파일의 경로·크기·mtime 캡처({@link WatchedFiles})를 {@link RegistryService}의
 * 기준선과 비교해 외부(호스트)에서 생긴 변경을 감지한다(architecture.md §3.1·§3.2, ADR-04·ADR-87).
 * 감시 대상·무시 규칙·심볼릭 링크 처리는 {@link WatchedFiles}를 본다.
 *
 * <p>변경이 있으면 {@link RegistryService#rescanNow(java.util.function.Consumer)}로 재스캔한 뒤 {@link SseHub#broadcast}로
 * {@code registry} → {@code live} 순서로 방송한다(realtime-spec.md "registry 변경 시 registry → live
 * 순서"). 폴링 중 예외는 로그만 남기고 다음 주기에 다시 시도한다 — 스케줄이 죽지 않아야 한다(tasks.md
 * T-004).
 *
 * <p>폴링 간격은 {@code aojistudio.poll-interval-ms}(기본 1000, ADR-04 결정값)로 둔다. 운영 기본값은
 * 항상 1000ms이며, 통합 테스트만 이 프로퍼티를 낮춰 주입해 대량 반복 측정 시간을 줄인다
 * (FolderPollerLatencyTest). 최소 한 종류는 실제 1000ms 간격으로도 측정한다
 * (FolderPollerRealPollIntervalLatencyTest, ADR-04 측정 의무).
 */
@Component
public class FolderPoller {

    private static final Logger log = LoggerFactory.getLogger(FolderPoller.class);

    private final AppProperties appProperties;
    private final DataDirectory dataDirectory;
    private final RegistryService registryService;
    private final SseHub sseHub;

    public FolderPoller(
            AppProperties appProperties,
            DataDirectory dataDirectory,
            RegistryService registryService,
            SseHub sseHub) {
        this.appProperties = appProperties;
        this.dataDirectory = dataDirectory;
        this.registryService = registryService;
        this.sseHub = sseHub;
    }

    @Scheduled(fixedDelayString = "#{@appProperties.pollIntervalMs}")
    void poll() {
        try {
            Path mountRoot = Path.of(appProperties.getMountPath());
            Map<String, WatchedFiles.FileStat> captured =
                    WatchedFiles.capture(mountRoot, dataDirectory.helperTokenFile(), dataDirectory.teamsDir());
            if (registryService.baselineDiffers(captured)) {
                // 기준선은 RegistryService.rescanNow가 캡처 → 스캔·방송 → 성공 시 저장으로 갱신한다(ADR-87).
                // 방송을 rescanNow()의 락 안에서 실행해 RegistryController의 동시 rescan과 경합해도
                // registry 방송 순서가 revision 순서를 따르게 한다. 재스캔이 실패하면 기준선이 오르지 않아
                // 같은 변경을 다음 주기에 다시 감지한다.
                registryService.rescanNow(registry -> sseHub.broadcast(registry));
            }
        } catch (Exception e) {
            // 폴링 1회 실패로 스케줄 자체가 멈추면 안 된다 — 다음 주기에 다시 시도한다.
            log.warn("folder poll failed, will retry next cycle", e);
        }
    }
}
