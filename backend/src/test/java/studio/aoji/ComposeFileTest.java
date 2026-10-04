package studio.aoji;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * compose.yaml 파싱 검증 (NFR-04·NFR-06). 저장소 루트의 compose.yaml을 직접 읽는다.
 */
class ComposeFileTest {

    private static Map<String, Object> service;

    @BeforeAll
    @SuppressWarnings("unchecked")
    static void loadCompose() throws IOException {
        Path composePath = findComposeFile();
        Map<String, Object> root;
        try (InputStream in = Files.newInputStream(composePath)) {
            root = new Yaml().load(in);
        }
        Map<String, Object> services = (Map<String, Object>) root.get("services");
        service = (Map<String, Object>) services.get("jaystudio");
    }

    private static Path findComposeFile() {
        // Gradle은 backend/ 를 작업 디렉터리로 테스트를 실행한다.
        Path fromModule = Path.of("..", "compose.yaml").normalize();
        if (Files.exists(fromModule)) {
            return fromModule;
        }
        Path fromRoot = Path.of("compose.yaml");
        if (Files.exists(fromRoot)) {
            return fromRoot;
        }
        throw new IllegalStateException("compose.yaml을 찾을 수 없습니다: " + fromModule.toAbsolutePath());
    }

    @Test
    @DisplayName("[NFR-04] ports가 127.0.0.1: 로 시작한다")
    @SuppressWarnings("unchecked")
    void portsBindToLoopbackOnly() {
        List<String> ports = (List<String>) service.get("ports");
        assertThat(ports).isNotEmpty();
        for (String portMapping : ports) {
            assertThat(portMapping).as("port mapping: " + portMapping).startsWith("127.0.0.1:");
            assertThat(portMapping).doesNotContain("0.0.0.0");
        }
    }

    @Test
    @DisplayName("[NFR-06] docker.sock 마운트가 없다")
    @SuppressWarnings("unchecked")
    void noDockerSocketMount() {
        List<String> volumes = (List<String>) service.get("volumes");
        assertThat(volumes).isNotEmpty();
        assertThat(volumes).noneMatch(v -> v.contains("docker.sock"));
    }

    @Test
    @DisplayName("[NFR-06] privileged가 설정되어 있지 않다")
    void noPrivilegedFlag() {
        assertThat(service).doesNotContainKey("privileged");
    }

    @Test
    @DisplayName("[NFR-06] user는 1000:1000 이다")
    void runsAsNonRootUser() {
        assertThat(service.get("user")).isEqualTo("1000:1000");
    }
}
