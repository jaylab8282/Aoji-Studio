package studio.jay.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import studio.jay.registry.RegistryService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 07 설정 값 (api-spec {@code GET /api/settings}, FR-014, FR-013).
 */
@SpringBootTest
@AutoConfigureMockMvc
class SettingsControllerTest {

    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";
    private static final String HOST_PATH = "/Users/jaybee/Desktop/JayStudio";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    RegistryService registryService;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("jaystudio.host-path", () -> HOST_PATH);
        registry.add("jaystudio.public-port", () -> "4180");
        registry.add("jaystudio.mount-path", () -> mountRoot.toString());
        registry.add("jaystudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @BeforeEach
    void createAgentsDir() throws Exception {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        registryService.rescanNow();
    }

    private JsonNode getSettings() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/settings").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    @Test
    void settingsContainsAllRequiredFields() throws Exception {
        // [FR-014-AC4] Settings 스키마 필수 필드가 모두 응답에 있음
        JsonNode body = getSettings();

        String[] requiredFields = {
            "hostPath", "mountPath", "agentCount", "skillCount", "writable", "formatErrorCount",
            "agentsDirMissing", "terminalApp", "defaultSessionCommand", "leadSessionCommandTemplate",
            "helperUrl", "collectUrl", "hookConfigured", "hookSettingsExample", "teamsPath", "trashPath",
            "retentionDays", "allowedHttpHookUrlsNote"
        };
        for (String field : requiredFields) {
            assertThat(body.has(field)).as("필드 %s가 있어야 한다", field).isTrue();
        }
    }

    @Test
    void hostPathEqualsEnvValueAndUiDisplayedFieldsExcludeMountPath() throws Exception {
        // [FR-014-AC4][D-020] FR-014-AC4는 "표시" 요건이다: hostPath는 env(JAYSTUDIO_HOST_PATH) 값
        // 그대로이고, UI(ui-spec SCR-07)가 실제로 보여주는 값들에는 컨테이너 마운트 경로가 섞이지 않는다.
        // mountPath 자체는 api-spec 계약대로 설정값을 그대로 담아 반환한다(D-020) — 응답 전체에 특정
        // 문자열이 없다고 주장하는 거짓 보증은 하지 않는다.
        JsonNode body = getSettings();

        assertThat(body.get("hostPath").asString()).isEqualTo(HOST_PATH);
        assertThat(body.get("terminalApp").asString()).isEqualTo("macOS 기본 터미널");

        // mountPath는 계약대로 설정값(여기서는 @TempDir 경로) 그대로 반환된다.
        String mountPathValue = mountRoot.toString();
        assertThat(body.get("mountPath").asString()).isEqualTo(mountPathValue);

        // UI에 실제로 표시되는 값들(ui-spec SCR-07)에는 mountPath 값이 섞이지 않는다.
        assertThat(body.get("hostPath").asString()).doesNotContain(mountPathValue);
        assertThat(body.get("defaultSessionCommand").asString()).doesNotContain(mountPathValue);
        assertThat(body.get("leadSessionCommandTemplate").asString()).doesNotContain(mountPathValue);
        assertThat(body.get("teamsPath").asString()).doesNotContain(mountPathValue);
        assertThat(body.get("trashPath").asString()).doesNotContain(mountPathValue);
        assertThat(body.get("collectUrl").asString()).doesNotContain(mountPathValue);
        assertThat(body.get("hookSettingsExample").asString()).doesNotContain(mountPathValue);

        // [FR-014-AC4] GET /api/state의 Config와 같은 값 (한 곳에서 조립해 두 API가 공유)
        MvcResult stateResult = mockMvc.perform(get("/api/state").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode stateConfig = objectMapper
                .readTree(stateResult.getResponse().getContentAsString())
                .get("config");
        assertThat(body.get("hostPath").asString()).isEqualTo(stateConfig.get("hostPath").asString());
        assertThat(body.get("helperUrl").asString()).isEqualTo(stateConfig.get("helperUrl").asString());
        assertThat(body.get("collectUrl").asString()).isEqualTo(stateConfig.get("collectUrl").asString());
        assertThat(body.get("defaultSessionCommand").asString())
                .isEqualTo(stateConfig.get("defaultSessionCommand").asString());
    }

    @Test
    void settingsIncludesBothSessionCommands() throws Exception {
        // [FR-013-AC5] GET /api/settings에 두 명령 포함
        JsonNode body = getSettings();

        assertThat(body.get("defaultSessionCommand").asString())
                .isEqualTo("cd \"" + HOST_PATH + "\" && claude");
        assertThat(body.get("leadSessionCommandTemplate").asString())
                .isEqualTo("cd \"" + HOST_PATH + "\" && claude --agent <팀장 name>");
    }

    @Test
    void gettingSettingsDoesNotModifySettingsJsonFile() throws Exception {
        // [FR-014-AC1] GET /api/settings 호출 후 fixture settings.json mtime 불변
        Path settingsJson = mountRoot.resolve(".claude").resolve("settings.json");
        Files.writeString(
                settingsJson,
                """
                { "hooks": {} }
                """,
                StandardCharsets.UTF_8);
        FileTime before = Files.getLastModifiedTime(settingsJson);
        String contentBefore = Files.readString(settingsJson, StandardCharsets.UTF_8);

        getSettings();

        FileTime after = Files.getLastModifiedTime(settingsJson);
        String contentAfter = Files.readString(settingsJson, StandardCharsets.UTF_8);
        assertThat(after).isEqualTo(before);
        assertThat(contentAfter).isEqualTo(contentBefore);
    }
}
