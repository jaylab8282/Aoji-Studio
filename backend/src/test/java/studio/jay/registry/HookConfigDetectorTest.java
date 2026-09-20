package studio.jay.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;

/**
 * hook 설정 여부 판정 (architecture.md §7.1, FR-014-AC3).
 */
class HookConfigDetectorTest {

    private static final String COLLECT_URL = "http://127.0.0.1:4180/hooks/events";

    @TempDir
    Path dir;

    private final HookConfigDetector detector = new HookConfigDetector(new ObjectMapper());

    private Path settingsFile() {
        return dir.resolve("settings.json");
    }

    private void write(String json) throws IOException {
        Files.writeString(settingsFile(), json, StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("[FR-014-AC3] http hook url 일치 → true")
    void matchingHttpHookUrlIsConfigured() throws IOException {
        write(
                """
                {
                  "hooks": {
                    "SessionStart": [
                      { "hooks": [ { "type": "http", "url": "http://127.0.0.1:4180/hooks/events", "headers": {}, "timeout": 3 } ] }
                    ]
                  }
                }
                """);

        assertThat(detector.isConfigured(settingsFile(), COLLECT_URL)).isTrue();
    }

    @Test
    @DisplayName("[FR-014-AC3] url 포트 다름 → false")
    void differentPortIsNotConfigured() throws IOException {
        write(
                """
                {
                  "hooks": {
                    "SessionStart": [
                      { "hooks": [ { "type": "http", "url": "http://127.0.0.1:9999/hooks/events", "headers": {}, "timeout": 3 } ] }
                    ]
                  }
                }
                """);

        assertThat(detector.isConfigured(settingsFile(), COLLECT_URL)).isFalse();
    }

    @Test
    @DisplayName("[FR-014-AC3] 파일 없음 → false")
    void missingFileIsNotConfigured() {
        assertThat(detector.isConfigured(settingsFile(), COLLECT_URL)).isFalse();
    }

    @Test
    @DisplayName("[FR-014-AC3] JSON 깨짐 → false")
    void malformedJsonIsNotConfigured() throws IOException {
        write("{ not valid json");

        assertThat(detector.isConfigured(settingsFile(), COLLECT_URL)).isFalse();
    }

    @Test
    @DisplayName("[FR-014-AC3] type command만 → false")
    void commandTypeOnlyIsNotConfigured() throws IOException {
        write(
                """
                {
                  "hooks": {
                    "SessionStart": [
                      { "hooks": [ { "type": "command", "command": "echo hi" } ] }
                    ]
                  }
                }
                """);

        assertThat(detector.isConfigured(settingsFile(), COLLECT_URL)).isFalse();
    }
}
