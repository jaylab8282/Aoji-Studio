package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static studio.aoji.legacy.LegacyTestSupport.write;

import java.io.IOException;
import java.nio.channels.SeekableByteChannel;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.OpenOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class HelperTokenReaderTest {

    private static final String SECRET = "s".repeat(64);

    @TempDir
    Path mount;

    @TempDir
    Path outside;

    private final HelperTokenReader reader = new HelperTokenReader();

    private Path dir() throws IOException {
        return Files.createDirectories(mount.resolve(".jaystudio"));
    }

    @Test
    @DisplayName("[NFR-07][ADR-57] 일반 파일 → 값(공백 제거)")
    void regularFile() throws IOException {
        write(dir().resolve("helper-token"), "abc123\n");

        HelperTokenReader.Outcome outcome = reader.read(dir().resolve("helper-token"), true);

        assertThat(outcome.token()).isEqualTo("abc123");
        assertThat(outcome.reason()).isNull();
    }

    @Test
    @DisplayName("[NFR-07][ADR-57] 없음 → 값도 사유도 없다")
    void missing() throws IOException {
        HelperTokenReader.Outcome outcome = reader.read(dir().resolve("helper-token"), true);

        assertThat(outcome.token()).isNull();
        assertThat(outcome.reason()).isNull();
    }

    @Test
    @DisplayName("[NFR-07][ADR-57] 심볼릭 링크 → 없음 + 사유, 링크 대상 값 미반환")
    void symlink() throws IOException {
        write(outside.resolve("secret"), SECRET);
        Files.createSymbolicLink(dir().resolve("helper-token"), outside.resolve("secret"));

        HelperTokenReader.Outcome outcome = reader.read(dir().resolve("helper-token"), true);

        assertThat(outcome.token()).isNull();
        assertThat(outcome.reason()).isEqualTo(LegacyWarnings.NotReadReason.SYMLINK);
    }

    @Test
    @DisplayName("[NFR-07][ADR-57] 디렉터리 → 없음 + 사유")
    void directory() throws IOException {
        Files.createDirectories(dir().resolve("helper-token"));

        HelperTokenReader.Outcome outcome = reader.read(dir().resolve("helper-token"), true);

        assertThat(outcome.token()).isNull();
        assertThat(outcome.reason()).isEqualTo(LegacyWarnings.NotReadReason.DIRECTORY);
    }

    @Test
    @DisplayName("[NFR-07][ADR-57] .jaystudio가 심볼릭 링크 → 폴백 안 함(없음 + 사유)")
    void parentSymlink() throws IOException {
        write(outside.resolve("real/helper-token"), SECRET);
        Files.createSymbolicLink(mount.resolve(".jaystudio"), outside.resolve("real"));

        HelperTokenReader.Outcome outcome = reader.read(mount.resolve(".jaystudio/helper-token"), true);

        assertThat(outcome.token()).isNull();
        assertThat(outcome.reason()).isEqualTo(LegacyWarnings.NotReadReason.PARENT_NOT_DIRECTORY);
    }

    @Test
    @DisplayName("[NFR-07][ADR-57] TOCTOU — 부모 확인 뒤·열기 전에 helper-token을 마운트 밖 링크로 바꿔도 → 없음 + 사유, 링크 대상 값 미반환")
    void toctouSwap() throws IOException {
        Path file = dir().resolve("helper-token");
        write(file, "original-token");
        write(outside.resolve("secret"), SECRET);
        HelperTokenReader swapping = new HelperTokenReader(Files::newByteChannel, p -> {
            try {
                Files.delete(p);
                Files.createSymbolicLink(p, outside.resolve("secret"));
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        });

        HelperTokenReader.Outcome outcome = swapping.read(file, true);

        assertThat(outcome.token()).isNull();
        assertThat(outcome.reason()).isEqualTo(LegacyWarnings.NotReadReason.SYMLINK);
        assertThat(outcome.toString()).doesNotContain(SECRET);
    }

    @Test
    @DisplayName("[NFR-07][ADR-57] 열기는 Files.newByteChannel에 READ와 NOFOLLOW_LINKS를 넘긴다")
    void openOptions() throws IOException {
        Path file = dir().resolve("helper-token");
        write(file, "tok");
        List<Set<? extends OpenOption>> seen = new ArrayList<>();
        HelperTokenReader capturing = new HelperTokenReader((path, options) -> {
            seen.add(options);
            SeekableByteChannel channel = Files.newByteChannel(path, options);
            return channel;
        }, p -> { });

        assertThat(capturing.read(file, true).token()).isEqualTo("tok");

        assertThat(seen).hasSize(1);
        assertThat(Set.<OpenOption>copyOf(seen.get(0))).isEqualTo(Set.<OpenOption>of(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS));
    }

    @Test
    @DisplayName("[NFR-07][ADR-57] 크기 상한 초과 → 없음 + 사유(UNREADABLE)")
    void tooLarge() throws IOException {
        write(dir().resolve("helper-token"), "x".repeat(HelperTokenReader.MAX_BYTES + 1));

        HelperTokenReader.Outcome outcome = reader.read(dir().resolve("helper-token"), true);

        assertThat(outcome.token()).isNull();
        assertThat(outcome.reason()).isEqualTo(LegacyWarnings.NotReadReason.UNREADABLE);
    }
}
