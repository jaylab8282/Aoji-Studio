package studio.aoji.files;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.stereotype.Component;

/**
 * 정의 파일을 휴지통으로 옮긴다 (architecture.md §3.1, §6.4, ADR-08 "제거", FR-012-AC2·AC4,
 * tasks.md T-011). {@code <데이터 폴더>/trash/}는 읽기 API만으로는 만들지 않고, 이 클래스가 처음 옮길 때
 * 만든다(FR-001-AC6과 같은 원칙 — 쓰기 시점에만 디렉터리를 만든다).
 *
 * <p>대상 파일명은 {@code <name>.<yyyyMMdd-HHmmss>.md}(서버 TZ {@code Asia/Seoul}, {@link
 * #clock}은 {@code studio.aoji.config.ClockConfig}가 그 존으로 고정해 주입한다). 같은 초에 같은
 * 이름이 이미 있으면 {@code -1}, {@code -2}로 접미를 늘려가며 빈 이름을 찾는다(architecture.md §6.4).
 * 이동은 {@link Files#move(Path, Path, java.nio.file.CopyOption...)}에 {@code REPLACE_EXISTING}을
 * 주지 않아 덮어쓰지 않는다.
 */
@Component
public class TrashService {

    private static final String TRASH_SEGMENT = DataDirectory.TRASH;
    private static final DateTimeFormatter SUFFIX_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private final Clock clock;
    private final DataDirectory dataDirectory;

    public TrashService(Clock clock, DataDirectory dataDirectory) {
        this.clock = clock;
        this.dataDirectory = dataDirectory;
    }

    /**
     * {@code sourceFile}을 휴지통으로 옮긴다. {@code name}은 호출자가 이미 name 규칙으로 검증한
     * 값이어야 한다(파일명 조립에만 쓴다). 같은 마운트 안이므로 {@code ATOMIC_MOVE}로 옮긴다.
     */
    public MoveResult move(PathGuard pathGuard, Path sourceFile, String name) throws IOException {
        Path trashDir = pathGuard.resolve(dataDirectory.name(), TRASH_SEGMENT);
        Files.createDirectories(trashDir);

        String timestamp = SUFFIX_FORMAT.format(LocalDateTime.now(clock));
        Path target = uniqueTarget(pathGuard, name, timestamp);
        pathGuard.assertNotSymlink(target);

        Files.move(sourceFile, target, StandardCopyOption.ATOMIC_MOVE);

        String relativePath = dataDirectory.relative(TRASH_SEGMENT, target.getFileName().toString());
        return new MoveResult(relativePath, target);
    }

    /** {@link #move}로 옮긴 파일을 원위치로 되돌린다(ADR-08 "제거" 롤백, FR-012-E1). 롤백은 최선 노력이다. */
    public void restore(Path trashFile, Path originalLocation) throws IOException {
        Files.move(trashFile, originalLocation, StandardCopyOption.ATOMIC_MOVE);
    }

    private Path uniqueTarget(PathGuard pathGuard, String name, String timestamp) {
        Path base = pathGuard.resolve(dataDirectory.name(), TRASH_SEGMENT, name + "." + timestamp + ".md");
        if (!Files.exists(base)) {
            return base;
        }
        for (int suffix = 1; ; suffix++) {
            Path candidate =
                    pathGuard.resolve(dataDirectory.name(), TRASH_SEGMENT, name + "." + timestamp + "-" + suffix + ".md");
            if (!Files.exists(candidate)) {
                return candidate;
            }
        }
    }

    /** {@code relativePath}는 마운트 루트 기준 상대 경로(api-spec {@code trashPath}), {@code trashFile}은 절대 경로. */
    public record MoveResult(String relativePath, Path trashFile) {}
}
