package studio.aoji.registry;

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

/**
 * 감시 대상 파일의 경로·크기·mtime 캡처 순수 함수(ADR-87). 대상: {@code .claude/agents/*.md},
 * {@code .claude/skills/*&#47;SKILL.md}(크기·mtime 포함), {@code .claude/skills/*&#47;SOURCE.md},
 * {@code .claude/settings.json}, {@code .mcp.json}(FR-023-AC5), {@code <데이터 폴더>/teams/*.json},
 * {@code <데이터 폴더>/helper-token}. {@code .}으로 시작하거나 {@code .tmp}로 끝나는 파일은
 * {@code AtomicFileWriter}의 임시 파일이므로 무시한다(ADR-08; {@code .mcp.json}만 이름을 명시해 예외).
 * 심볼릭 링크는 따라가지 않는다(D-014, NFR-07).
 */
final class WatchedFiles {

    private static final Logger log = LoggerFactory.getLogger(WatchedFiles.class);
    private static final String SKILL_FILE_NAME = "SKILL.md";
    private static final String SOURCE_FILE_NAME = "SOURCE.md";
    private static final String MCP_FILE_NAME = ".mcp.json";

    private WatchedFiles() {}

    /** 상대 경로 → 크기·mtime. */
    static Map<String, FileStat> capture(Path mountRoot, Path helperTokenFile, Path teamsDir) {
        Map<String, FileStat> snapshot = new HashMap<>();

        addFileIfWatchable(snapshot, mountRoot, mountRoot.resolve(".claude").resolve("settings.json"));
        addFileIfWatchable(snapshot, mountRoot, helperTokenFile);
        addFileIfWatchable(snapshot, mountRoot, mountRoot.resolve(MCP_FILE_NAME), true);
        addMatchingFiles(snapshot, mountRoot, mountRoot.resolve(".claude").resolve("agents"), ".md");
        addMatchingFiles(snapshot, mountRoot, teamsDir, ".json");
        addSkillFiles(snapshot, mountRoot, mountRoot.resolve(".claude").resolve("skills"));

        return snapshot;
    }

    private static void addMatchingFiles(Map<String, FileStat> snapshot, Path mountRoot, Path dir, String suffix) {
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

    private static void addSkillFiles(Map<String, FileStat> snapshot, Path mountRoot, Path skillsDir) {
        if (isSymlinkOrMissingDir(skillsDir)) {
            return;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(skillsDir)) {
            for (Path entry : stream) {
                String name = entry.getFileName().toString();
                if (isIgnoredName(name) || Files.isSymbolicLink(entry) || !Files.isDirectory(entry)) {
                    continue;
                }
                // SKILL.md는 존재뿐 아니라 크기·mtime 변화도 비교한다(FR-018-AC4, FileStat). SOURCE.md는
                // 가져온 스킬의 출처 기록이라 생김·사라짐(과 내용 변화)을 감시한다(FR-018-AC5, ADR-87).
                addFileIfWatchable(snapshot, mountRoot, entry.resolve(SKILL_FILE_NAME));
                addFileIfWatchable(snapshot, mountRoot, entry.resolve(SOURCE_FILE_NAME));
            }
        } catch (IOException e) {
            log.debug("skills directory listing failed: {}", skillsDir, e);
        }
    }

    private static void addFileIfWatchable(Map<String, FileStat> snapshot, Path mountRoot, Path file) {
        addFileIfWatchable(snapshot, mountRoot, file, false);
    }

    /** {@code explicitName}이면 {@code .mcp.json}처럼 이름이 {@code .}으로 시작해도 이름으로 걸러내지 않는다. */
    private static void addFileIfWatchable(
            Map<String, FileStat> snapshot, Path mountRoot, Path file, boolean explicitName) {
        String name = file.getFileName().toString();
        if ((!explicitName && isIgnoredName(name)) || name.endsWith(".tmp") || Files.isSymbolicLink(file)) {
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

    private static boolean isSymlinkOrMissingDir(Path dir) {
        return Files.isSymbolicLink(dir) || !Files.isDirectory(dir);
    }

    private static boolean isIgnoredName(String name) {
        return name.startsWith(".") || name.endsWith(".tmp");
    }

    /** 감시 대상 파일 한 개의 크기·mtime. */
    record FileStat(long size, FileTime mtime) {}
}
