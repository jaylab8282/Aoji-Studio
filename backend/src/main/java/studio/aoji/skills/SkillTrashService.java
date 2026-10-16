package studio.aoji.skills;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.stereotype.Component;
import studio.aoji.files.DataDirectory;
import studio.aoji.files.PathGuard;

/**
 * 스킬 폴더를 폴더째 {@code .aojistudio/trash/<name>.<yyyyMMdd-HHmmss>/}로 옮긴다 (ADR-84 결정 5, FR-022-AC3).
 * 같은 초 충돌은 {@code -1}, {@code -2}로 빈 이름을 찾고 {@code REPLACE_EXISTING}을 주지 않아 덮어쓰지 않는다.
 */
@Component
public class SkillTrashService {

    private static final DateTimeFormatter SUFFIX_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private final Clock clock;
    private final DataDirectory dataDirectory;

    public SkillTrashService(Clock clock, DataDirectory dataDirectory) {
        this.clock = clock;
        this.dataDirectory = dataDirectory;
    }

    /** @return 마운트 기준 상대 경로 {@code .aojistudio/trash/<name>.<시각>/} */
    public String move(PathGuard pathGuard, Path skillFolder, String name) throws IOException {
        Path trashDir = pathGuard.resolve(dataDirectory.name(), DataDirectory.TRASH);
        Files.createDirectories(trashDir);

        String timestamp = SUFFIX_FORMAT.format(LocalDateTime.now(clock));
        String folderName = name + "." + timestamp;
        for (int suffix = 1; Files.exists(trashDir.resolve(folderName), java.nio.file.LinkOption.NOFOLLOW_LINKS); suffix++) {
            folderName = name + "." + timestamp + "-" + suffix;
        }
        Path target = pathGuard.resolve(dataDirectory.name(), DataDirectory.TRASH, folderName);
        pathGuard.assertNotSymlink(target);

        moveFolder(skillFolder, target);
        return dataDirectory.relative(DataDirectory.TRASH, folderName) + "/";
    }

    /** 실제 이동. 같은 마운트 안의 이름 바꾸기다. */
    public void moveFolder(Path source, Path target) throws IOException {
        Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
    }
}
