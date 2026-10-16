package studio.aoji.registry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.spy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import studio.aoji.files.AtomicFileWriter;
import studio.aoji.skills.SkillEntry;
import studio.aoji.skills.SkillFileParser;
import studio.aoji.skills.SkillScanner;
import studio.aoji.skills.SkillWriter;

/**
 * 스킬 만들기 도중 임시 폴더 {@code .<name>.<난수>.tmp}가 {@link SkillScanner}·{@link WatchedFiles} 결과에
 * 잡히지 않는다(ADR-84 결정 4, T-R4-09 리뷰 D-164). {@link WatchedFiles}가 패키지 비공개라 이 패키지에 둔다.
 */
class SkillCreateTempFolderIgnoredTest {

    @TempDir
    Path mount;

    @Test
    @DisplayName("[FR-020-E3][D-164] 폴더째 이동 직전(SKILL.md까지 쓴 임시 폴더가 있는 순간) 스캐너·감시 목록에는 임시 폴더가 없다")
    void tempFolderIsInvisibleWhileCreating() throws IOException {
        Path skills = mount.resolve(".claude").resolve("skills");
        Files.createDirectories(skills.resolve("keep"));
        Files.writeString(skills.resolve("keep").resolve("SKILL.md"), "---\nname: keep\ndescription: d\n---\n");

        SkillScanner scanner = new SkillScanner(new SkillFileParser());
        SkillWriter writer = spy(new SkillWriter(new AtomicFileWriter()));
        List<String> tmpFoldersAtMoveTime = new java.util.ArrayList<>();
        List<String> scannedNames = new java.util.ArrayList<>();
        Set<String>[] watched = new Set[1];
        doAnswer(inv -> {
                    try (Stream<Path> s = Files.list(skills)) {
                        s.map(p -> p.getFileName().toString())
                                .filter(n -> n.startsWith(".") && n.endsWith(".tmp"))
                                .forEach(tmpFoldersAtMoveTime::add);
                    }
                    // 임시 폴더 안에는 이미 완성된 SKILL.md가 있다 — 그래도 스캐너·감시는 건너뛰어야 한다.
                    assertThat(Files.isRegularFile(((Path) inv.getArgument(0)).resolve("SKILL.md"))).isTrue();
                    scanner.scan(mount).stream().map(SkillEntry::name).forEach(scannedNames::add);
                    watched[0] = WatchedFiles.capture(mount, mount.resolve(".aojistudio/helper-token"), mount.resolve(".aojistudio/teams"))
                            .keySet();
                    return inv.callRealMethod();
                })
                .when(writer)
                .moveIntoPlace(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

        writer.create(skills, "fresh", SkillWriter.buildNewContent("fresh", "설명", false, "본문"));

        assertThat(tmpFoldersAtMoveTime).hasSize(1);
        assertThat(tmpFoldersAtMoveTime.get(0)).startsWith(".fresh.").endsWith(".tmp");
        assertThat(scannedNames).containsExactly("keep");
        assertThat(watched[0]).containsExactly(".claude/skills/keep/SKILL.md");
        // 이동이 끝나면 새 스킬이 보이고 임시 폴더는 없다.
        assertThat(scanner.scan(mount)).extracting(SkillEntry::name).containsExactly("fresh", "keep");
        assertThat(WatchedFiles.capture(mount, mount.resolve(".aojistudio/helper-token"), mount.resolve(".aojistudio/teams")).keySet())
                .containsExactlyInAnyOrder(".claude/skills/keep/SKILL.md", ".claude/skills/fresh/SKILL.md");
        try (Stream<Path> s = Files.list(skills)) {
            assertThat(s.map(p -> p.getFileName().toString()).filter(n -> n.startsWith("."))).isEmpty();
        }
    }
}
