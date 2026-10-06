package studio.aoji.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static studio.aoji.support.MountTestSupport.fingerprint;
import static studio.aoji.support.MountTestSupport.start;
import static studio.aoji.support.MountTestSupport.write;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** 데이터 폴더 {@code .aojistudio/} 판정(상태 F, NOFOLLOW_LINKS, NFR-07, FR-001-AC6). */
class DataDirectoryTest {

    @TempDir
    Path mount;

    @TempDir
    Path outside;

    @TempDir
    Path data;

    @Test
    @DisplayName("[NFR-07][FR-001-AC6] .aojistudio가 링크(마운트 안·밖)·일반 파일 → 기동 실패, 불변, 메시지에 링크 대상 경로 0건")
    void stateF() throws IOException {
        Path inside = Files.createDirectories(mount.resolve("insideTarget"));
        Path outsideDir = Files.createDirectories(outside.resolve("outsideTarget"));
        for (String kind : new String[] {"inside", "outside", "file"}) {
            Path aoji = mount.resolve(".aojistudio");
            if (Files.exists(aoji, LinkOption.NOFOLLOW_LINKS)) {
                Files.delete(aoji);
            }
            switch (kind) {
                case "inside" -> Files.createSymbolicLink(aoji, inside);
                case "outside" -> Files.createSymbolicLink(aoji, outsideDir);
                default -> write(aoji, "plain file");
            }
            Map<String, String> before = fingerprint(mount);

            assertThatThrownBy(() -> DataDirectory.resolved(mount)).as(kind)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining(".aojistudio")
                    .hasMessageNotContaining("insideTarget")
                    .hasMessageNotContaining("outsideTarget");
            assertThat(fingerprint(mount)).isEqualTo(before);
        }
    }

    @Test
    @DisplayName("[NFR-07][FR-001-AC6] 기동 판정은 부수 파일을 만들지 않는다 - 빈 마운트·.aojistudio 있는 마운트 모두 불변")
    void noSideFiles() throws IOException {
        DataDirectory empty = DataDirectory.resolved(mount);
        assertThat(fingerprint(mount)).isEmpty();
        assertThat(empty.name()).isEqualTo(".aojistudio");

        write(mount.resolve(".aojistudio/teams/a.json"), "{}");
        Map<String, String> before = fingerprint(mount);
        DataDirectory.resolved(mount);

        assertThat(fingerprint(mount)).isEqualTo(before);
        try (Stream<Path> s = Files.list(mount)) {
            assertThat(s.count()).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("[NFR-07][FR-001-AC6] .aojistudio가 심볼릭 링크(상태 F) → 컨텍스트 기동 실패, 메시지에 링크 대상 경로 없음")
    void aojistudioSymlinkFailsContextStartup() throws Exception {
        Path target = Files.createDirectories(mount.resolve("linkTargetDir"));
        Files.createSymbolicLink(mount.resolve(".aojistudio"), target);
        Map<String, String> before = fingerprint(mount);

        assertThatThrownBy(() -> start(mount, data).close())
                .hasStackTraceContaining("심볼릭 링크")
                .satisfies(e -> assertThat(rootMessage(e)).doesNotContain("linkTargetDir"));
        assertThat(fingerprint(mount)).isEqualTo(before);
        assertThat(List.of(mount.toFile().list())).doesNotContain("collect-token");
    }

    private static String rootMessage(Throwable t) {
        Throwable cursor = t;
        while (cursor.getCause() != null) {
            cursor = cursor.getCause();
        }
        return String.valueOf(cursor.getMessage());
    }
}
