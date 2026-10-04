package studio.aoji.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.collect.CollectTokenStore;
import studio.aoji.registry.HookSettingsExampleBuilder;
import studio.aoji.registry.RegistryService;
import studio.aoji.registry.RegistrySnapshot;
import studio.aoji.stream.CommandStrings;
import studio.aoji.stream.Config;
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
 * <p>컨테이너 마운트 절대 경로({@code JAYSTUDIO_MOUNT_PATH} 값, {@code AppProperties.getMountPath()})는
 * 응답 어디에도 넣지 않는다(D-021, conventions.md §5) — api-spec {@code Settings}에는 {@code mountPath}
 * 필드가 없다.
 */
@RestController
@RequestMapping("/api")
public class SettingsController {

    private static final String TERMINAL_APP = "macOS 기본 터미널";
    private static final String TEAMS_PATH = ".jaystudio/teams/*.json";
    private static final String TRASH_PATH = ".jaystudio/trash/";
    private static final int RETENTION_DAYS = 30;
    private static final String ALLOWED_HTTP_HOOK_URLS_NOTE =
            "allowedHttpHookUrls가 설정되어 있으면 수집 주소를 허용 목록에 추가하세요";

    private final SnapshotAssembler snapshotAssembler;
    private final RegistryService registryService;
    private final CollectTokenStore collectTokenStore;
    private final HookSettingsExampleBuilder hookSettingsExampleBuilder;

    public SettingsController(
            SnapshotAssembler snapshotAssembler,
            RegistryService registryService,
            CollectTokenStore collectTokenStore,
            HookSettingsExampleBuilder hookSettingsExampleBuilder) {
        this.snapshotAssembler = snapshotAssembler;
        this.registryService = registryService;
        this.collectTokenStore = collectTokenStore;
        this.hookSettingsExampleBuilder = hookSettingsExampleBuilder;
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
                TERMINAL_APP,
                config.defaultSessionCommand(),
                CommandStrings.leadSessionCommandTemplate(config.hostPath()),
                config.helperUrl(),
                config.collectUrl(),
                registry.hookConfigured(),
                hookSettingsExample,
                TEAMS_PATH,
                TRASH_PATH,
                RETENTION_DAYS,
                ALLOWED_HTTP_HOOK_URLS_NOTE);
    }
}
