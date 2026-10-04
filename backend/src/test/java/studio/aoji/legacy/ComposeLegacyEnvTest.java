package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/** compose.yaml의 옛 환경 변수 계층·중첩 기본값 검증 (NFR-05, ADR-56, architecture §11.2). */
class ComposeLegacyEnvTest {

    private static final Pattern OLD_NAME = Pattern.compile("(?i)jay[ _-]?studio");

    private static List<String> lines;
    private static Map<String, Object> environment;

    @BeforeAll
    @SuppressWarnings("unchecked")
    static void load() throws IOException {
        Path path = Files.exists(Path.of("..", "compose.yaml")) ? Path.of("..", "compose.yaml") : Path.of("compose.yaml");
        lines = Files.readAllLines(path);
        try (InputStream in = Files.newInputStream(path)) {
            Map<String, Object> root = new Yaml().load(in);
            Map<String, Object> service = (Map<String, Object>) ((Map<String, Object>) root.get("services")).get("aojistudio");
            environment = (Map<String, Object>) service.get("environment");
        }
    }

    @Test
    @DisplayName("[NFR-05][ADR-56] 새 이름과 옛 이름이 둘 다 서비스 environment로 통과한다")
    void passesBothNewAndLegacyNames() {
        assertThat(environment).containsEntry("AOJISTUDIO_HOST_PATH", "${AOJISTUDIO_HOST_PATH:-}");
        assertThat(environment).containsEntry("JAYSTUDIO_HOST_PATH", "${JAYSTUDIO_HOST_PATH:-}");
        assertThat(environment).containsEntry("AOJISTUDIO_PUBLIC_PORT", "${AOJISTUDIO_PORT:-}");
        assertThat(environment).containsEntry("JAYSTUDIO_PUBLIC_PORT", "${JAYSTUDIO_PORT:-}");
        assertThat(environment).containsEntry("AOJISTUDIO_HELPER_URL", "${AOJISTUDIO_HELPER_URL:-}");
        assertThat(environment).containsEntry("JAYSTUDIO_HELPER_URL", "${JAYSTUDIO_HELPER_URL:-}");
        assertThat(environment).containsEntry("AOJISTUDIO_MOUNT_PATH", "/workspace");
        assertThat(environment).containsEntry("AOJISTUDIO_DATA_PATH", "/data");
    }

    @Test
    @DisplayName("[NFR-05][ADR-56] platform·ports·마운트에 중첩 기본값이 있고 필수 누락 문구는 새 이름이다")
    void nestedDefaultsExist() {
        String text = String.join("\n", lines);
        assertThat(text).contains("${AOJISTUDIO_PLATFORM:-${JAYSTUDIO_PLATFORM:-linux/arm64}}");
        assertThat(text).contains("127.0.0.1:${AOJISTUDIO_PORT:-${JAYSTUDIO_PORT:?AOJISTUDIO_PORT를 .env에 설정하세요}}:4180");
        assertThat(text).contains(
                "${AOJISTUDIO_HOST_PATH:-${JAYSTUDIO_HOST_PATH:?AOJISTUDIO_HOST_PATH를 .env에 설정하세요}}:/workspace");
    }

    @Test
    @DisplayName("[ADR-56][ADR-52] 옛 이름이 든 줄마다 '# LEGACY v1.0.x' 표식이 있다")
    void everyLegacyNameLineIsMarked() {
        List<String> offenders = lines.stream()
                .filter(l -> OLD_NAME.matcher(l).find())
                .filter(l -> !l.contains("# LEGACY v1.0.x"))
                .toList();
        assertThat(offenders).isEmpty();
        assertThat(lines.stream().filter(l -> OLD_NAME.matcher(l).find()).count()).isGreaterThanOrEqualTo(6);
    }
}
