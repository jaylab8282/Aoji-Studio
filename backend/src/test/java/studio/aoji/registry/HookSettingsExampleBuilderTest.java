package studio.aoji.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * hook 설정 예시 생성 (architecture.md §7.1, FR-014-AC2, FR-003-AC8·AC9).
 */
class HookSettingsExampleBuilderTest {

    private static final String COLLECT_URL = "http://127.0.0.1:4180/hooks/events";
    private static final String COLLECT_TOKEN = "t".repeat(64);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HookSettingsExampleBuilder builder = new HookSettingsExampleBuilder(objectMapper);

    @Test
    @DisplayName("[FR-014-AC2][FR-003-AC8][FR-003-AC9] JSON 파싱 가능, 키 12개 정확히,"
            + " 각 type http · url = collectUrl · headers.X-JayStudio-Collect-Token = 토큰 · timeout 3")
    void buildProducesParsableJsonWithExactTwelveEventsAndFields() {
        String json = builder.build(COLLECT_URL, COLLECT_TOKEN);

        JsonNode root = objectMapper.readTree(json);
        JsonNode hooks = root.get("hooks");
        assertThat(hooks).isNotNull();
        assertThat(hooks.isObject()).isTrue();

        List<String> keys = new ArrayList<>(hooks.propertyNames());
        assertThat(keys)
                .containsExactly(
                        "SessionStart",
                        "SessionEnd",
                        "UserPromptSubmit",
                        "Stop",
                        "PreToolUse",
                        "PostToolUse",
                        "PostToolUseFailure",
                        "PermissionRequest",
                        "PermissionDenied",
                        "Notification",
                        "SubagentStart",
                        "SubagentStop");

        for (String event : keys) {
            JsonNode entries = hooks.get(event);
            assertThat(entries.isArray()).isTrue();
            assertThat(entries.size()).isEqualTo(1);
            JsonNode hookList = entries.get(0).get("hooks");
            assertThat(hookList.isArray()).isTrue();
            assertThat(hookList.size()).isEqualTo(1);

            JsonNode hook = hookList.get(0);
            assertThat(hook.get("type").asString()).isEqualTo("http");
            assertThat(hook.get("url").asString()).isEqualTo(COLLECT_URL);
            assertThat(hook.get("headers").get("X-JayStudio-Collect-Token").asString())
                    .isEqualTo(COLLECT_TOKEN);
            assertThat(hook.get("timeout").asInt()).isEqualTo(3);
        }
    }

    @Test
    @DisplayName("[FR-014-AC2] 예시를 fixture settings.json으로 쓰면 hookConfigured true")
    void writtenExampleMakesHookConfigDetectorTrue(@TempDir Path dir) throws IOException {
        String json = builder.build(COLLECT_URL, COLLECT_TOKEN);
        Path settingsJson = dir.resolve("settings.json");
        Files.writeString(settingsJson, json, StandardCharsets.UTF_8);

        HookConfigDetector detector = new HookConfigDetector(objectMapper);
        assertThat(detector.isConfigured(settingsJson, COLLECT_URL)).isTrue();
    }

    @Test
    @DisplayName("[FR-014-AC2][D-020] architecture.md §7.1 예시와 줄 단위로 같은 서식"
            + "(콜론 뒤 공백만 · 들여쓰기 2칸 · 이벤트 하나당 한 줄, 토큰·URL 자리만 치환)")
    void buildMatchesArchitectureSection71LineByLine() {
        String json = builder.build(COLLECT_URL, COLLECT_TOKEN);
        List<String> actualLines = List.of(json.split("\n", -1));

        List<String> events = List.of(
                "SessionStart",
                "SessionEnd",
                "UserPromptSubmit",
                "Stop",
                "PreToolUse",
                "PostToolUse",
                "PostToolUseFailure",
                "PermissionRequest",
                "PermissionDenied",
                "Notification",
                "SubagentStart",
                "SubagentStop");

        List<String> expectedLines = new ArrayList<>();
        expectedLines.add("{");
        expectedLines.add("  \"hooks\": {");
        for (int i = 0; i < events.size(); i++) {
            String comma = i < events.size() - 1 ? "," : "";
            expectedLines.add("    \"" + events.get(i) + "\": [{ \"hooks\": [{ \"type\": \"http\", \"url\": \""
                    + COLLECT_URL + "\", \"headers\": { \"X-JayStudio-Collect-Token\": \"" + COLLECT_TOKEN
                    + "\" }, \"timeout\": 3 }] }]" + comma);
        }
        expectedLines.add("  }");
        expectedLines.add("}");

        assertThat(actualLines).containsExactlyElementsOf(expectedLines);
    }
}
