package studio.aoji.registry;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import studio.aoji.config.AppProperties;
import studio.aoji.files.DataDirectory;
import studio.aoji.live.LiveStateService;
import studio.aoji.stream.SseHub;

/**
 * 1초 폴링으로 감시 대상 파일의 경로·크기·mtime 스냅샷을 비교해 외부(호스트)에서 생긴 변경을
 * 감지한다(architecture.md §3.1·§3.2, ADR-04). 감시 대상: {@code .claude/agents/*.md},
 * {@code .claude/skills/*&#47;SKILL.md}, {@code .claude/settings.json}, {@code <데이터 폴더>/teams/*.json},
 * {@code <데이터 폴더>/helper-token}. {@code .}으로 시작하거나 {@code .tmp}로 끝나는 파일은
 * {@code AtomicFileWriter}가 쓰는 임시 파일이므로 무시한다(ADR-08). 심볼릭 링크는 따라가지 않는다
 * (D-014, NFR-07) — 링크 자체는 감시 대상에 넣지 않고, 링크인 디렉터리는 내려가지 않는다.
 *
 * <p>변경이 있으면 {@link RegistryService#rescanNow()}로 재스캔한 뒤 {@link SseHub#broadcast}로
 * {@code registry} → {@code live} 순서로 방송한다(realtime-spec.md "registry 변경 시 registry → live
 * 순서"). 폴링 중 예외는 로그만 남기고 다음 주기에 다시 시도한다 — 스케줄이 죽지 않아야 한다(tasks.md
 * T-004). {@link #lastSnapshot}은 Spring Boot 기본 단일 스레드 스케줄러(추가 {@code TaskScheduler}
 * 빈 없음, {@code SseHub} heartbeat와 동일 전제)에서만 접근하므로 별도 동기화가 필요 없다.
 *
 * <p>폴링 간격은 {@code aojistudio.poll-interval-ms}(기본 1000, ADR-04 결정값)로 둔다. 운영 기본값은
 * 항상 1000ms이며, 통합 테스트만 이 프로퍼티를 낮춰 주입해 대량 반복 측정 시간을 줄인다
 * (FolderPollerLatencyTest). 최소 한 종류는 실제 1000ms 간격으로도 측정한다
 * (FolderPollerRealPollIntervalLatencyTest, ADR-04 측정 의무).
 */
@Component
public class FolderPoller {

    private static final Logger log = LoggerFactory.getLogger(FolderPoller.class);
    private static final String SKILL_FILE_NAME = "SKILL.md";

    private final AppProperties appProperties;
    private final DataDirectory dataDirectory;
    private final RegistryService registryService;
    private final LiveStateService liveStateService;
    private final SseHub sseHub;

    private Map<String, FileStat> lastSnapshot = Map.of();

    public FolderPoller(
            AppProperties appProperties,
            DataDirectory dataDirectory,
            RegistryService registryService,
            LiveStateService liveStateService,
            SseHub sseHub) {
        this.appProperties = appProperties;
        this.dataDirectory = dataDirectory;
        this.registryService = registryService;
        this.liveStateService = liveStateService;
        this.sseHub = sseHub;
    }

    /**
     * 기동 시 현재 파일 상태를 기준선으로 삼는다. {@link RegistryService}는 이미 자신의
     * {@code @PostConstruct}에서 초기 스캔을 마쳤으므로 여기서는 방송하지 않는다.
     */
    @PostConstruct
    void init() {
        lastSnapshot = captureSnapshot();
    }

    @Scheduled(fixedDelayString = "${aojistudio.poll-interval-ms:1000}")
    void poll() {
        try {
            Map<String, FileStat> snapshot = captureSnapshot();
            if (!snapshot.equals(lastSnapshot)) {
                // 방송을 rescanNow()의 락 안에서 실행해 RegistryController의 동시 rescan과 경합해도
                // registry 방송 순서가 revision 순서를 따르게 한다(review NEEDS_FIX round 1).
                registryService.rescanNow(registry -> sseHub.broadcast(registry, liveStateService.live()));
                // 재스캔·방송이 성공한 뒤에만 기준선을 올린다. 먼저 올리면 재스캔이 한 번 실패했을 때 그 변경이
                // 기준선에 이미 반영돼 다음 주기에 다시 감지되지 않고 영구히 누락된다(registry 방송 유실).
                lastSnapshot = snapshot;
            }
        } catch (Exception e) {
            // 폴링 1회 실패로 스케줄 자체가 멈추면 안 된다 — 다음 주기에 다시 시도한다.
            log.warn("folder poll failed, will retry next cycle", e);
        }
    }

    private Map<String, FileStat> captureSnapshot() {
        Path mountRoot = Path.of(appProperties.getMountPath());
        Map<String, FileStat> snapshot = new HashMap<>();

        addFileIfWatchable(snapshot, mountRoot, mountRoot.resolve(".claude").resolve("settings.json"));
        addFileIfWatchable(snapshot, mountRoot, dataDirectory.helperTokenFile());
        addMatchingFiles(snapshot, mountRoot, mountRoot.resolve(".claude").resolve("agents"), ".md");
        addMatchingFiles(snapshot, mountRoot, dataDirectory.teamsDir(), ".json");
        addSkillFiles(snapshot, mountRoot, mountRoot.resolve(".claude").resolve("skills"));

        return snapshot;
    }

    private void addMatchingFiles(Map<String, FileStat> snapshot, Path mountRoot, Path dir, String suffix) {
        if (isSymlinkOrMissingDir(dir)) {
            return;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path entry : stream) {
                String name = entry.getFileName().toString();
                if (isIgnoredName(name) || !name.endsWith(suffix)) {
                    continue;
                }
                addFileIfWatchable(snapshot, mountRoot, entry);
            }
        } catch (IOException e) {
            log.debug("directory listing failed: {}", dir, e);
        }
    }

    private void addSkillFiles(Map<String, FileStat> snapshot, Path mountRoot, Path skillsDir) {
        if (isSymlinkOrMissingDir(skillsDir)) {
            return;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(skillsDir)) {
            for (Path entry : stream) {
                String name = entry.getFileName().toString();
                if (isIgnoredName(name) || Files.isSymbolicLink(entry) || !Files.isDirectory(entry)) {
                    continue;
                }
                // 존재 여부만 감시 대상이면 충분하다(architecture.md ADR-04, FR-001-AC2·E3): SKILL.md가
                // 생기거나 사라지면 스냅샷 키 집합이 바뀐다.
                addFileIfWatchable(snapshot, mountRoot, entry.resolve(SKILL_FILE_NAME));
            }
        } catch (IOException e) {
            log.debug("skills directory listing failed: {}", skillsDir, e);
        }
    }

    private void addFileIfWatchable(Map<String, FileStat> snapshot, Path mountRoot, Path file) {
        String name = file.getFileName().toString();
        if (isIgnoredName(name) || Files.isSymbolicLink(file)) {
            return;
        }
        try {
            BasicFileAttributes attrs = Files.readAttributes(file, BasicFileAttributes.class);
            if (!attrs.isRegularFile()) {
                return;
            }
            snapshot.put(mountRoot.relativize(file).toString(), new FileStat(attrs.size(), attrs.lastModifiedTime()));
        } catch (IOException e) {
            // 파일이 없다 — 감시 대상에서 빠지는 것 자체가 스냅샷 비교로 상태 변화를 나타낸다.
        }
    }

    private boolean isSymlinkOrMissingDir(Path dir) {
        return Files.isSymbolicLink(dir) || !Files.isDirectory(dir);
    }

    private static boolean isIgnoredName(String name) {
        return name.startsWith(".") || name.endsWith(".tmp");
    }

    private record FileStat(long size, FileTime mtime) {}
}
