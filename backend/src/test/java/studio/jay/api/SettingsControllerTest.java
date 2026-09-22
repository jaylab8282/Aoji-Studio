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
            "hostPath", "agentCount", "skillCount", "writable", "formatErrorCount",
            "agentsDirMissing", "terminalApp", "defaultSessionCommand", "leadSessionCommandTemplate",
            "helperUrl", "collectUrl", "hookConfigured", "hookSettingsExample", "teamsPath", "trashPath",
            "retentionDays", "allowedHttpHookUrlsNote"
        };
        for (String field : requiredFields) {
            assertThat(body.has(field)).as("필드 %s가 있어야 한다", field).isTrue();
        }
    }

    @Test
    void hostPathEqualsEnvValueAndResponseExcludesContainerMountPath() throws Exception {
        // [FR-014-AC4][D-021] hostPath == JAYSTUDIO_HOST_PATH env 값. api-spec Settings에서
        // mountPath 필드가 제거되었으므로(D-021) 응답 본문 전체에 컨테이너 마운트 경로
        // (jaystudio.mount-path 값)가 없어야 하고, mountPath 키 자체도 없어야 한다.
        MvcResult result = mockMvc.perform(get("/api/settings").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();
        String responseBody = result.getResponse().getContentAsString();
        JsonNode body = objectMapper.readTree(responseBody);

        assertThat(body.get("hostPath").asString()).isEqualTo(HOST_PATH);
        assertThat(body.get("terminalApp").asString()).isEqualTo("macOS 기본 터미널");

        String mountPathValue = mountRoot.toString();
        assertThat(responseBody).as("응답 본문 전체에 컨테이너 마운트 경로 값이 없어야 한다").doesNotContain(mountPathValue);
        assertThat(body.has("mountPath")).as("mountPath 키 자체가 없어야 한다").isFalse();

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
