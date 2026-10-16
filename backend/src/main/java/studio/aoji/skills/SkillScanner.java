package studio.aoji.skills;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * {@code .claude/skills/<name>/SKILL.md} 폴더 스캔 (architecture.md §6.4.1, FR-001-AC2·FR-018-AC1).
 * {@code .}으로 시작하는 폴더(임시 폴더)와 심볼릭 링크 폴더·SKILL.md 링크는 세지 않는다. 형식 오류 폴더는
 * 포함하며 이름 오름차순이다. 폴더가 없으면 빈 목록(에러 아님, FR-018-E2). {@code Registry.skillCount}와
 * {@code /<스킬>} 판정이 모두 이 결과를 쓴다.
 */
@Component
public class SkillScanner {

    private static final String SKILL_FILE_NAME = "SKILL.md";
    private static final String SOURCE_FILE_NAME = "SOURCE.md";

    private final SkillFileParser parser;

    public SkillScanner(SkillFileParser parser) {
        this.parser = parser;
    }

    public List<SkillEntry> scan(Path mountRoot) {
        Path skillsDir = mountRoot.resolve(".claude").resolve("skills");
        if (!Files.isDirectory(skillsDir)) {
            return List.of();
        }
        List<Path> folders = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(skillsDir)) {
            for (Path entry : stream) {
                if (isSkillFolder(entry)) {
                    folders.add(entry);
                }
            }
        } catch (IOException e) {
            return List.of();
        }
        folders.sort(Comparator.comparing(p -> p.getFileName().toString()));
        List<SkillEntry> result = new ArrayList<>(folders.size());
        for (Path folder : folders) {
            read(folder).ifPresent(result::add);
        }
        return result;
    }

    /** 이름이 같은 스킬 하나. 없으면 빈 값. 폴더 이름 모양을 검사하지 않고 직접 찾는다. */
    public Optional<SkillEntry> find(Path mountRoot, String name) {
        Path folder = mountRoot.resolve(".claude").resolve("skills").resolve(name);
        if (!isSkillFolder(folder)) {
            return Optional.empty();
        }
        return read(folder);
    }

    private static boolean isSkillFolder(Path entry) {
        String name = entry.getFileName().toString();
        if (name.startsWith(".")) {
            return false;
        }
        return Files.isDirectory(entry, LinkOption.NOFOLLOW_LINKS)
                && Files.isRegularFile(entry.resolve(SKILL_FILE_NAME), LinkOption.NOFOLLOW_LINKS);
    }

    private Optional<SkillEntry> read(Path folder) {
        String name = folder.getFileName().toString();
        Path file = folder.resolve(SKILL_FILE_NAME);
        try {
            byte[] bytes = Files.readAllBytes(file);
            BasicFileAttributes attrs = Files.readAttributes(file, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            ParsedSkillFile parsed = parser.parse(bytes, name);
            boolean imported = Files.isRegularFile(folder.resolve(SOURCE_FILE_NAME), LinkOption.NOFOLLOW_LINKS);
            return Optional.of(new SkillEntry(
                    name,
                    parsed.description(),
                    ".claude/skills/" + name + "/" + SKILL_FILE_NAME,
                    parsed.userOnly(),
                    imported,
                    parsed.formatError(),
                    parsed.body(),
                    attrs.lastModifiedTime().toMillis(),
                    bytes.length));
        } catch (IOException e) {
            return Optional.empty();
        }
    }
}
