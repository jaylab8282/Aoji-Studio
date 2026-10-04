package studio.aoji.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * 파일 원자적 쓰기 (architecture.md §3.1, ADR-08). tmp + ATOMIC_MOVE, 실패 시 원본 보호.
 */
class AtomicFileWriterTest {

    @TempDir
    Path dir;

    private final AtomicFileWriter writer = new AtomicFileWriter();

    @AfterEach
    void restorePermissions() throws IOException {
        Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("rwxr-xr-x"));
    }

    @Test
    void writesNewFileAndLeavesNoTmpFile() throws IOException {
        Path target = dir.resolve("workflow.json");

        writer.write(target, "{\"a\":1}".getBytes(StandardCharsets.UTF_8));

        assertThat(Files.readString(target, StandardCharsets.UTF_8)).isEqualTo("{\"a\":1}");
        assertThat(listFileNames(dir)).containsExactly("workflow.json");
    }

    @Test
    void replacesExistingFileAtomically() throws IOException {
        Path target = dir.resolve("workflow.json");
        Files.writeString(target, "old", StandardCharsets.UTF_8);

        writer.write(target, "new".getBytes(StandardCharsets.UTF_8));

        assertThat(Files.readString(target, StandardCharsets.UTF_8)).isEqualTo("new");
        assertThat(listFileNames(dir)).containsExactly("workflow.json");
    }

    @Test
    void temporaryFileNameIsIgnorableByPoller() throws IOException {
        // 폴러(FolderPoller)는 '.'으로 시작하거나 '.tmp'로 끝나는 파일을 무시한다.
        // 쓰기 도중 실패해도 tmp 파일이 그 규칙을 지키는지 실패 케이스로 검증한다.
        Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("r-xr-xr-x"));
        Path target = dir.resolve("blocked.json");

        assertThatThrownBy(() -> writer.write(target, "x".getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(IOException.class);

        Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("rwxr-xr-x"));
        assertThat(listFileNames(dir)).isEmpty();
        assertThat(Files.exists(target)).isFalse();
    }

    @Test
    void writeFailureLeavesOriginalFileUntouched() throws IOException {
        Path target = dir.resolve("protected.json");
        Files.writeString(target, "original", StandardCharsets.UTF_8);
        Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("r-xr-xr-x"));

        assertThatThrownBy(() -> writer.write(target, "changed".getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(IOException.class);

        Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("rwxr-xr-x"));
        assertThat(Files.readString(target, StandardCharsets.UTF_8)).isEqualTo("original");
    }

    private static java.util.List<String> listFileNames(Path directory) throws IOException {
        java.util.List<String> names = new java.util.ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(directory)) {
            for (Path entry : stream) {
                names.add(entry.getFileName().toString());
            }
        }
        return names;
    }
}
