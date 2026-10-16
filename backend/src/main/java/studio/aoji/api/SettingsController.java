package studio.aoji.api;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.collect.CollectTokenStore;
import studio.aoji.files.DataDirectory;
import studio.aoji.globalcfg.GlobalClaudeMounts;
import studio.aoji.globalcfg.GlobalClaudeReader;
import studio.aoji.registry.HookSettingsExampleBuilder;
import studio.aoji.registry.RegistryService;
import studio.aoji.registry.RegistrySnapshot;
import studio.aoji.stream.CommandStrings;
import studio.aoji.stream.Config;
import studio.aoji.statusline.StatuslineLast;
import studio.aoji.statusline.StatuslineSettingsExampleBuilder;
import studio.aoji.statusline.StatuslineStore;
import studio.aoji.stream.SnapshotAssembler;

/**
 * 07 설정 값 (api-spec {@code GET /api/settings}, FR-014). Origin 규칙은 {@code /api/*}에 걸린
 * {@code OriginFilter}가 이미 적용한다(architecture.md §5 — 이 엔드포인트는 GET 읽기이므로 브라우저
 * 토큰은 요구하지 않는다). {@code hostPath}·{@code collectUrl}·{@code helperUrl}·
 * {@code defaultSessionCommand}는 {@link SnapshotAssembler#buildConfig()}로 만들어 {@code GET /api/state}
 * 와 같은 값을 준다(태스크 지시 "한 곳에서 조립해 두 API가 공유").
 *
 * <p>이 컨트롤러는 {@code .claude/settings.json}을 쓰지 않는다 — 읽기는 {@link RegistryService#current()}
 * 가 스캔 시점에 이미 읽어 둔 {@link RegistrySnapshot#hookConfigured()}를 그대로 쓴다(FR-014-AC1).
 *
 * <p>컨테이너 마운트 절대 경로({@code AOJISTUDIO_MOUNT_PATH} 값, {@code AppProperties.getMountPath()})는
 * 응답 어디에도 넣지 않는다(D-021, conventions.md §5) — api-spec {@code Settings}에는 {@code mountPath}
 * 필드가 없다.
 */
@RestController
@RequestMapping("/api")
public class SettingsController {

    private static final String TERMINAL_APP_MACOS = "macOS 기본 터미널";
    private static final String TERMINAL_APP_WSL = "Windows Terminal";
    private static final int RETENTION_DAYS = 30;
    private static final String ALLOWED_HTTP_HOOK_URLS_NOTE =
            "allowedHttpHookUrls가 설정되어 있으면 수집 주소를 허용 목록에 추가하세요";

    private final SnapshotAssembler snapshotAssembler;
    private final RegistryService registryService;
    private final CollectTokenStore collectTokenStore;
    private final HookSettingsExampleBuilder hookSettingsExampleBuilder;
    private final DataDirectory dataDirectory;
    private final GlobalClaudeMounts globalClaudeMounts;
    private final GlobalClaudeReader globalClaudeReader;
    private final StatuslineStore statuslineStore;
    private final StatuslineSettingsExampleBuilder statuslineExampleBuilder;
    private final Clock clock;

    public SettingsController(
            SnapshotAssembler snapshotAssembler,
            RegistryService registryService,
            CollectTokenStore collectTokenStore,
            HookSettingsExampleBuilder hookSettingsExampleBuilder,
            DataDirectory dataDirectory,
            GlobalClaudeMounts globalClaudeMounts,
            GlobalClaudeReader globalClaudeReader,
            StatuslineStore statuslineStore,
            StatuslineSettingsExampleBuilder statuslineExampleBuilder,
            Clock clock) {
        this.snapshotAssembler = snapshotAssembler;
        this.registryService = registryService;
        this.collectTokenStore = collectTokenStore;
        this.hookSettingsExampleBuilder = hookSettingsExampleBuilder;
        this.dataDirectory = dataDirectory;
        this.globalClaudeMounts = globalClaudeMounts;
        this.globalClaudeReader = globalClaudeReader;
        this.statuslineStore = statuslineStore;
        this.statuslineExampleBuilder = statuslineExampleBuilder;
        this.clock = clock;
    }

    @GetMapping("/settings")
    public Settings settings() {
        Config config = snapshotAssembler.buildConfig();
        RegistrySnapshot registry = registryService.current();
        String hookSettingsExample =
                hookSettingsExampleBuilder.build(config.collectUrl(), collectTokenStore.token());

        return new Settings(
                config.hostPath(),
                registry.agentCount(),
                registry.skillCount(),
                registry.writable(),
                registry.formatErrors().size(),
                registry.agentsDirMissing(),
                "wsl".equals(config.hostOs()) ? TERMINAL_APP_WSL : TERMINAL_APP_MACOS,
                config.defaultSessionCommand(),
                CommandStrings.leadSessionCommandTemplate(config.hostOs(), config.wslDistro(), config.hostPath()),
                config.helperUrl(),
                config.collectUrl(),
                registry.hookConfigured(),
                hookSettingsExample,
                dataDirectory.relative(DataDirectory.TEAMS, "*.json"),
                dataDirectory.relative(DataDirectory.TRASH) + "/",
                RETENTION_DAYS,
                ALLOWED_HTTP_HOOK_URLS_NOTE,
                config.hostOs(),
                config.wslDistro(),
                statusline(config),
                globalClaude());
    }

    /** 07 상태줄 연동 카드: 설정 예시(토큰 없음)와 마지막 수신 시각. */
    private StatuslineSettings statusline(Config config) {
        OffsetDateTime lastReceivedAt = statuslineStore
                .last()
                .map(StatuslineLast::receivedAt)
                .map(at -> at.atZone(clock.getZone()).toOffsetDateTime())
                .orElse(null);
        return new StatuslineSettings(
                statuslineExampleBuilder.build(config.hostPath(), config.publicOrigin()), lastReceivedAt);
    }

    /** 전역 Claude 설정 4개 항목(고정 순서)과 마지막으로 읽은 시각. */
    private GlobalClaudeStatus globalClaude() {
        List<GlobalClaudeStatus.Item> items = new ArrayList<>();
        for (GlobalClaudeMounts.ItemStatus status : globalClaudeMounts.statuses()) {
            items.add(new GlobalClaudeStatus.Item(status.item().key(), status.connected()));
        }
        Instant readAt = globalClaudeReader.snapshot().readAt();
        return new GlobalClaudeStatus(items, readAt == null ? null : readAt.atZone(clock.getZone()).toOffsetDateTime());
    }
}
