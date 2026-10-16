package studio.aoji.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** 감시 대상 캡처 순수 함수(ADR-87). */
class WatchedFilesTest {

    @TempDir
    Path mountRoot;

    private Path skillDir;

    @BeforeEach
    void setUp() throws IOException {
        skillDir = Files.createDirectories(mountRoot.resolve(".claude").resolve("skills").resolve("demo"));
        Files.createDirectories(mountRoot.resolve(".aojistudio").resolve("teams"));
    }

    private Map<String, WatchedFiles.FileStat> capture() {
        Path data = mountRoot.resolve(".aojistudio");
        return WatchedFiles.capture(mountRoot, data.resolve("helper-token"), data.resolve("teams"));
    }

    private static void write(Path file, String content) throws IOException {
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("[FR-018-AC4] SKILL.md 내용 변경은 크기가 달라져서 감지된다")
    void skillMdSizeChangeIsDetected() throws IOException {
        write(skillDir.resolve("SKILL.md"), "one");
        Map<String, WatchedFiles.FileStat> before = capture();
        write(skillDir.resolve("SKILL.md"), "three");
        assertThat(capture()).isNotEqualTo(before);
    }

    @Test
    @DisplayName("[FR-018-AC4] SKILL.md 크기가 같아도 mtime이 바뀌면 감지된다")
    void skillMdMtimeChangeIsDetected() throws IOException {
        Path skill = skillDir.resolve("SKILL.md");
        write(skill, "same");
        Files.setLastModifiedTime(skill, FileTime.fromMillis(1_700_000_000_000L));
        Map<String, WatchedFiles.FileStat> before = capture();
        Files.setLastModifiedTime(skill, FileTime.fromMillis(1_700_000_005_000L));
        assertThat(capture()).isNotEqualTo(before);
    }

    @Test
    @DisplayName("[FR-018-AC4] SOURCE.md가 생기고 사라지면 감지된다")
    void sourceMdAppearAndDisappearAreDetected() throws IOException {
        write(skillDir.resolve("SKILL.md"), "x");
        Map<String, WatchedFiles.FileStat> none = capture();
        write(skillDir.resolve("SOURCE.md"), "origin");
        Map<String, WatchedFiles.FileStat> with = capture();
        assertThat(with).isNotEqualTo(none);
        assertThat(with).containsKey(Path.of(".claude", "skills", "demo", "SOURCE.md").toString());
        Files.delete(skillDir.resolve("SOURCE.md"));
        assertThat(capture()).isEqualTo(none);
    }

    @Test
    @DisplayName("[FR-023-AC5] .mcp.json 생김·변경·삭제가 감지된다")
    void mcpJsonChangeIsDetected() throws IOException {
        Map<String, WatchedFiles.FileStat> none = capture();
        write(mountRoot.resolve(".mcp.json"), "{}");
        Map<String, WatchedFiles.FileStat> created = capture();
        assertThat(created).isNotEqualTo(none).containsKey(".mcp.json");
        write(mountRoot.resolve(".mcp.json"), "{\"mcpServers\":{}}");
        assertThat(capture()).isNotEqualTo(created);
        Files.delete(mountRoot.resolve(".mcp.json"));
        assertThat(capture()).isEqualTo(none);
    }

    @Test
    @DisplayName("[FR-023-AC5] 점으로 시작하는 임시 파일과 .tmp는 무시한다(.mcp.json만 예외)")
    void dotAndTmpFilesAreIgnored() throws IOException {
        Map<String, WatchedFiles.FileStat> before = capture();
        write(mountRoot.resolve(".claude").resolve("skills").resolve("demo").resolve(".SKILL.md.swp"), "x");
        write(skillDir.resolve("SOURCE.md.tmp"), "x");
        write(mountRoot.resolve(".mcp.json.tmp"), "x");
        write(mountRoot.resolve(".other.json"), "x");
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        write(mountRoot.resolve(".claude").resolve("agents").resolve(".a.md"), "x");
        write(mountRoot.resolve(".claude").resolve("agents").resolve("b.md.tmp"), "x");
        assertThat(capture()).isEqualTo(before);
    }
}
