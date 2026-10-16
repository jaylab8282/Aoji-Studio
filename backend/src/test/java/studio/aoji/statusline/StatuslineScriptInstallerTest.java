package studio.aoji.statusline;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import studio.aoji.collect.CollectTokenStore;
import studio.aoji.files.AtomicFileWriter;
import studio.aoji.files.DataDirectory;

/** 기동 때 {@code .aojistudio/statusline.mjs} 배치 (ADR-83 결정 1). 실제 {@code .aojistudio}는 쓰지 않는다. */
class StatuslineScriptInstallerTest {

    @TempDir
    Path mount;

    @TempDir
    Path outside;

    private Path data;

    private byte[] resource() throws IOException {
        return new ClassPathResource("statusline/aojistudio-statusline.mjs").getInputStream().readAllBytes();
    }

    private void install() {
        DataDirectory directory = DataDirectory.resolved(mount);
        data = directory.path();
        new StatuslineScriptInstaller(directory, new AtomicFileWriter(), tokenStore(directory)).install();
    }

    private static CollectTokenStore tokenStore(DataDirectory directory) {
        return new CollectTokenStore(directory);
    }

    @AfterEach
    void restore() throws IOException {
        if (data != null && Files.exists(data)) {
            Files.setPosixFilePermissions(data, PosixFilePermissions.fromString("rwxr-xr-x"));
        }
    }

    @Test
    @DisplayName("리소스 = helper 원본과 바이트 동일(빌드가 복사한다)")
    void resourceIsHelperSource() throws IOException {
        assertThat(resource()).isEqualTo(Files.readAllBytes(Path.of("..", "helper", "aojistudio-statusline.mjs")));
        assertThat(new String(resource(), StandardCharsets.UTF_8)).contains("--send");
    }

    @Test
    @DisplayName("없으면 .aojistudio/statusline.mjs = 리소스 바이트로 만든다(데이터 폴더가 아직 없어도)")
    void createsFileWhenMissing() throws IOException {
        Files.createDirectories(mount.resolve(".aojistudio"));

        install();

        assertThat(Files.readAllBytes(data.resolve("statusline.mjs"))).isEqualTo(resource());
    }

    @Test
    @DisplayName("내용이 다르면 리소스로 교체한다, 같으면 다시 쓰지 않는다(mtime 불변)")
    void replacesDifferentAndSkipsIdentical() throws IOException {
        Files.createDirectories(mount.resolve(".aojistudio"));
        Path target = mount.resolve(".aojistudio/statusline.mjs");
        Files.writeString(target, "old script");

        install();
        assertThat(Files.readAllBytes(target)).isEqualTo(resource());

        FileTime marker = FileTime.from(Instant.parse("2020-01-01T00:00:00Z"));
        Files.setLastModifiedTime(target, marker);
        install();
        assertThat(Files.getLastModifiedTime(target)).as("같으면 쓰지 않는다").isEqualTo(marker);
        try (var listing = Files.list(data)) {
            assertThat(listing.map(path -> path.getFileName().toString()).filter(name -> name.endsWith(".tmp")))
                    .as("임시 파일이 남지 않는다").isEmpty();
        }
    }

    @Test
    @DisplayName("읽기 전용 → 쓰지 않고(예외 없이) 기동, 이미 있던 파일은 그대로")
    void readOnlyDoesNotWriteAndDoesNotFail() throws IOException {
        Files.createDirectories(mount.resolve(".aojistudio"));
        Path target = mount.resolve(".aojistudio/statusline.mjs");
        Files.writeString(target, "existing script");
        Files.setPosixFilePermissions(mount.resolve(".aojistudio"), PosixFilePermissions.fromString("r-xr-xr-x"));
        assertThat(Files.isWritable(mount.resolve(".aojistudio"))).as("root 실행 등으로 쓰기 차단이 안 되는 환경").isFalse();

        install();

        assertThat(Files.readString(target)).isEqualTo("existing script");
    }

    @Test
    @DisplayName("대상이 심볼릭 링크면 따라가 쓰지 않는다(NFR-07)")
    void symlinkTargetIsNotWritten() throws IOException {
        Files.createDirectories(mount.resolve(".aojistudio"));
        Path outsideFile = outside.resolve("victim.mjs");
        Files.writeString(outsideFile, "victim");
        Files.createSymbolicLink(mount.resolve(".aojistudio/statusline.mjs"), outsideFile);

        install();

        assertThat(Files.readString(outsideFile)).isEqualTo("victim");
    }
}
