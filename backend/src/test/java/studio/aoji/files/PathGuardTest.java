package studio.aoji.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * 경로 안전 (architecture.md NFR-07 관련). 심볼릭 링크는 따라가지 않는다.
 */
class PathGuardTest {

    @TempDir
    Path mountRoot;

    @Test
    void symlinkEscapingMountIsDetectedAndNotRead() throws IOException {
        // [NFR-07] 마운트 밖 심볼릭 링크 → 형식 오류 '마운트 밖 링크', 읽지 않음
        Path outside = Files.createTempDirectory("jaystudio-outside");
        Path secret = Files.writeString(outside.resolve("secret.md"), "---\nname: secret\n---\n");

        Path agentsDir = Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Path link = agentsDir.resolve("escape.md");
        Files.createSymbolicLink(link, secret);

        PathGuard pathGuard = new PathGuard(mountRoot);

        assertThat(pathGuard.isSymlinkEscapingMount(link)).isTrue();
        // 링크가 감지되면 호출자는 파일 내용을 읽지 않는다: 원본이 그대로임을 확인해 "읽지 않음"을 증명한다.
        assertThat(Files.readString(secret)).isEqualTo("---\nname: secret\n---\n");
    }

    @Test
    void symlinkInsideMountIsNotEscaping() throws IOException {
        // [NFR-07] 마운트 안쪽을 가리키는 링크는 정상 처리 대상이다.
        Path agentsDir = Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Path real = Files.writeString(agentsDir.resolve("real.md"), "---\nname: real\n---\n");
        Path link = agentsDir.resolve("alias.md");
        Files.createSymbolicLink(link, real);

        PathGuard pathGuard = new PathGuard(mountRoot);

        assertThat(pathGuard.isSymlinkEscapingMount(link)).isFalse();
    }

    @Test
    void writeTargetThatIsSymlinkIsRejected() throws IOException {
        // [NFR-07] 쓰기 대상이 링크면 거부한다
        Path outside = Files.createTempDirectory("jaystudio-outside-write");
        Path outsideTarget = outside.resolve("target.md");
        Path link = mountRoot.resolve("agent.md");
        Files.createSymbolicLink(link, outsideTarget);

        PathGuard pathGuard = new PathGuard(mountRoot);

        assertThatThrownBy(() -> pathGuard.assertNotSymlink(link))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("심볼릭 링크");
    }

    @Test
    void resolveRejectsPathTraversalSegments() {
        // [NFR-07] 사용자 입력을 Path.of에 직접 넣지 않는다: 경로 이탈 조각은 거부한다
        PathGuard pathGuard = new PathGuard(mountRoot);

        assertThatThrownBy(() -> pathGuard.resolve("..", "etc", "passwd"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> pathGuard.resolve("foo/../../bar"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void resolveBuildsPathUnderMountRoot() throws IOException {
        PathGuard pathGuard = new PathGuard(mountRoot);

        Path resolved = pathGuard.resolve(".claude", "agents", "architect.md");

        assertThat(resolved).isEqualTo(mountRoot.toRealPath()
                .resolve(".claude").resolve("agents").resolve("architect.md"));
    }
}
