package studio.aoji.globalcfg;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import studio.aoji.config.AppProperties;
import studio.aoji.support.ClaudeHomeFixture;
import studio.aoji.support.FixtureFiles;
import tools.jackson.databind.ObjectMapper;

/** 전역 Claude 설정 연결 판정 (ADR-79 결정 3, FR-014 Output, FR-023-E2, NFR-15·NFR-07). */
class GlobalClaudeMountsTest {

    @TempDir
    Path home;

    private GlobalClaudeMounts mounts(String homeHost) {
        AppProperties properties = new AppProperties();
        properties.setHostPath("/Users/someone/AojiStudio");
        properties.setClaudeHomeHost(homeHost);
        properties.setClaudeHomeMount(home.toString());
        return new GlobalClaudeMounts(properties, new ObjectMapper());
    }

    private static List<Boolean> flags(GlobalClaudeMounts mounts) {
        return mounts.statuses().stream().map(GlobalClaudeMounts.ItemStatus::connected).toList();
    }

    @Test
    @DisplayName("[NFR-15] 항목은 4개이고 순서는 claudeJson → settings → plugins → projects")
    void statusesAreFourInFixedOrder() throws IOException {
        ClaudeHomeFixture.copyBasic(home, "/Users/someone/AojiStudio");

        assertThat(mounts("/home/fixture").statuses())
                .extracting(s -> s.item().key())
                .containsExactly("claudeJson", "settings", "plugins", "projects");
    }

    @Test
    @DisplayName("[NFR-15] 홈 경로가 비었으면 파일이 있어도 4개 모두 연결 안 됨")
    void emptyHomeMeansAllNotConnected() throws IOException {
        ClaudeHomeFixture.copyBasic(home, "/Users/someone/AojiStudio");

        assertThat(flags(mounts(""))).containsExactly(false, false, false, false);
        assertThat(mounts("").homeConfigured()).isFalse();
    }

    @Test
    @DisplayName("[NFR-15] 홈 경로가 있고 4개 모두 실제 파일·폴더면 4개 모두 연결됨")
    void realItemsAreConnected() throws IOException {
        ClaudeHomeFixture.copyBasic(home, "/Users/someone/AojiStudio");

        assertThat(flags(mounts("/home/fixture"))).containsExactly(true, true, true, true);
    }

    @Test
    @DisplayName("[NFR-15] 대역 표지(tools/claude-home-off)는 홈 경로가 있어도 4개 모두 연결 안 됨")
    void standInMarkersAreNotConnected() throws IOException {
        copyTree(FixtureFiles.fixtureDir("../claude-home-off"), home);

        assertThat(flags(mounts("/home/fixture"))).containsExactly(false, false, false, false);
    }

    @Test
    @DisplayName("[NFR-15] 대역 표지는 그 항목만 연결 안 됨, 나머지는 연결됨")
    void standInMarkerAffectsOnlyThatItem() throws IOException {
        ClaudeHomeFixture.copyBasic(home, "/Users/someone/AojiStudio");
        Files.writeString(home.resolve(".claude").resolve("settings.json"), "{\"aojistudioStandIn\": true}");
        Files.writeString(home.resolve(".claude").resolve("projects").resolve(".aojistudio-stand-in"), "");

        assertThat(flags(mounts("/home/fixture"))).containsExactly(true, false, true, false);
    }

    @Test
    @DisplayName("[NFR-15] 없는 항목·파일 자리가 폴더인 항목·폴더 자리가 파일인 항목은 연결 안 됨")
    void missingOrWrongTypeIsNotConnected() throws IOException {
        ClaudeHomeFixture.copyBasic(home, "/Users/someone/AojiStudio");
        Files.delete(home.resolve(".claude.json"));
        Files.createDirectory(home.resolve(".claude.json"));
        Files.delete(home.resolve(".claude").resolve("settings.json"));
        deleteTree(home.resolve(".claude").resolve("plugins"));
        Files.writeString(home.resolve(".claude").resolve("plugins"), "not a folder");

        assertThat(flags(mounts("/home/fixture"))).containsExactly(false, false, false, true);
    }

    @Test
    @DisplayName("[NFR-07] 연결 안의 심볼릭 링크(파일·폴더·상위 폴더)는 따라가지 않아 연결 안 됨")
    void symlinksAreNotFollowed(@TempDir Path outside) throws IOException {
        ClaudeHomeFixture.copyBasic(home, "/Users/someone/AojiStudio");
        Files.writeString(outside.resolve("real.json"), "{}");
        Files.delete(home.resolve(".claude.json"));
        Files.createSymbolicLink(home.resolve(".claude.json"), outside.resolve("real.json"));
        deleteTree(home.resolve(".claude").resolve("plugins"));
        Files.createDirectory(outside.resolve("plugins"));
        Files.createSymbolicLink(home.resolve(".claude").resolve("plugins"), outside.resolve("plugins"));

        assertThat(flags(mounts("/home/fixture"))).containsExactly(false, true, false, true);

        // 상위 .claude 폴더가 링크면 그 아래 항목 모두 연결 안 됨
        Path realClaude = outside.resolve("dot-claude");
        Files.move(home.resolve(".claude"), realClaude);
        Files.createSymbolicLink(home.resolve(".claude"), realClaude);
        assertThat(flags(mounts("/home/fixture"))).containsExactly(false, false, false, false);
    }

    private static void copyTree(Path source, Path target) throws IOException {
        try (var walk = Files.walk(source)) {
            for (Path path : (Iterable<Path>) walk::iterator) {
                Path destination = target.resolve(source.relativize(path).toString());
                if (Files.isDirectory(path)) {
                    Files.createDirectories(destination);
                } else {
                    Files.createDirectories(destination.getParent());
                    Files.copy(path, destination);
                }
            }
        }
    }

    private static void deleteTree(Path root) throws IOException {
        try (var walk = Files.walk(root)) {
            for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }
}
