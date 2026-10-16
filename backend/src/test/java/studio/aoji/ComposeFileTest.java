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

    /** volumes 항목을 검사용 문자열로 편다. 문자열 항목은 그대로, long syntax(map)는 type/source/target을 합친다. */
    @SuppressWarnings("unchecked")
    private static List<Object> volumeEntries() {
        return (List<Object>) service.get("volumes");
    }

    private static String flat(Object entry) {
        if (entry instanceof String text) {
            return text;
        }
        Map<String, Object> map = (Map<String, Object>) entry;
        return map.get("type") + " " + map.get("source") + ":" + map.get("target");
    }

    private static List<String> flatVolumes() {
        return volumeEntries().stream().map(ComposeFileTest::flat).toList();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> claudeBinds() {
        return volumeEntries().stream()
                .filter(v -> v instanceof Map)
                .map(v -> (Map<String, Object>) v)
                .toList();
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
        List<String> volumes = flatVolumes();
        assertThat(volumes).isNotEmpty();
        assertThat(volumes).noneMatch(v -> v.contains("docker.sock"));
    }

    @Test
    @DisplayName("[NFR-06] 문자열·map 모든 volumes 항목에 0.0.0.0·docker.sock이 없고 호스트 경로는 AOJISTUDIO_ 변수나 저장소 상대 경로뿐이다")
    void everyVolumeEntryStaysInsideAllowedHostPaths() {
        List<Object> entries = volumeEntries();
        assertThat(entries).hasSize(6);
        for (Object entry : entries) {
            String text = flat(entry);
            assertThat(text).doesNotContain("0.0.0.0").doesNotContain("docker.sock");
            String source = entry instanceof Map<?, ?> m ? String.valueOf(m.get("source")) : text.split(":")[0];
            assertThat(source)
                    .as("호스트 경로 출처: " + text)
                    .matches(src -> src.startsWith("${AOJISTUDIO_") || src.startsWith("./tools/") || src.equals("aojistudio-data"));
            assertThat(source).doesNotStartWith("/").doesNotStartWith("~");
        }
    }

    @Test
    @DisplayName("[NFR-06][NFR-15] 전역 Claude 설정 bind 4개는 long syntax·read_only: true·create_host_path: false이고 대상 경로가 정확히 4개다")
    @SuppressWarnings("unchecked")
    void claudeConfigBindsAreReadOnlyAndNeverCreateHostPath() {
        List<Map<String, Object>> binds = claudeBinds();
        assertThat(binds).hasSize(4);
        for (Map<String, Object> bind : binds) {
            assertThat(bind.get("type")).isEqualTo("bind");
            assertThat(bind.get("read_only")).isEqualTo(Boolean.TRUE);
            Map<String, Object> bindOptions = (Map<String, Object>) bind.get("bind");
            assertThat(bindOptions).isNotNull();
            assertThat(bindOptions.get("create_host_path")).isEqualTo(Boolean.FALSE);
        }
        assertThat(binds.stream().map(b -> (String) b.get("target")).toList()).containsExactlyInAnyOrder(
                "/claude-home/.claude.json",
                "/claude-home/.claude/settings.json",
                "/claude-home/.claude/plugins",
                "/claude-home/.claude/projects");
    }

    @Test
    @DisplayName("[NFR-06][NFR-15] .credentials·~/.claude 전체·홈 연결 줄이 volumes에 없다")
    void noCredentialsOrWholeClaudeHomeMount() {
        for (String text : flatVolumes()) {
            assertThat(text).doesNotContain(".credentials");
            assertThat(text).doesNotContain("~");
            assertThat(text).doesNotContain(":/claude-home ").doesNotEndWith(":/claude-home").doesNotEndWith(":/claude-home/.claude");
        }
        for (Map<String, Object> bind : claudeBinds()) {
            assertThat((String) bind.get("target")).startsWith("/claude-home/.claude");
            assertThat((String) bind.get("source")).doesNotContain(".credentials");
        }
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
        assertThat(flatVolumes()).contains("aojistudio-data:/data");
    }

    @Test
    @DisplayName("[ADR-59] 서비스 볼륨 중 named volume은 aojistudio-data 하나뿐이다")
    @SuppressWarnings("unchecked")
    void onlyPinnedNamedVolumeIsUsed() {
        List<String> named = volumeEntries().stream()
                .filter(v -> v instanceof String)
                .map(v -> ((String) v).split(":")[0])
                .filter(src -> !src.startsWith("/") && !src.startsWith(".") && !src.startsWith("$"))
                .toList();
        assertThat(named).containsExactly("aojistudio-data");
        assertThat(topVolumes.keySet()).containsExactly("aojistudio-data");
    }

    @Test
    @DisplayName("[NFR-05][ADR-61] environment 키는 AOJISTUDIO_* 8개와 TZ뿐이다")
    @SuppressWarnings("unchecked")
    void environmentKeysAreExactlyTheDesignedSet() {
        Map<String, Object> env = (Map<String, Object>) service.get("environment");
        assertThat(env.keySet()).containsExactlyInAnyOrder(
                "AOJISTUDIO_HOST_PATH",
                "AOJISTUDIO_PUBLIC_PORT",
                "AOJISTUDIO_HELPER_URL",
                "AOJISTUDIO_MOUNT_PATH",
                "AOJISTUDIO_DATA_PATH",
                "AOJISTUDIO_HOST_OS",
                "AOJISTUDIO_WSL_DISTRO",
                "AOJISTUDIO_CLAUDE_HOME_HOST",
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
        List<String> hostMounts = volumeEntries().stream()
                .filter(v -> v instanceof String)
                .map(v -> (String) v)
                .filter(v -> v.startsWith("${"))
                .toList();
        assertThat(hostMounts).hasSize(1);
        assertThat(hostMounts.get(0)).startsWith("${AOJISTUDIO_HOST_PATH:?").endsWith(":/workspace");
    }

    @Test
    @DisplayName("[NFR-04] platform은 ${AOJISTUDIO_PLATFORM:-linux/arm64} 이다")
    void platformDefaultsToArm64() {
        assertThat(service.get("platform")).isEqualTo("${AOJISTUDIO_PLATFORM:-linux/arm64}");
    }

    @Test
    @DisplayName("[NFR-05] compose.yaml 환경 변수 참조는 AOJISTUDIO_ 접두뿐이고 중첩 기본값은 Claude bind _SRC뿐이다")
    void onlyAojistudioVariablesAreReferenced() {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\$\\{([A-Za-z0-9_]+)([^}]*)\\}").matcher(rawCompose);
        int found = 0;
        while (m.find()) {
            found++;
            assertThat(m.group(1)).as("참조 변수: " + m.group(0)).startsWith("AOJISTUDIO_");
            // 중첩 기본값은 전역 Claude 설정 bind 출처(AOJISTUDIO_CLAUDE_*_SRC)에만 허용한다.
            if (!m.group(1).matches("AOJISTUDIO_CLAUDE_[A-Z]+_SRC")) {
                assertThat(m.group(2)).as("중첩 기본값 금지: " + m.group(0)).doesNotContain("${");
            }
        }
        assertThat(found).isPositive();
    }
}
