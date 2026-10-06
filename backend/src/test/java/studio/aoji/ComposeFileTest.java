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
 * compose.yaml 파싱 검증 (NFR-04·NFR-05·NFR-06, ADR-61). 저장소 루트의 compose.yaml을 직접 읽는다.
 */
class ComposeFileTest {

    private static Map<String, Object> service;
    private static String rawCompose;
    private static Map<String, Object> topVolumes;

    @BeforeAll
    @SuppressWarnings("unchecked")
    static void loadCompose() throws IOException {
        Path composePath = findComposeFile();
        rawCompose = Files.readString(composePath);
        Map<String, Object> root;
        try (InputStream in = Files.newInputStream(composePath)) {
            root = new Yaml().load(in);
        }
        Map<String, Object> services = (Map<String, Object>) root.get("services");
        service = (Map<String, Object>) services.get("aojistudio");
        topVolumes = (Map<String, Object>) root.get("volumes");
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

    @Test
    @DisplayName("[NFR-04][ADR-59] 서비스 aojistudio, 이미지 aojistudio:local")
    void serviceAndImageNames() {
        assertThat(service).isNotNull();
        assertThat(service.get("image")).isEqualTo("aojistudio:local");
    }

    @Test
    @DisplayName("[ADR-59] 데이터 볼륨 이름이 name: aojistudio-data 로 고정된다")
    @SuppressWarnings("unchecked")
    void dataVolumeNameIsPinned() {
        assertThat(topVolumes).containsKey("aojistudio-data");
        Map<String, Object> volume = (Map<String, Object>) topVolumes.get("aojistudio-data");
        assertThat(volume.get("name")).isEqualTo("aojistudio-data");
        assertThat((List<String>) service.get("volumes")).contains("aojistudio-data:/data");
    }

    @Test
    @DisplayName("[ADR-59] 서비스 볼륨 중 named volume은 aojistudio-data 하나뿐이다")
    @SuppressWarnings("unchecked")
    void onlyPinnedNamedVolumeIsUsed() {
        List<String> volumes = (List<String>) service.get("volumes");
        List<String> named = volumes.stream()
                .map(v -> v.split(":")[0])
                .filter(src -> !src.startsWith("/") && !src.startsWith(".") && !src.startsWith("$"))
                .toList();
        assertThat(named).containsExactly("aojistudio-data");
        assertThat(topVolumes.keySet()).containsExactly("aojistudio-data");
    }

    @Test
    @DisplayName("[NFR-05][ADR-61] environment 키는 AOJISTUDIO_* 5개와 TZ(architecture 4.1)뿐이다")
    @SuppressWarnings("unchecked")
    void environmentKeysAreExactlyTheDesignedSet() {
        Map<String, Object> env = (Map<String, Object>) service.get("environment");
        assertThat(env.keySet()).containsExactlyInAnyOrder(
                "AOJISTUDIO_HOST_PATH",
                "AOJISTUDIO_PUBLIC_PORT",
                "AOJISTUDIO_HELPER_URL",
                "AOJISTUDIO_MOUNT_PATH",
                "AOJISTUDIO_DATA_PATH",
                "TZ");
        assertThat(env.get("TZ")).isEqualTo("Asia/Seoul");
    }

    @Test
    @DisplayName("[NFR-05][ADR-61] 필수 값은 :? 로 누락 시 기동을 거부하고 선택 값은 설계 기본값을 쓴다")
    @SuppressWarnings("unchecked")
    void environmentValuesFollowDesign() {
        Map<String, Object> env = (Map<String, Object>) service.get("environment");
        assertThat((String) env.get("AOJISTUDIO_HOST_PATH")).startsWith("${AOJISTUDIO_HOST_PATH:?");
        assertThat((String) env.get("AOJISTUDIO_PUBLIC_PORT")).startsWith("${AOJISTUDIO_PORT:?");
        assertThat(env.get("AOJISTUDIO_HELPER_URL")).isEqualTo("${AOJISTUDIO_HELPER_URL:-http://127.0.0.1:4181}");
        assertThat(env.get("AOJISTUDIO_MOUNT_PATH")).isEqualTo("/workspace");
        assertThat(env.get("AOJISTUDIO_DATA_PATH")).isEqualTo("/data");
    }

    @Test
    @DisplayName("[NFR-04][NFR-05] ports는 127.0.0.1:${AOJISTUDIO_PORT:? 필수 치환으로 4180에 연결된다")
    @SuppressWarnings("unchecked")
    void portUsesRequiredSubstitution() {
        List<String> ports = (List<String>) service.get("ports");
        assertThat(ports).hasSize(1);
        assertThat(ports.get(0)).startsWith("127.0.0.1:${AOJISTUDIO_PORT:?").endsWith(":4180");
    }

    @Test
    @DisplayName("[NFR-05][NFR-06] 호스트 마운트는 ${AOJISTUDIO_HOST_PATH:? 필수 치환 하나이고 /workspace에 연결된다")
    @SuppressWarnings("unchecked")
    void hostMountUsesRequiredSubstitution() {
        List<String> volumes = (List<String>) service.get("volumes");
        List<String> hostMounts = volumes.stream().filter(v -> v.startsWith("${")).toList();
        assertThat(hostMounts).hasSize(1);
        assertThat(hostMounts.get(0)).startsWith("${AOJISTUDIO_HOST_PATH:?").endsWith(":/workspace");
    }

    @Test
    @DisplayName("[NFR-04] platform은 ${AOJISTUDIO_PLATFORM:-linux/arm64} 이다")
    void platformDefaultsToArm64() {
        assertThat(service.get("platform")).isEqualTo("${AOJISTUDIO_PLATFORM:-linux/arm64}");
    }

    @Test
    @DisplayName("[NFR-05] compose.yaml 환경 변수 참조는 AOJISTUDIO_ 접두뿐이고 중첩 기본값이 없다")
    void onlyAojistudioVariablesAreReferenced() {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\$\\{([A-Za-z0-9_]+)([^}]*)\\}").matcher(rawCompose);
        int found = 0;
        while (m.find()) {
            found++;
            assertThat(m.group(1)).as("참조 변수: " + m.group(0)).startsWith("AOJISTUDIO_");
            assertThat(m.group(2)).as("중첩 기본값 금지: " + m.group(0)).doesNotContain("${");
        }
        assertThat(found).isPositive();
    }
}
